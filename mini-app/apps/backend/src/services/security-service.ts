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

          if (isVpnContext) {
            // VPN IP matched. Just create a security alert.
            await prisma.securityAlert.create({
              data: {
                userId,
                type: 'multi_account_suspicion',
                severity: 'medium',
                description: `Shared VPN IP detected: ${ipAddress} (shared with ${allAccountsOnIp.length - 1} others)`,
              },
            });
          } else {
            // Real Multi-Account Detected!
            const mainAccount = mainIpRecord.user;

            // We no longer auto-ban purely by IP because of mobile networks and CGNAT 
            // causing false positives. Instead, we create a high-priority alert for admins.
            
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
