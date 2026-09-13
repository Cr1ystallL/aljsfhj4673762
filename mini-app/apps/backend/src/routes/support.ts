import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate, adminOnly, type AuthenticatedRequest } from '../middleware/auth.js';
import { wsManager } from '../lib/websocket-manager.js';
import { telegramApi } from '../lib/telegram-api.js';
import { logger } from '../utils/logger.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
      text: string;
      category?: string;
    };
  }>('/message', { preHandler: authenticate }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { text, category } = request.body || {};

    if (!text || !text.trim()) {
      return reply.code(400).send({ error: 'Текст сообщения не может быть пустым' });
    }
    if (text.length > 4000) {
      return reply.code(400).send({ error: 'Сообщение слишком длинное (макс. 4000 символов)' });
    }

    try {
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          username: true,
          telegramId: true,
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
          text: text.trim(),
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
            createdAt: msg.createdAt.getTime(),
          },
        });
      } catch (wsErr) {
        logger.debug({ wsErr }, 'Broadcast to admin:support failed');
      }

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

      const formatted = tickets.map((t) => {
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

      return reply.send({
        ok: true,
        ticket: {
          id: ticket.id,
          status: ticket.status,
          category: ticket.category,
          subject: ticket.subject,
          lastMessageAt: ticket.lastMessageAt.getTime(),
          createdAt: ticket.createdAt.getTime(),
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
      text: string;
      cannedAction?: string;
    };
  }>('/_x/tickets/:id/reply', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params;
    const { text } = request.body || {};
    const authReq = request as AuthenticatedRequest;
    const adminTelegramId = authReq.user.telegramId;

    if (!text || !text.trim()) {
      return reply.code(400).send({ error: 'Текст ответа обязателен' });
    }

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
          text: text.trim(),
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
            text.trim().length > 300 ? `${text.trim().slice(0, 300)}...` : text.trim();

          await telegramApi.sendMessageWithMarkup(
            userTelegramId,
            `👨‍💻 <b>Служба поддержки ответила на ваше обращение:</b>\n\n` +
              `<i>«${escapeHtml(cleanSnippet)}»</i>\n\n` +
              `Нажмите кнопку ниже, чтобы перейти в диалог.`,
            {
              inline_keyboard: [
                [
                  {
                    text: '💬 Открыть чат поддержки',
                    web_app: { url: `${miniAppUrl}/support` },
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
};
