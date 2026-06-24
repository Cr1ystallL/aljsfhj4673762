import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';

const ROOT_IP_THRESHOLD = 3;
const ROOT_IP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class SecurityService {
  /**
   * Called on every login/session creation to track IP and verify multi-accounting.
   */
  async analyzeIpLogin(userId: string, telegramId: number, ipAddress: string, deviceId?: string) {
    try {
      if (!ipAddress) return;

      const now = new Date();

      // Ensure we have user tracking for this IP
      // @ts-ignore: userIpAddress is dynamic
      let ipRecord = await prisma.userIpAddress.findUnique({
        where: {
          userId_ipAddress: {
            userId,
            ipAddress,
          },
        },
      });

      let isNewRecord = false;

      if (!ipRecord) {
        isNewRecord = true;
        // Check if user has a root IP already
        // @ts-ignore
        const rootIps = await prisma.userIpAddress.findMany({
          where: { userId, isRoot: true },
        });

        const isVpn = rootIps.length > 0;

        // @ts-ignore
        ipRecord = await prisma.userIpAddress.create({
          data: {
            userId,
            ipAddress,
            deviceId: deviceId || null,
            count: 1,
            isRoot: false,
            isVpn,
            firstSeen: now,
            lastSeen: now,
          },
        });
      } else {
        // Existing record: Check if we should increment count and potentially make it Root
        const timeSinceLastSeen = now.getTime() - ipRecord.lastSeen.getTime();
        
        let newCount = ipRecord.count;
        let isRoot = ipRecord.isRoot;

        if (timeSinceLastSeen > ROOT_IP_INTERVAL_MS) {
          newCount += 1;
        }

        if (newCount >= ROOT_IP_THRESHOLD && !isRoot) {
          // Verify user has no other root IP
          // @ts-ignore
          const otherRoots = await prisma.userIpAddress.count({
            where: { userId, isRoot: true, id: { not: ipRecord.id } },
          });

          if (otherRoots === 0) {
            isRoot = true;
          }
        }

        // @ts-ignore
        ipRecord = await prisma.userIpAddress.update({
          where: { id: ipRecord.id },
          data: {
            count: newCount,
            isRoot,
            deviceId: deviceId || ipRecord.deviceId || null,
            lastSeen: now,
          },
        });
      }

      // Check for multi-accounting on this IP
      // @ts-ignore
      const allAccountsOnIp = await prisma.userIpAddress.findMany({
        where: { ipAddress },
        include: { user: true },
        orderBy: { firstSeen: 'asc' },
      });

      if (allAccountsOnIp.length > 1) {
        const mainIpRecord = allAccountsOnIp[0];
        
        // If the current user is NOT the main (oldest) account on this IP
        if (mainIpRecord.userId !== userId) {
          // Is it a VPN?
          const isVpnContext = ipRecord.isVpn || allAccountsOnIp.some((a: any) => a.isVpn);

          // Check if Device ID matches another account on this exact IP
          const hasSameDevice = deviceId && allAccountsOnIp.some((a: any) => a.userId !== userId && a.deviceId === deviceId);

          if (isVpnContext && !hasSameDevice) {
            // VPN IP matched. Just create a security alert.
            await prisma.securityAlert.create({
              data: {
                userId,
                type: 'multi_account_suspicion',
                severity: 'medium',
                description: `Shared VPN IP detected: ${ipAddress} (shared with ${allAccountsOnIp.length - 1} others)`,
              },
            });
          } else if (hasSameDevice) {
            // Real Multi-Account Detected! Exact IP + Exact Device ID
            const mainAccount = mainIpRecord.user;

            // Check Whitelist (ignoreIpCollision)
            // @ts-ignore: ignoreIpCollision is new field
            const isWhitelisted = mainAccount.ignoreIpCollision || allAccountsOnIp.find(a => a.userId === userId)?.user?.ignoreIpCollision;

            if (isWhitelisted) {
              await prisma.securityAlert.create({
                data: {
                  userId,
                  type: 'multi_account_suspicion',
                  severity: 'low',
                  description: `Whitelisted IP collision ignored. Device match. IP: ${ipAddress}. Main Account: ${mainAccount.id}`,
                },
              });
            } else {
              // 1. Block the current (New) account permanently
              await prisma.user.update({
                where: { id: userId },
                data: {
                  isBlocked: true,
                  adminNote: `Auto-blocked for multi-accounting (Exact Device ID Match). Matched IP ${ipAddress} with Main Account ${mainAccount.id}`,
                },
              });

              // 2. Lock withdrawals on the Main (Old) account
              await prisma.user.update({
                where: { id: mainAccount.id },
                data: {
                  withdrawalLocked: true,
                  adminNote: `Auto-locked withdrawals. Secondary account detected on exact Device ID + IP ${ipAddress}`,
                },
              });

              // 3. Log to AdminAuditLog
              await prisma.adminAuditLog.create({
                data: {
                  adminUserId: 'system',
                  adminTelegramId: 0n,
                  action: 'user.auto_ban_multi_account',
                  targetType: 'user',
                  targetId: userId,
                  reason: `Автоматический бан: Совпадение устройства (Device ID) и IP адреса (${ipAddress}) с основным аккаунтом ${mainAccount.id}.`,
                }
              });

              // 4. Send Telegram Message to the Main (Old) Account
              const messageText = `⚠️ Предупреждение о нарушении правил платформы MacvBet\n\nУважаемый пользователь, наша система безопасности обнаружила, что вами был создан второй игровой аккаунт.\n\nСогласно пункту 2.1 Пользовательского соглашения, на платформе действует строгое правило одного аккаунта. Мультиаккаунтинг категорически запрещен и распространяется на использование одного IP-адреса, одного устройства и одного платежного кошелька.\n\nПринятые меры:\n• Ваш второй (дублирующий) аккаунт заблокирован навсегда.\n• Ваш основной аккаунт остается активным и не был тронут.\n\nНапоминаем, что в соответствии с правилами платформы, администрация отслеживает поведенческие маркеры. Повторное нарушение или попытка создания новых профилей приведет к полной и безвозвратной блокировке всех ваших аккаунтов (включая основной) и конфискации всех средств на балансе.\n\nПожалуйста, ознакомьтесь с полным текстом Пользовательского соглашения MacvBet (https://telegra.ph/POLZOVATELSKOE-SOGLASHENIE-I-PRAVILA-IGROVOJ-PLATFORMY-MACVBET-06-01), чтобы избежать подобных ситуаций в будущем.\n\nС уважением,\nАдминистрация MacvBet`;
              await telegramApi.sendMessage(Number(mainAccount.telegramId), messageText);
              
              await prisma.securityAlert.create({
                data: {
                  userId,
                  type: 'multi_account_detected',
                  severity: 'critical',
                  description: `Strict Multi-Account ban applied. Device match. IP: ${ipAddress}. Main Account: ${mainAccount.id}`,
                },
              });
            }

          } else {
            // IP matched but Device ID didn't match. Flag for manual review.
            const mainAccount = mainIpRecord.user;
            await prisma.securityAlert.create({
              data: {
                userId,
                type: 'multi_account_suspicion',
                severity: 'high',
                description: `Possible Multi-Account detected by IP. IP: ${ipAddress}. Main Account: ${mainAccount.id} (${mainAccount.username || mainAccount.firstName}). Manual review required.`,
              },
            });
          }
        }
      }
    } catch (error) {
      logger.error({ userId, ipAddress, error }, 'Failed to analyze IP login');
    }
  }
}

export const securityService = new SecurityService();
