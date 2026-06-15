import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';

const ROOT_IP_THRESHOLD = 3;
const ROOT_IP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class SecurityService {
  /**
   * Called on every login/session creation to track IP and verify multi-accounting.
   */
  async analyzeIpLogin(userId: string, telegramId: number, ipAddress: string) {
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
            lastSeen: now,
          },
        });
      }

      // Check for multi-accounting on this IP
      // @ts-ignore
      const otherAccounts = await prisma.userIpAddress.findMany({
        where: {
          ipAddress,
          userId: { not: userId },
        },
        include: { user: true },
        orderBy: { firstSeen: 'asc' },
      });

      if (otherAccounts.length > 0) {
        // Someone else used this IP!
        // Is it a VPN?
        const isVpnContext = ipRecord.isVpn || otherAccounts.some((a: any) => a.isVpn);

        if (isVpnContext) {
          // VPN IP matched. Just create a security alert.
          await prisma.securityAlert.create({
            data: {
              userId,
              type: 'multi_account_suspicion',
              severity: 'medium',
              description: `Shared VPN IP detected: ${ipAddress} (shared with ${otherAccounts.length} others)`,
            },
          });
        } else {
          // Real Multi-Account Detected!
          // The oldest account on this IP is considered the Main (Old) account.
          const mainAccount = otherAccounts[0].user;

          // 1. Block the current (New) account permanently
          await prisma.user.update({
            where: { id: userId },
            data: {
              isBlocked: true,
              adminNote: `Auto-blocked for multi-accounting. Matched IP ${ipAddress} with Main Account ${mainAccount.id}`,
            },
          });

          // 2. Lock withdrawals on the Main (Old) account
          await prisma.user.update({
            where: { id: mainAccount.id },
            data: {
              withdrawalLocked: true,
              adminNote: `Auto-locked withdrawals. Secondary account detected on IP ${ipAddress}`,
            },
          });

          // 3. Send Telegram Message to the Main (Old) Account
          const messageText = `⚠️ Предупреждение о нарушении правил платформы MacvBet\n\nУважаемый пользователь, наша система безопасности обнаружила, что вами был создан второй игровой аккаунт.\n\nСогласно пункту 2.1 Пользовательского соглашения, на платформе действует строгое правило одного аккаунта. Мультиаккаунтинг категорически запрещен и распространяется на использование одного IP-адреса, одного устройства и одного платежного кошелька.\n\nПринятые меры:\n• Ваш второй (дублирующий) аккаунт заблокирован навсегда.\n• Ваш основной аккаунт остается активным и не был тронут.\n\nНапоминаем, что в соответствии с правилами платформы, администрация отслеживает поведенческие маркеры. Повторное нарушение или попытка создания новых профилей приведет к полной и безвозвратной блокировке всех ваших аккаунтов (включая основной) и конфискации всех средств на балансе.\n\nПожалуйста, ознакомьтесь с полным текстом Пользовательского соглашения MacvBet (https://telegra.ph/POLZOVATELSKOE-SOGLASHENIE-I-PRAVILA-IGROVOJ-PLATFORMY-MACVBET-06-01), чтобы избежать подобных ситуаций в будущем.\n\nС уважением,\nАдминистрация MacvBet`;
          
          await telegramApi.sendMessage(Number(mainAccount.telegramId), messageText);
          
          // Log it as critical
          await prisma.securityAlert.create({
            data: {
              userId,
              type: 'multi_account_detected',
              severity: 'critical',
              description: `Strict Multi-Account ban applied. IP: ${ipAddress}. Main Account: ${mainAccount.id}`,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ userId, ipAddress, error }, 'Failed to analyze IP login');
    }
  }
}

export const securityService = new SecurityService();
