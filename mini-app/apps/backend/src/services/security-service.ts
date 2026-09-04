import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { telegramApi } from '../lib/telegram-api.js';

const ROOT_IP_THRESHOLD = 3;
const ROOT_IP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface TrustScoreBreakdown {
  score: number;
  factors: Array<{ description: string; delta: number; type: 'positive' | 'negative' | 'neutral' }>;
}

export class SecurityService {
  /**
   * Called on every login/session creation to track IP, Hardware Fingerprint and calculate Trust Score.
   */
  async analyzeLogin(
    userId: string,
    telegramId: number,
    ipAddress: string,
    deviceId?: string,
    hardwareHash?: string,
    deviceSpecs?: any
  ): Promise<number> {
    try {
      if (!ipAddress) return 80;

      const now = new Date();

      // 1. Fetch current user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) return 80;

      // 2. Ensure IP record is tracked
      let ipRecord = await prisma.userIpAddress.findUnique({
        where: {
          userId_ipAddress: {
            userId,
            ipAddress,
          },
        },
      });

      if (!ipRecord) {
        const rootIps = await prisma.userIpAddress.findMany({
          where: { userId, isRoot: true },
        });
        const isVpn = rootIps.length > 0;

        ipRecord = await prisma.userIpAddress.create({
          data: {
            userId,
            ipAddress,
            deviceId: deviceId || null,
            hardwareHash: hardwareHash || null,
            count: 1,
            isRoot: false,
            isVpn,
            firstSeen: now,
            lastSeen: now,
          },
        });
      } else {
        const timeSinceLastSeen = now.getTime() - ipRecord.lastSeen.getTime();
        let newCount = ipRecord.count;
        let isRoot = ipRecord.isRoot;

        if (timeSinceLastSeen > ROOT_IP_INTERVAL_MS) {
          newCount += 1;
        }

        if (newCount >= ROOT_IP_THRESHOLD && !isRoot) {
          const otherRoots = await prisma.userIpAddress.count({
            where: { userId, isRoot: true, id: { not: ipRecord.id } },
          });
          if (otherRoots === 0) {
            isRoot = true;
          }
        }

        ipRecord = await prisma.userIpAddress.update({
          where: { id: ipRecord.id },
          data: {
            count: newCount,
            isRoot,
            deviceId: deviceId || ipRecord.deviceId || null,
            hardwareHash: hardwareHash || ipRecord.hardwareHash || null,
            lastSeen: now,
          },
        });
      }

      // 3. Update hardware data on User model if provided
      const userUpdates: any = {};
      if (hardwareHash && user.hardwareHash !== hardwareHash) {
        userUpdates.hardwareHash = hardwareHash;
      }
      if (deviceSpecs && typeof deviceSpecs === 'object') {
        userUpdates.deviceSpecs = deviceSpecs;
      }

      // 4. Multi-Factor Trust Score Calculation
      const { score, factors } = await this.calculateTrustScore(
        user,
        ipAddress,
        hardwareHash || user.hardwareHash || undefined,
        deviceId
      );

      userUpdates.trustScore = score;
      await prisma.user.update({
        where: { id: userId },
        data: userUpdates,
      });

      // 5. Hardware Cluster Collision Check (Hard Multi-Accounting Rule)
      if (hardwareHash && !user.ignoreIpCollision) {
        await this.checkHardwareCollision(userId, hardwareHash, user);
      }

      // 6. IP Collision Check
      if (!user.ignoreIpCollision) {
        await this.checkIpCollision(userId, ipAddress, ipRecord, deviceId, user);
      }

      return score;
    } catch (error) {
      logger.error({ userId, ipAddress, error }, 'Failed to analyze login');
      return 80;
    }
  }

  /**
   * Backward-compatible alias for analyzeIpLogin
   */
  async analyzeIpLogin(
    userId: string,
    telegramId: number,
    ipAddress: string,
    deviceId?: string,
    hardwareHash?: string
  ) {
    return this.analyzeLogin(userId, telegramId, ipAddress, deviceId, hardwareHash);
  }

  /**
   * Calculates comprehensive Trust Score (0-100) based on all security vectors
   */
  async calculateTrustScore(
    user: any,
    ipAddress: string,
    hardwareHash?: string,
    deviceId?: string
  ): Promise<TrustScoreBreakdown> {
    let score = 80; // Default baseline trust
    const factors: TrustScoreBreakdown['factors'] = [
      { description: 'Базовый рейтинг доверия', delta: 80, type: 'positive' },
    ];

    if (user.ignoreIpCollision) {
      return {
        score: 100,
        factors: [{ description: 'Аккаунт внесен в белый список', delta: 100, type: 'positive' }],
      };
    }

    // 1. Hardware match check
    if (hardwareHash) {
      const matchCount = await prisma.user.count({
        where: {
          hardwareHash,
          id: { not: user.id },
        },
      });
      if (matchCount > 0) {
        score -= 80;
        factors.push({
          description: `Совпадение по физическому железу (${matchCount} других аккаунтов)`,
          delta: -80,
          type: 'negative',
        });
      } else {
        factors.push({
          description: 'Уникальное физическое устройство (TMA Hardware)',
          delta: +5,
          type: 'positive',
        });
        score += 5;
      }
    }

    // 2. Telegram profile signals
    const tgIdNum = Number(user.telegramId);
    if (tgIdNum > 7_500_000_000) {
      score -= 15;
      factors.push({
        description: 'Очень свежий Telegram ID (>7.5 млрд, признак авторега)',
        delta: -15,
        type: 'negative',
      });
    } else if (tgIdNum < 2_000_000_000 && tgIdNum > 0) {
      score += 10;
      factors.push({
        description: 'Зрелый Telegram ID (<2 млрд, старый аккаунт)',
        delta: +10,
        type: 'positive',
      });
    }

    if (user.isPremium) {
      score += 15;
      factors.push({
        description: 'Наличие Telegram Premium',
        delta: +15,
        type: 'positive',
      });
    }

    if (!user.username) {
      score -= 10;
      factors.push({
        description: 'Отсутствует @username в Telegram',
        delta: -10,
        type: 'negative',
      });
    }

    // 3. Account age in system
    const daysActive = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysActive > 14) {
      score += 10;
      factors.push({
        description: `Активен на платформе более ${Math.floor(daysActive)} дней`,
        delta: +10,
        type: 'positive',
      });
    }

    // 4. Financial history
    const totalDeposits = await prisma.transaction.count({
      where: { userId: user.id, type: 'deposit' },
    });
    if (totalDeposits >= 2) {
      score += 10;
      factors.push({
        description: `Успешных депозитов: ${totalDeposits}`,
        delta: +10,
        type: 'positive',
      });
    }

    const clampedScore = Math.max(0, Math.min(100, score));
    return { score: clampedScore, factors };
  }

  /**
   * Check for hardware collision across users
   */
  private async checkHardwareCollision(userId: string, hardwareHash: string, user: any) {
    const matchingAccounts = await prisma.user.findMany({
      where: {
        hardwareHash,
        id: { not: userId },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (matchingAccounts.length > 0) {
      const mainAccount = matchingAccounts[0];

      // Check if already blocked to prevent spamming
      if (!user.isBlocked) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            isBlocked: true,
            adminNote: `Авто-блокировка: 100% совпадение TMA железа с аккаунтом ${mainAccount.id} (TG: ${mainAccount.telegramId})`,
          },
        });

        // Lock withdrawals on main account
        await prisma.user.update({
          where: { id: mainAccount.id },
          data: {
            withdrawalLocked: true,
            adminNote: `Заморозка вывода: обнаружен дублирующий аккаунт на том же железе (${userId})`,
          },
        });

        // Create alert
        await prisma.securityAlert.create({
          data: {
            userId,
            type: 'multi_account_hardware',
            severity: 'critical',
            description: `Критическое совпадение железа: устройство разделено с ${matchingAccounts.length} аккаунтами. Основной: ${mainAccount.id}`,
          },
        });

        // Send TG alert to main account
        const messageText = `⚠️ Предупреждение о безопасности MacvBet\n\nСистема безопасности зафиксировала попытку входа во второй аккаунт с вашего физического устройства.\n\nПользовательское соглашение (п. 2.1) строго запрещает мультиаккаунтинг.\nДублирующий аккаунт заблокирован, вывод на основном аккаунте временно заморожен. Свяжитесь с поддержкой, если считаете это ошибкой.`;
        await telegramApi.sendMessage(Number(mainAccount.telegramId), messageText).catch(() => {});
      }
    }
  }

  /**
   * Check for IP collisions
   */
  private async checkIpCollision(
    userId: string,
    ipAddress: string,
    ipRecord: any,
    deviceId: string | undefined,
    user: any
  ) {
    const allAccountsOnIp = await prisma.userIpAddress.findMany({
      where: { ipAddress },
      include: { user: true },
      orderBy: { firstSeen: 'asc' },
    });

    if (allAccountsOnIp.length > 1) {
      const mainIpRecord = allAccountsOnIp[0];
      if (mainIpRecord.userId !== userId) {
        const isVpnContext = ipRecord.isVpn || allAccountsOnIp.some((a: any) => a.isVpn);
        const hasSameDevice =
          deviceId && allAccountsOnIp.some((a: any) => a.userId !== userId && a.deviceId === deviceId);

        if (isVpnContext && !hasSameDevice) {
          await prisma.securityAlert.create({
            data: {
              userId,
              type: 'multi_account_suspicion',
              severity: 'medium',
              description: `Shared VPN IP detected: ${ipAddress} (shared with ${allAccountsOnIp.length - 1} others)`,
            },
          });
        } else {
          // Exact home IP match
          if (!user.isBlocked) {
            const mainAccount = mainIpRecord.user;
            await prisma.user.update({
              where: { id: userId },
              data: {
                isBlocked: true,
                adminNote: `Авто-блокировка: совпадение IP ${ipAddress} с основным аккаунтом ${mainAccount.id}`,
              },
            });
            await prisma.user.update({
              where: { id: mainAccount.id },
              data: {
                withdrawalLocked: true,
                adminNote: `Заморозка вывода: обнаружен мульт на том же IP (${ipAddress})`,
              },
            });
            await prisma.securityAlert.create({
              data: {
                userId,
                type: 'multi_account_ip',
                severity: 'high',
                description: `Совпадение IP адреса ${ipAddress} с основным аккаунтом ${mainAccount.id}`,
              },
            });
          }
        }
      }
    }
  }

  /**
   * Check if a withdrawal destination (wallet address, card or BLIK) is shared across multiple users
   */
  async checkWithdrawalCollision(
    userId: string,
    destination: string
  ): Promise<{ collision: boolean; matchingUserIds: string[] }> {
    if (!destination || destination.trim().length < 4) {
      return { collision: false, matchingUserIds: [] };
    }

    const cleanDest = destination.trim().toLowerCase();

    // Query other users who used this exact destination
    const matches = await prisma.withdrawalRequest.findMany({
      where: {
        destination: { equals: cleanDest, mode: 'insensitive' },
        userId: { not: userId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    if (matches.length > 0) {
      const matchingUserIds = matches.map((m) => m.userId);

      // Create critical security alert
      await prisma.securityAlert.create({
        data: {
          userId,
          type: 'multi_account_financial',
          severity: 'critical',
          description: `ФИНАНСОВЫЙ АБУЗ: Попытка вывода на реквизиты (${destination}), которые уже использовались аккаунтами: ${matchingUserIds.join(', ')}`,
        },
      });

      // Instantly drop trust score to 0 and lock withdrawal
      await prisma.user.update({
        where: { id: userId },
        data: {
          trustScore: 0,
          withdrawalLocked: true,
          adminNote: `Авто-заморозка: дублирование платежных реквизитов вывода (${destination})`,
        },
      });

      return { collision: true, matchingUserIds };
    }

    return { collision: false, matchingUserIds: [] };
  }

  /* -----------------------------------------------------------------
   * Admin Security Console API helpers
   * ---------------------------------------------------------------- */

  async getSecurityStats() {
    const [
      totalAlerts,
      unresolvedAlerts,
      blockedUsers,
      lockedWithdrawals,
      hardwareClusters,
      financialClusters,
      ipClusters,
    ] = await Promise.all([
      prisma.securityAlert.count(),
      prisma.securityAlert.count({ where: { resolved: false } }),
      prisma.user.count({ where: { isBlocked: true } }),
      prisma.user.count({ where: { withdrawalLocked: true } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM (
          SELECT hardware_hash FROM users 
          WHERE hardware_hash IS NOT NULL AND hardware_hash != ''
          GROUP BY hardware_hash 
          HAVING COUNT(*) > 1
        ) t
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM (
          SELECT destination FROM withdrawal_requests 
          WHERE destination IS NOT NULL AND destination != ''
          GROUP BY destination 
          HAVING COUNT(DISTINCT user_id) > 1
        ) t
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM (
          SELECT ip_address FROM user_ip_addresses 
          GROUP BY ip_address 
          HAVING COUNT(DISTINCT user_id) > 1
        ) t
      `,
    ]);

    return {
      totalAlerts,
      unresolvedAlerts,
      blockedUsers,
      lockedWithdrawals,
      hardwareClustersCount: Number(hardwareClusters[0]?.count ?? 0),
      financialClustersCount: Number(financialClusters[0]?.count ?? 0),
      ipClustersCount: Number(ipClusters[0]?.count ?? 0),
    };
  }

  async getHardwareClusters(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const clustersRaw = await prisma.$queryRaw<Array<{ hardware_hash: string; accounts: bigint }>>`
      SELECT hardware_hash, COUNT(*) as accounts
      FROM users
      WHERE hardware_hash IS NOT NULL AND hardware_hash != ''
      GROUP BY hardware_hash
      HAVING COUNT(*) > 1
      ORDER BY accounts DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const totalRaw = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) as c FROM (
        SELECT hardware_hash FROM users
        WHERE hardware_hash IS NOT NULL AND hardware_hash != ''
        GROUP BY hardware_hash
        HAVING COUNT(*) > 1
      ) t
    `;
    const total = Number(totalRaw[0]?.c ?? 0);

    if (clustersRaw.length === 0) {
      return { total, page, limit, clusters: [] };
    }

    const hashes = clustersRaw.map((x) => x.hardware_hash);
    const users = await prisma.user.findMany({
      where: { hardwareHash: { in: hashes } },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        isBlocked: true,
        withdrawalLocked: true,
        ignoreIpCollision: true,
        trustScore: true,
        hardwareHash: true,
        deviceSpecs: true,
        adminNote: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const clusters = clustersRaw.map((row) => {
      const clusterUsers = users.filter((u) => u.hardwareHash === row.hardware_hash);
      const specs = clusterUsers.find((u) => u.deviceSpecs)?.deviceSpecs as any;
      return {
        hardwareHash: row.hardware_hash,
        accountsCount: Number(row.accounts),
        deviceSpecs: specs || null,
        users: clusterUsers.map((u) => ({
          ...u,
          telegramId: Number(u.telegramId),
          createdAt: u.createdAt.getTime(),
        })),
      };
    });

    return { total, page, limit, clusters };
  }

  async getFinancialClusters(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const clustersRaw = await prisma.$queryRaw<Array<{ destination: string; accounts: bigint; total_volume: string }>>`
      SELECT destination, COUNT(DISTINCT user_id) as accounts, SUM(amount) as total_volume
      FROM withdrawal_requests
      WHERE destination IS NOT NULL AND destination != ''
      GROUP BY destination
      HAVING COUNT(DISTINCT user_id) > 1
      ORDER BY accounts DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const totalRaw = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) as c FROM (
        SELECT destination FROM withdrawal_requests
        WHERE destination IS NOT NULL AND destination != ''
        GROUP BY destination
        HAVING COUNT(DISTINCT user_id) > 1
      ) t
    `;
    const total = Number(totalRaw[0]?.c ?? 0);

    if (clustersRaw.length === 0) {
      return { total, page, limit, clusters: [] };
    }

    const destinations = clustersRaw.map((x) => x.destination);
    const requests = await prisma.withdrawalRequest.findMany({
      where: { destination: { in: destinations } },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            isBlocked: true,
            withdrawalLocked: true,
            trustScore: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const clusters = clustersRaw.map((row) => {
      const clusterReqs = requests.filter((r) => r.destination === row.destination);
      const uniqueUsersMap = new Map<string, any>();
      for (const r of clusterReqs) {
        if (!uniqueUsersMap.has(r.userId)) {
          uniqueUsersMap.set(r.userId, {
            ...r.user,
            telegramId: Number(r.user.telegramId),
            createdAt: r.user.createdAt.getTime(),
            lastAmount: Number(r.amount),
            currency: r.currency,
            status: r.status,
          });
        }
      }
      return {
        destination: row.destination,
        accountsCount: Number(row.accounts),
        totalVolume: Number(row.total_volume ?? 0),
        users: Array.from(uniqueUsersMap.values()),
      };
    });

    return { total, page, limit, clusters };
  }

  async getUserSecurityDossier(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        securityAlerts: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        userIpAddresses: {
          orderBy: { lastSeen: 'desc' },
          take: 15,
        },
      },
    });

    if (!user) return null;

    // Financial summary
    const [depSum, wdSum, withdrawalDestinations] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId, type: 'deposit' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.withdrawalRequest.aggregate({
        where: { userId, status: 'completed' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.withdrawalRequest.findMany({
        where: { userId },
        select: { destination: true, method: true, status: true, amount: true, createdAt: true },
        distinct: ['destination'],
        take: 10,
      }),
    ]);

    const totalDeposited = Number(depSum._sum.amount ?? 0);
    const totalWithdrawn = Number(wdSum._sum.amount ?? 0);
    const netProfitCasino = totalDeposited - totalWithdrawn;

    const breakdown = await this.calculateTrustScore(
      user,
      user.userIpAddresses[0]?.ipAddress || '',
      user.hardwareHash || undefined
    );

    return {
      id: user.id,
      telegramId: Number(user.telegramId),
      username: user.username,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Игрок',
      isBlocked: user.isBlocked,
      withdrawalLocked: user.withdrawalLocked,
      ignoreIpCollision: user.ignoreIpCollision,
      isPremium: user.isPremium,
      trustScore: user.trustScore,
      trustBreakdown: breakdown.factors,
      hardwareHash: user.hardwareHash,
      deviceSpecs: user.deviceSpecs,
      adminNote: user.adminNote,
      createdAt: user.createdAt.getTime(),
      financials: {
        depositsCount: depSum._count,
        totalDeposited,
        withdrawalsCount: wdSum._count,
        totalWithdrawn,
        netProfitCasino,
        destinations: withdrawalDestinations.map((d) => ({
          destination: d.destination,
          method: d.method,
          status: d.status,
          amount: Number(d.amount),
          date: d.createdAt.getTime(),
        })),
      },
      ips: user.userIpAddresses.map((ip) => ({
        ipAddress: ip.ipAddress,
        firstSeen: ip.firstSeen.getTime(),
        lastSeen: ip.lastSeen.getTime(),
        count: ip.count,
        isRoot: ip.isRoot,
        isVpn: ip.isVpn,
      })),
      alerts: user.securityAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        description: a.description,
        resolved: a.resolved,
        createdAt: a.createdAt.getTime(),
      })),
    };
  }

  /**
   * One-click Unblock & Whitelist action for Admins
   */
  async whitelistAndUnblock(userId: string, adminUserId = 'admin'): Promise<boolean> {
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            isBlocked: false,
            withdrawalLocked: false,
            ignoreIpCollision: true,
            trustScore: 100,
            adminNote: `Разблокирован и добавлен в белый список администратором (${adminUserId})`,
          },
        }),
        prisma.securityAlert.updateMany({
          where: { userId, resolved: false },
          data: { resolved: true },
        }),
        prisma.adminAuditLog.create({
          data: {
            adminUserId,
            adminTelegramId: 0n,
            action: 'user.whitelist_and_unblock',
            targetType: 'user',
            targetId: userId,
            reason: 'Полная разблокировка и добавление в белый список из панели кибербезопасности',
          },
        }),
      ]);
      return true;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to whitelist and unblock user');
      return false;
    }
  }

  /**
   * One-click action to ban all users in a cluster
   */
  async banCluster(
    type: 'hardware' | 'wallet' | 'ip',
    value: string,
    adminUserId = 'admin'
  ): Promise<number> {
    try {
      let targetUserIds: string[] = [];

      if (type === 'hardware') {
        const users = await prisma.user.findMany({
          where: { hardwareHash: value },
          select: { id: true },
        });
        targetUserIds = users.map((u) => u.id);
      } else if (type === 'wallet') {
        const reqs = await prisma.withdrawalRequest.findMany({
          where: { destination: { equals: value, mode: 'insensitive' } },
          select: { userId: true },
          distinct: ['userId'],
        });
        targetUserIds = reqs.map((r) => r.userId);
      } else if (type === 'ip') {
        const ips = await prisma.userIpAddress.findMany({
          where: { ipAddress: value },
          select: { userId: true },
          distinct: ['userId'],
        });
        targetUserIds = ips.map((i) => i.userId);
      }

      if (targetUserIds.length === 0) return 0;

      await prisma.user.updateMany({
        where: { id: { in: targetUserIds } },
        data: {
          isBlocked: true,
          withdrawalLocked: true,
          adminNote: `Бан кластера (${type}: ${value}) администратором ${adminUserId}`,
        },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId,
          adminTelegramId: 0n,
          action: 'cluster.ban_all',
          targetType: type,
          targetId: value,
          reason: `Перманентный бан кластера: заблокировано ${targetUserIds.length} аккаунтов.`,
        },
      });

      return targetUserIds.length;
    } catch (err) {
      logger.error({ err, type, value }, 'Failed to ban cluster');
      return 0;
    }
  }
}

export const securityService = new SecurityService();
