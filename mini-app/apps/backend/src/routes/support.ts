import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import '@fastify/multipart';
import { authenticate, adminOnly, getAllAdminTelegramIds, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../lib/websocket-manager.js';
import { telegramApi } from '../lib/telegram-api.js';
import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

const MAX_UPLOAD_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const MAX_UPLOAD_FILES_COUNT = 5;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function getUploadsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../frontend/public/uploads'),
    path.resolve(process.cwd(), 'apps/frontend/public/uploads'),
    path.resolve(process.cwd(), 'public/uploads'),
    path.resolve('/var/www/MACVBET/mini-app/apps/frontend/public/uploads'),
  ];
  for (const c of candidates) {
    const parent = path.dirname(c);
    if (fs.existsSync(parent)) {
      return c;
    }
  }
  return candidates[0];
}

function isValidReceiptSignature(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;
  if (ext === '.pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (ext === '.png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === '.webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.length >= 12 &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyAdminsAboutTicketMessage(params: {
  ticketId: string;
  userId: string;
  userName: string;
  telegramId?: bigint | number | null;
  username?: string | null;
  balance?: number;
  category: string;
  text: string;
  attachments?: Array<{ url: string; name: string; size: number; type: string }>;
  isNewTicket: boolean;
}): Promise<void> {
  try {
    const redis = redisClient.getClient();
    const cdKey = `support:ticket:${params.ticketId}:notify_cd`;

    // Throttle repeated notifications within 45s unless it's a new ticket
    if (!params.isNewTicket) {
      const onCooldown = await redis.get(cdKey);
      if (onCooldown) {
        logger.debug({ ticketId: params.ticketId }, 'Admin Telegram notify throttled');
        return;
      }
    }
    await redis.set(cdKey, '1', 'EX', 45);

    const adminIds = await getAllAdminTelegramIds();
    const groupRaw =
      process.env.WITHDRAWAL_GROUP_ID ||
      process.env.SUPPORT_GROUP_ID ||
      process.env.ADMIN_GROUP_ID;
    const groupId = groupRaw ? parseInt(groupRaw, 10) : 0;
    const targetChatIds = Array.from(
      new Set([...adminIds, ...(groupId ? [groupId] : [])])
    );

    if (!targetChatIds.length) return;

    // Check if ticket is claimed
    const claimRaw = await redis.get(`support:ticket:${params.ticketId}:claim`);
    const claim = claimRaw ? (JSON.parse(claimRaw) as { adminName: string }) : null;

    const categoryLabels: Record<string, string> = {
      deposit: 'Депозит / BLIK',
      withdrawal: 'Вывод средств',
      bonus: 'Бонусы и вейджер',
      game: 'Ошибка в игре',
      general: 'Общие вопросы',
    };
    const catLabel = categoryLabels[params.category] || params.category;
    const tgUserStr = params.telegramId ? ` [<code>${params.telegramId}</code>]` : '';
    const usernameStr = params.username ? ` (@${params.username})` : '';
    const balStr =
      typeof params.balance === 'number'
        ? `\n<b>Баланс:</b> ${params.balance.toFixed(2)} zł`
        : '';
    const snippet =
      params.text.length > 350 ? `${params.text.slice(0, 350)}...` : params.text;

    const attachCount = params.attachments?.length || 0;
    const attachTypes = params.attachments && params.attachments.length > 0
      ? params.attachments.map((a) => (a.type?.includes('pdf') || a.name?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Фото/Чек')).join(', ')
      : '';
    const attachStr = attachCount > 0
      ? `\n<b>Файлы:</b> ${attachCount} шт. (${attachTypes})`
      : '';

    const claimStatusStr = claim
      ? `\n<b>В работе:</b> ${escapeHtml(claim.adminName)}`
      : '';

    const messageText =
      `<b>Поддержка</b> | <code>#${params.ticketId.slice(0, 8)}</code>\n\n` +
      `<b>Игрок:</b> <b>${escapeHtml(params.userName)}</b>${usernameStr}${tgUserStr}${balStr}\n` +
      `<b>Тема:</b> ${catLabel}` +
      `${attachStr}` +
      `${claimStatusStr}\n\n` +
      `<blockquote>${escapeHtml(snippet)}</blockquote>`;

    const miniAppUrl = process.env.MINI_APP_URL || 'https://macvbet.nl';
    const claimBtnText = claim ? `✅ Забрал(а): ${claim.adminName}` : '📥 Забрать';
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: claimBtnText,
            callback_data: `claim_ticket:${params.ticketId}`,
          },
        ],
        [
          {
            text: '💬 Открыть в админке',
            web_app: { url: `${miniAppUrl}/system/console/support?ticketId=${params.ticketId}` },
          },
        ],
      ],
    };

    const sent = await Promise.allSettled(
      targetChatIds.map(async (chatId) => {
        const msgId = await telegramApi.sendMessageWithMarkupAndGetId(
          chatId,
          messageText,
          replyMarkup
        );
        if (msgId) {
          return { chatId, messageId: msgId };
        }
        return null;
      })
    );

    const successfulMsgs = sent
      .filter(
        (
          s
        ): s is PromiseFulfilledResult<{ chatId: number; messageId: number } | null> =>
          s.status === 'fulfilled' && s.value !== null
      )
      .map((s) => s.value!);

    if (successfulMsgs.length > 0) {
      const msgCacheKey = `support:ticket:${params.ticketId}:messages`;
      const existing = await redis.get(msgCacheKey);
      const list = existing ? JSON.parse(existing) : [];
      list.push(...successfulMsgs);
      await redis.set(msgCacheKey, JSON.stringify(list.slice(-25)), 'EX', 7 * 24 * 3600);
    }
  } catch (err) {
    logger.error({ err, ticketId: params.ticketId }, 'Failed to send admin support notification');
  }
}

async function updateTelegramTicketMarkups(
  ticketId: string,
  claim: { adminName: string } | null
): Promise<void> {
  try {
    const redis = redisClient.getClient();
    const raw = await redis.get(`support:ticket:${ticketId}:messages`);
    if (!raw) return;

    const msgs = JSON.parse(raw) as Array<{ chatId: number; messageId: number }>;
    const miniAppUrl = process.env.MINI_APP_URL || 'https://macvbet.nl';
    const claimBtnText = claim ? `✅ Забрал(а): ${claim.adminName}` : '📥 Забрать';

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: claimBtnText,
            callback_data: `claim_ticket:${ticketId}`,
          },
        ],
        [
          {
            text: '💬 Открыть в админке',
            web_app: { url: `${miniAppUrl}/system/console/support?ticketId=${ticketId}` },
          },
        ],
      ],
    };

    await Promise.allSettled(
      msgs.map((m) => telegramApi.editMessageReplyMarkup(m.chatId, m.messageId, replyMarkup))
    );
  } catch (err) {
    logger.warn({ err, ticketId }, 'Failed to broadcast Telegram ticket markup updates');
  }
}

export const supportRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  // Ensure database tables exist for support tickets and messages
  try {
    await app.prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
    await app.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        subject VARCHAR(255),
        last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        unread_user_count INT NOT NULL DEFAULT 0,
        unread_admin_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `;
    await app.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
    `;
    await app.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
    `;
    await app.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at ON support_tickets(last_message_at DESC);
    `;
    await app.prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS support_messages (
        id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        ticket_id VARCHAR(64) NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL,
        sender_id VARCHAR(100) NOT NULL,
        sender_name VARCHAR(100),
        text TEXT NOT NULL,
        attachments JSONB DEFAULT '[]'::jsonb,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `;
    await app.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
    `;
    await app.prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at ASC);
    `;
  } catch (err) {
    logger.error({ err }, 'Could not ensure support tables via raw SQL; using existing schema');
  }

  // ==========================================
  // PLAYER ENDPOINTS (/api/support/...)
  // ==========================================

  /**
   * Upload receipt/check/document files for support tickets
   * Allowed: PDF, PNG, JPG, WEBP (up to 3MB each, max 5 files per request)
   */
  app.post('/upload', { preHandler: authenticate }, async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'Запрос должен быть в формате multipart/form-data' });
    }

    try {
      const parts = request.files({
        limits: {
          fileSize: MAX_UPLOAD_FILE_SIZE,
          files: MAX_UPLOAD_FILES_COUNT,
        },
      });

      const uploadedFiles: Array<{
        url: string;
        name: string;
        size: number;
        type: string;
      }> = [];

      const uploadDir = getUploadsDir();
      await fs.promises.mkdir(uploadDir, { recursive: true });

      for await (const part of parts) {
        if (uploadedFiles.length >= MAX_UPLOAD_FILES_COUNT) {
          return reply.code(400).send({
            error: `Превышен лимит файлов: можно прикрепить максимум ${MAX_UPLOAD_FILES_COUNT} файлов за один раз`,
          });
        }

        const originalName = part.filename || 'receipt.png';
        const ext = path.extname(originalName).toLowerCase();
        const mime = (part.mimetype || '').toLowerCase();

        if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext) || !ALLOWED_UPLOAD_MIMES.has(mime)) {
          return reply.code(400).send({
            error: `Недопустимый формат файла «${originalName}». Разрешены только чеки и квитанции: PDF, PNG, JPG, WEBP`,
          });
        }

        const buffer = await part.toBuffer();

        if (part.file.truncated || buffer.length > MAX_UPLOAD_FILE_SIZE) {
          return reply.code(400).send({
            error: `Файл «${originalName}» превышает допустимый размер 3 МБ.`,
          });
        }

        if (!isValidReceiptSignature(buffer, ext)) {
          return reply.code(400).send({
            error: `Содержимое файла «${originalName}» повреждено или не соответствует формату чека.`,
          });
        }

        const uniqueFilename = `support-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
        const filePath = path.join(uploadDir, uniqueFilename);
        await fs.promises.writeFile(filePath, buffer);

        uploadedFiles.push({
          url: `/api/support/files/${uniqueFilename}`,
          name: originalName,
          size: buffer.length,
          type: mime,
        });
      }

      if (uploadedFiles.length === 0) {
        return reply.code(400).send({ error: 'Файлы не были прикреплены' });
      }

      return reply.send({
        ok: true,
        files: uploadedFiles,
      });
    } catch (err: any) {
      logger.error({ err }, 'Support file upload failed');
      return reply.code(500).send({
        error: err?.message || 'Ошибка загрузки файлов на сервер',
      });
    }
  });

  /**
   * Serve uploaded support files securely
   */
  app.get<{
    Params: { filename: string };
  }>('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    const safeFilename = path.basename(filename);
    const uploadDir = getUploadsDir();
    const filePath = path.join(uploadDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Файл не найден' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(filePath));
  });

  /**
   * Get active ticket and message history for the authenticated user
   */
  app.get('/ticket', { preHandler: authenticate }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user.userId;

    try {
      // Find open or pending ticket, or latest ticket
      let ticket = await app.prisma.supportTicket.findFirst({
        where: {
          userId,
          status: { in: ['open', 'pending'] },
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      // If no open/pending ticket, check if there's any recent ticket
      if (!ticket) {
        ticket = await app.prisma.supportTicket.findFirst({
          where: { userId },
          orderBy: { lastMessageAt: 'desc' },
        });
      }

      // If still no ticket, create initial one
      if (!ticket) {
        ticket = await app.prisma.supportTicket.create({
          data: {
            userId,
            status: 'open',
            category: 'general',
            subject: 'Обращение в поддержку',
          },
        });
      }

      // Fetch messages for ticket
      const messages = await app.prisma.supportMessage.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      // Mark unread admin messages as read
      if (ticket.unreadUserCount > 0) {
        await app.prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { unreadUserCount: 0 },
        });
        await app.prisma.supportMessage.updateMany({
          where: {
            ticketId: ticket.id,
            senderType: { in: ['admin', 'system'] },
            isRead: false,
          },
          data: { isRead: true },
        });
      }

      return reply.send({
        ok: true,
        ticket: {
          id: ticket.id,
          status: ticket.status,
          category: ticket.category,
          subject: ticket.subject,
          lastMessageAt: ticket.lastMessageAt.getTime(),
          unreadUserCount: 0,
          createdAt: ticket.createdAt.getTime(),
        },
        messages: messages.map((m) => ({
          id: m.id,
          ticketId: m.ticketId,
          senderType: m.senderType,
          senderId: m.senderId,
          senderName: m.senderName,
          text: m.text,
          attachments: m.attachments,
          isRead: m.isRead,
          createdAt: m.createdAt.getTime(),
        })),
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to get support ticket');
      return reply.code(500).send({ error: 'Ошибка получения диалога' });
    }
  });

  /**
   * Send a message from user
   */
  app.post<{
    Body: {
      text?: string;
      category?: string;
      attachments?: Array<{
        url: string;
        name: string;
        size: number;
        type: string;
      }>;
    };
  }>('/message', { preHandler: authenticate }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { text, category, attachments } = request.body || {};

    const safeAttachments = Array.isArray(attachments)
      ? attachments.slice(0, 5).map((a) => ({
          url: String(a.url || ''),
          name: String(a.name || 'receipt'),
          size: Number(a.size || 0),
          type: String(a.type || 'application/octet-stream'),
        }))
      : [];

    const rawText = (text || '').trim();
    if (!rawText && safeAttachments.length === 0) {
      return reply.code(400).send({ error: 'Введите текст сообщения или прикрепите чек/файл' });
    }
    if (rawText.length > 4000) {
      return reply.code(400).send({ error: 'Сообщение слишком длинное (макс. 4000 символов)' });
    }

    const finalText = rawText || (safeAttachments.length === 1 ? '📎 Чек / вложение' : `📎 Вложения (${safeAttachments.length})`);

    try {
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          username: true,
          telegramId: true,
          balance: { select: { amount: true } },
        },
      });

      if (!user) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }

      // Find open/pending ticket or create one
      let ticket = await app.prisma.supportTicket.findFirst({
        where: {
          userId,
          status: { in: ['open', 'pending'] },
        },
        orderBy: { lastMessageAt: 'desc' },
      });

      const isNewTicket = !ticket;

      if (!ticket) {
        ticket = await app.prisma.supportTicket.create({
          data: {
            userId,
            status: 'open',
            category: category || 'general',
            subject: 'Обращение в поддержку',
          },
        });
      } else if (ticket.status !== 'open') {
        await app.prisma.supportTicket.update({
          where: { id: ticket.id },
          data: {
            status: 'open',
            category: category || ticket.category,
            lastMessageAt: new Date(),
            unreadAdminCount: { increment: 1 },
          },
        });
      } else {
        await app.prisma.supportTicket.update({
          where: { id: ticket.id },
          data: {
            lastMessageAt: new Date(),
            unreadAdminCount: { increment: 1 },
            ...(category ? { category } : {}),
          },
        });
      }

      const senderName = user.firstName || user.username || `Игрок #${String(user.telegramId).slice(-4)}`;

      const msg = await app.prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'user',
          senderId: userId,
          senderName,
          text: finalText,
          attachments: safeAttachments,
        },
      });

      // Broadcast new message event to admin room over Redis/WS
      try {
        await wsManager.publishBroadcast({
          room: 'admin:support',
          message: {
            type: 'admin_support_message',
            ticketId: ticket.id,
            userId,
            userName: senderName,
            telegramId: Number(user.telegramId),
            text: msg.text,
            attachments: safeAttachments,
            createdAt: msg.createdAt.getTime(),
          },
        });
      } catch (wsErr) {
        logger.debug({ wsErr }, 'Broadcast to admin:support failed');
      }

      // Notify admins in Telegram with inline "Забрать" button
      void notifyAdminsAboutTicketMessage({
        ticketId: ticket.id,
        userId,
        userName: senderName,
        telegramId: user.telegramId,
        username: user.username,
        balance: Number(user.balance?.amount || 0),
        category: category || ticket.category,
        text: msg.text,
        attachments: safeAttachments,
        isNewTicket,
      });

      return reply.send({
        ok: true,
        message: {
          id: msg.id,
          ticketId: msg.ticketId,
          senderType: msg.senderType,
          senderId: msg.senderId,
          senderName: msg.senderName,
          text: msg.text,
          attachments: msg.attachments,
          isRead: msg.isRead,
          createdAt: msg.createdAt.getTime(),
        },
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to post support message');
      return reply.code(500).send({ error: 'Не удалось отправить сообщение' });
    }
  });

  /**
   * Get unread messages count for current user
   */
  app.get('/unread-count', { preHandler: authenticate }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user.userId;

    try {
      const tickets = await app.prisma.supportTicket.findMany({
        where: { userId },
        select: { unreadUserCount: true },
      });
      const unreadCount = tickets.reduce((acc, t) => acc + t.unreadUserCount, 0);
      return reply.send({ ok: true, unreadCount });
    } catch {
      return reply.send({ ok: true, unreadCount: 0 });
    }
  });

  // ==========================================
  // ADMIN ENDPOINTS (Gated by adminOnly)
  // Registered under /_x/support/...
  // ==========================================

  /**
   * List all tickets with user summary
   */
  app.get<{
    Querystring: {
      status?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>('/_x/tickets', { preHandler: adminOnly }, async (request, reply) => {
    const status = request.query.status || 'all';
    const search = (request.query.search || '').trim().replace(/^@/, '');
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '40', 10)));
    const offset = Math.max(0, parseInt(request.query.offset || '0', 10));

    try {
      const where: any = {};
      if (status !== 'all') {
        where.status = status;
      }

      if (search) {
        const isNum = /^\d+$/.test(search);
        where.user = {
          OR: [
            { id: search },
            { username: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            ...(isNum ? [{ telegramId: BigInt(search) }] : []),
          ],
        };
      }

      const [tickets, totalCount] = await Promise.all([
        app.prisma.supportTicket.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                telegramId: true,
                username: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
                isBlocked: true,
                withdrawalLocked: true,
                balance: {
                  select: {
                    amount: true,
                    wagerTarget: true,
                    wagerProgress: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: [{ unreadAdminCount: 'desc' }, { lastMessageAt: 'desc' }],
          take: limit,
          skip: offset,
        }),
        app.prisma.supportTicket.count({ where }),
      ]);

      const redis = redisClient.getClient();
      const claims = await Promise.all(
        tickets.map(async (t) => {
          try {
            const raw = await redis.get(`support:ticket:${t.id}:claim`);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })
      );

      const formatted = tickets.map((t, idx) => {
        const lastMsg = t.messages[0];
        const bal = t.user.balance;
        const wRem = bal ? Math.max(0, Number(bal.wagerTarget) - Number(bal.wagerProgress)) : 0;

        return {
          id: t.id,
          userId: t.userId,
          status: t.status,
          category: t.category,
          subject: t.subject,
          lastMessageAt: t.lastMessageAt.getTime(),
          unreadAdminCount: t.unreadAdminCount,
          unreadUserCount: t.unreadUserCount,
          createdAt: t.createdAt.getTime(),
          claimedBy: claims[idx],
          lastMessage: lastMsg
            ? {
                text: lastMsg.text,
                senderType: lastMsg.senderType,
                senderName: lastMsg.senderName,
                createdAt: lastMsg.createdAt.getTime(),
              }
            : null,
          user: {
            id: t.user.id,
            telegramId: Number(t.user.telegramId),
            username: t.user.username,
            firstName: t.user.firstName,
            lastName: t.user.lastName,
            photoUrl: t.user.photoUrl,
            balance: Number(bal?.amount || 0),
            remainingWager: wRem,
            isBlocked: t.user.isBlocked,
            withdrawalLocked: t.user.withdrawalLocked,
          },
        };
      });

      return reply.send({
        ok: true,
        tickets: formatted,
        total: totalCount,
      });
    } catch (err) {
      logger.error(err, 'Failed to fetch admin tickets');
      return reply.code(500).send({ error: 'Ошибка загрузки тикетов' });
    }
  });

  /**
   * Get full message thread for a ticket (and mark user messages as read)
   */
  app.get<{
    Params: {
      id: string;
    };
  }>('/_x/tickets/:id/messages', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;

    try {
      const ticket = await app.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              username: true,
              firstName: true,
              photoUrl: true,
              balance: true,
            },
          },
        },
      });

      if (!ticket) {
        return reply.code(404).send({ error: 'Тикет не найден' });
      }

      const messages = await app.prisma.supportMessage.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      // Clear unread admin count
      if (ticket.unreadAdminCount > 0) {
        await app.prisma.supportTicket.update({
          where: { id },
          data: { unreadAdminCount: 0 },
        });
        await app.prisma.supportMessage.updateMany({
          where: {
            ticketId: id,
            senderType: 'user',
            isRead: false,
          },
          data: { isRead: true },
        });
      }

      const redis = redisClient.getClient();
      const rawClaim = await redis.get(`support:ticket:${id}:claim`);
      const claimedBy = rawClaim ? JSON.parse(rawClaim) : null;

      return reply.send({
        ok: true,
        ticket: {
          id: ticket.id,
          status: ticket.status,
          category: ticket.category,
          subject: ticket.subject,
          lastMessageAt: ticket.lastMessageAt.getTime(),
          createdAt: ticket.createdAt.getTime(),
          claimedBy,
        },
        user: {
          id: ticket.user.id,
          telegramId: Number(ticket.user.telegramId),
          username: ticket.user.username,
          firstName: ticket.user.firstName,
          photoUrl: ticket.user.photoUrl,
          balance: Number(ticket.user.balance?.amount || 0),
        },
        messages: messages.map((m) => ({
          id: m.id,
          senderType: m.senderType,
          senderId: m.senderId,
          senderName: m.senderName,
          text: m.text,
          attachments: m.attachments,
          isRead: m.isRead,
          createdAt: m.createdAt.getTime(),
        })),
      });
    } catch (err) {
      logger.error({ err, id }, 'Failed to get ticket messages');
      return reply.code(500).send({ error: 'Ошибка получения сообщений' });
    }
  });

  /**
   * Admin reply to ticket + WebSocket live push + Telegram Bot offline push
   */
  app.post<{
    Params: {
      id: string;
    };
    Body: {
      text?: string;
      cannedAction?: string;
      attachments?: Array<{
        url: string;
        name: string;
        size: number;
        type: string;
      }>;
    };
  }>('/_x/tickets/:id/reply', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;
    const { text, attachments } = request.body || {};
    const authReq = request as AuthenticatedRequest;
    const adminTelegramId = authReq.user.telegramId;

    const safeAttachments = Array.isArray(attachments)
      ? attachments.slice(0, 5).map((a) => ({
          url: String(a.url || ''),
          name: String(a.name || 'attachment'),
          size: Number(a.size || 0),
          type: String(a.type || 'application/octet-stream'),
        }))
      : [];

    const rawText = (text || '').trim();
    if (!rawText && safeAttachments.length === 0) {
      return reply.code(400).send({ error: 'Текст ответа или прикрепленный файл обязателен' });
    }

    const finalText = rawText || (safeAttachments.length === 1 ? '📎 Вложение от поддержки' : `📎 Вложения (${safeAttachments.length})`);

    try {
      const ticket = await app.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              firstName: true,
              username: true,
            },
          },
        },
      });

      if (!ticket) {
        return reply.code(404).send({ error: 'Тикет не найден' });
      }

      // 1. Insert message
      const msg = await app.prisma.supportMessage.create({
        data: {
          ticketId: id,
          senderType: 'admin',
          senderId: String(adminTelegramId),
          senderName: 'Поддержка MACVBET',
          text: finalText,
          attachments: safeAttachments,
        },
      });

      // 2. Update ticket
      await app.prisma.supportTicket.update({
        where: { id },
        data: {
          status: 'pending',
          lastMessageAt: new Date(),
          unreadUserCount: { increment: 1 },
        },
      });

      const messagePayload = {
        id: msg.id,
        ticketId: msg.ticketId,
        senderType: msg.senderType,
        senderName: msg.senderName,
        text: msg.text,
        attachments: msg.attachments,
        createdAt: msg.createdAt.getTime(),
      };

      // 3. Dispatch over WebSocket to active user
      try {
        await wsManager.publishBroadcast({
          userId: ticket.userId,
          message: {
            type: 'support_message',
            ticketId: ticket.id,
            message: messagePayload,
          },
        });
      } catch (wsErr) {
        logger.debug({ wsErr }, 'WebSocket push to user failed');
      }

      // 4. Hybrid notification bridge: If user is offline in the WebApp, push to Telegram Bot
      const isOnline = wsManager.getUserConnectionCount(ticket.userId) > 0;
      const userTelegramId = Number(ticket.user.telegramId);

      if (userTelegramId && !isOnline) {
        try {
          const miniAppUrl = process.env.MINI_APP_URL || 'https://macvbet.nl';
          const cleanSnippet =
            finalText.length > 300 ? `${finalText.slice(0, 300)}...` : finalText;
          const attachSnippet = safeAttachments.length > 0 ? `\n📎 <i>Прикреплены файлы (${safeAttachments.length} шт.)</i>\n` : '';

          await telegramApi.sendMessageWithMarkup(
            userTelegramId,
            `👨‍💻 <b>Служба поддержки ответила на ваше обращение:</b>\n\n` +
              `<blockquote>${escapeHtml(cleanSnippet)}</blockquote>${attachSnippet}\n\n` +
              `Нажмите кнопку ниже, чтобы перейти в диалог.`,
            {
              inline_keyboard: [
                [
                  {
                    text: '💬 Открыть чат поддержки',
                    web_app: { url: `${miniAppUrl}/?support=true` },
                  },
                ],
              ],
            }
          );
        } catch (tgErr) {
          logger.warn({ tgErr, userTelegramId }, 'Telegram bot push notification failed');
        }
      }

      return reply.send({
        ok: true,
        message: messagePayload,
        notifiedViaTelegram: !isOnline && Boolean(userTelegramId),
      });
    } catch (err) {
      logger.error({ err, id }, 'Admin reply failed');
      return reply.code(500).send({ error: 'Ошибка отправки ответа' });
    }
  });

  /**
   * Change ticket status (resolved, closed, open)
   */
  app.post<{
    Params: {
      id: string;
    };
    Body: {
      status: 'open' | 'pending' | 'resolved' | 'closed';
    };
  }>('/_x/tickets/:id/status', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body || {};

    if (!status || !['open', 'pending', 'resolved', 'closed'].includes(status)) {
      return reply.code(400).send({ error: 'Неверный статус' });
    }

    try {
      const ticket = await app.prisma.supportTicket.update({
        where: { id },
        data: { status },
      });

      if (status === 'resolved' || status === 'closed') {
        await app.prisma.supportMessage.create({
          data: {
            ticketId: id,
            senderType: 'system',
            senderId: 'system',
            senderName: 'Система',
            text: 'Обращение закрыто специалистом поддержки. Если у вас возникнут новые вопросы, напишите сюда в любое время.',
          },
        });
      }

      return reply.send({ ok: true, ticket });
    } catch (err) {
      logger.error({ err, id }, 'Change ticket status failed');
      return reply.code(500).send({ error: 'Ошибка обновления статуса' });
    }
  });

  /**
   * Get ticket claim status
   */
  app.get<{
    Params: { id: string };
  }>('/_x/tickets/:id/claim', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;
    try {
      const redis = redisClient.getClient();
      const raw = await redis.get(`support:ticket:${id}:claim`);
      const claim = raw ? JSON.parse(raw) : null;
      return reply.send({ ok: true, claim });
    } catch (err) {
      logger.error({ err, id }, 'Failed to get ticket claim');
      return reply.code(500).send({ error: 'Ошибка получения статуса' });
    }
  });

  /**
   * Toggle or set ticket claim status by admin
   */
  app.post<{
    Params: { id: string };
    Body: { action?: 'claim' | 'unclaim' | 'toggle' };
  }>('/_x/tickets/:id/claim', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;
    const authReq = request as AuthenticatedRequest;
    const adminTelegramId = authReq.user.telegramId;
    const { action = 'toggle' } = request.body || {};

    try {
      const redis = redisClient.getClient();
      const claimKey = `support:ticket:${id}:claim`;
      const raw = await redis.get(claimKey);
      const existing = raw ? JSON.parse(raw) : null;

      // Determine admin display name
      const adminUser = await app.prisma.user.findFirst({
        where: { telegramId: BigInt(adminTelegramId) },
        select: { firstName: true, username: true },
      });
      const adminName = adminUser?.username
        ? `@${adminUser.username}`
        : adminUser?.firstName || `Саппорт ${adminTelegramId}`;

      let updatedClaim: any = null;

      if (!existing) {
        if (action === 'unclaim') {
          return reply.send({ ok: true, claim: null });
        }
        updatedClaim = {
          adminId: Number(adminTelegramId),
          adminName,
          claimedAt: Date.now(),
        };
        await redis.set(claimKey, JSON.stringify(updatedClaim), 'EX', 7 * 24 * 3600);
      } else {
        if (existing.adminId === Number(adminTelegramId)) {
          if (action === 'claim') {
            return reply.send({ ok: true, claim: existing });
          }
          await redis.del(claimKey);
          updatedClaim = null;
        } else {
          if (action === 'unclaim') {
            return reply.code(403).send({ error: `Тикет уже взят оператором ${existing.adminName}` });
          }
          return reply.code(409).send({
            error: `Тикет уже взят оператором ${existing.adminName}`,
            claim: existing,
          });
        }
      }

      // Update Telegram buttons across all admin messages
      void updateTelegramTicketMarkups(id, updatedClaim);

      // Broadcast WS event to admin support room
      try {
        await wsManager.publishBroadcast({
          room: 'admin:support',
          message: {
            type: updatedClaim ? 'support_ticket_claimed' : 'support_ticket_unclaimed',
            ticketId: id,
            claimedBy: updatedClaim,
          },
        });
      } catch {}

      return reply.send({ ok: true, claim: updatedClaim });
    } catch (err) {
      logger.error({ err, id }, 'Failed to toggle ticket claim');
      return reply.code(500).send({ error: 'Ошибка обновления статуса' });
    }
  });
};
