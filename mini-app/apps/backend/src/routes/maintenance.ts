import type { FastifyInstance } from 'fastify';
import {
  adminOnly,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { maintenanceConfig } from '../services/maintenance-config.js';

/**
 * Maintenance mode routes.
 * Mounted from admin.ts under the same /api prefix.
 */
export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------ admin endpoints */
  app.get('/_x/maintenance', { preHandler: adminOnly }, async (_req, reply) => {
    const cfg = await maintenanceConfig.get();
    return reply.send({ ok: true, config: cfg });
  });

  app.patch<{
    Body: { enabled: boolean; message?: string; reason: string };
  }>(
    '/_x/maintenance',
    { preHandler: adminOnly },
    async (request, reply) => {
      const reason = (request.body?.reason ?? '').trim();
      if (!reason || reason.length < 3) {
        return reply.code(400).send({ error: 'Reason required' });
      }
      const before = await maintenanceConfig.get();
      const patch: Partial<typeof before> = {};
      if (typeof request.body.enabled === 'boolean') patch.enabled = request.body.enabled;
      if (typeof request.body.message === 'string' || request.body.message === undefined) {
        patch.message = request.body.message || undefined;
      }
      try {
        const after = await maintenanceConfig.update(patch);
        // lightweight audit via raw insert to keep parity with admin.ts
        try {
          const id =
            (globalThis as { crypto?: { randomUUID(): string } }).crypto?.randomUUID() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const authReq = request as AuthenticatedRequest;
          await app.prisma.$executeRaw`
            INSERT INTO admin_audit_log (
              id, admin_user_id, admin_telegram_id, action,
              target_type, target_id, payload_before, payload_after,
              reason, ip_address, created_at
            ) VALUES (
              ${id},
              ${authReq.user.userId},
              ${BigInt(authReq.user.telegramId)},
              'system.maintenance',
              'system',
              'maintenance',
              ${JSON.stringify(before)}::jsonb,
              ${JSON.stringify(after)}::jsonb,
              ${reason},
              ${request.ip ?? null},
              NOW()
            )
          `;
        } catch (e) {
          logger.warn({ e }, 'Audit insert failed (non-fatal)');
        }
        return reply.send({ ok: true, config: after });
      } catch (err) {
        logger.error(err, 'Maintenance config update failed');
        return reply.code(400).send({ error: 'Bad Request' });
      }
    }
  );

  /* ------------------------------------------------ public status */
  app.get('/maintenance/status', async (_req, reply) => {
    const cfg = await maintenanceConfig.get();
    return reply.send({ ok: true, enabled: cfg.enabled, message: cfg.message ?? null });
  });
}
