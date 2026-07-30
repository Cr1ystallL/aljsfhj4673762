import type { PrismaClient } from '@prisma/client';
import { walletConfig } from './wallet-config.js';
import { logger } from '../utils/logger.js';

/**
 * Background Blockchain Auto-Checker Service
 * Runs every 12 seconds to poll TronGrid (TRC20), TonCenter (TON), and BSC RPC (BEP20).
 * Matches incoming transfers against pending direct crypto deposits by exact target unique_usdt amount.
 * Automatically credits user balance and marks deposit as paid.
 */

class CryptoWorkerService {
  private prisma: PrismaClient | null = null;
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  start(prisma: PrismaClient) {
    this.prisma = prisma;
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Crypto deposit blockchain auto-checker worker started.');

    // Run poll loop every 12 seconds
    this.intervalTimer = setInterval(() => {
      void this.pollBlockchains();
    }, 12000);

    // Initial check immediately
    void this.pollBlockchains();
  }

  stop() {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async pollBlockchains() {
    if (!this.prisma) return;

    try {
      // 1. Expire outdated pending deposits
      await this.prisma.$executeRaw`
        UPDATE direct_crypto_deposits
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending' AND expires_at <= NOW()
      `;

      // 2. Fetch active pending deposits
      const pendingDeposits = await this.prisma.$queryRaw<
        {
          id: string;
          user_id: string;
          telegram_id: bigint;
          network: string;
          requested_pln: string;
          unique_usdt: string;
          fx_rate: string;
          deposit_address: string;
        }[]
      >`
        SELECT id, user_id, telegram_id, network, requested_pln, unique_usdt, fx_rate, deposit_address
        FROM direct_crypto_deposits
        WHERE status = 'pending' AND expires_at > NOW()
      `;

      if (!pendingDeposits.length) return;

      const cfg = await walletConfig.get();

      // Poll TRC20 deposits
      const trc20Pending = pendingDeposits.filter((d) => d.network === 'TRC20');
      if (trc20Pending.length && cfg.walletTrc20) {
        await this.checkTrc20Deposits(cfg.walletTrc20, trc20Pending);
      }

      // Poll TON deposits
      const tonPending = pendingDeposits.filter((d) => d.network === 'TON');
      if (tonPending.length && cfg.walletTon) {
        await this.checkTonDeposits(cfg.walletTon, tonPending);
      }

      // Poll BEP20 deposits
      const bep20Pending = pendingDeposits.filter((d) => d.network === 'BEP20');
      if (bep20Pending.length && cfg.walletBep20) {
        await this.checkBep20Deposits(cfg.walletBep20, bep20Pending);
      }
    } catch (err) {
      logger.error({ err }, 'CryptoWorker pollBlockchains error');
    }
  }

  private async checkTrc20Deposits(address: string, pendingList: Array<any>) {
    try {
      const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?only_confirmed=true&limit=20`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;

      const data = (await res.json()) as any;
      const txs = data?.data || [];

      for (const tx of txs) {
        if (tx.to !== address) continue;
        const amount = Number(tx.value) / 1e6; // USDT TRC20 6 decimals
        const txHash = tx.transaction_id;

        await this.tryMatchAndCredit(amount, txHash, 'TRC20', pendingList);
      }
    } catch (err) {
      logger.error({ err, address }, 'CryptoWorker checkTrc20Deposits failed');
    }
  }

  private async checkTonDeposits(address: string, pendingList: Array<any>) {
    try {
      const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(address)}&limit=20`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return;

      const data = (await res.json()) as any;
      const txs = data?.result || [];

      for (const tx of txs) {
        const inMsg = tx.in_msg;
        if (!inMsg || !inMsg.value) continue;
        const amount = Number(inMsg.value) / 1e9; // TON 9 decimals
        const txHash = tx.transaction_id?.hash || inMsg.hash;

        await this.tryMatchAndCredit(amount, txHash, 'TON', pendingList);
      }
    } catch (err) {
      logger.error({ err, address }, 'CryptoWorker checkTonDeposits failed');
    }
  }

  private async checkBep20Deposits(address: string, pendingList: Array<any>) {
    try {
      const apiKey = process.env.BSCSCAN_API_KEY || 'YourApiKeyToken';
      const url = `https://api.bscscan.com/api?module=account&action=tokentx&address=${address}&sort=desc&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = (await res.json()) as any;
      const txs = data?.result || [];

      for (const tx of txs) {
        if (tx.to?.toLowerCase() !== address.toLowerCase()) continue;
        const amount = Number(tx.value) / 1e18; // USDT BEP20 18 decimals
        const txHash = tx.hash;

        await this.tryMatchAndCredit(amount, txHash, 'BEP20', pendingList);
      }
    } catch (err) {
      logger.error({ err, address }, 'CryptoWorker checkBep20Deposits failed');
    }
  }

  private async tryMatchAndCredit(
    receivedAmount: number,
    txHash: string,
    network: string,
    pendingList: Array<any>
  ) {
    if (!this.prisma || !receivedAmount || receivedAmount <= 0) return;

    for (const dep of pendingList) {
      const targetAmount = Number(dep.unique_usdt);

      // Check if received amount matches target unique_usdt (with 0.0002 tolerance margin)
      if (Math.abs(receivedAmount - targetAmount) <= 0.0002) {
        try {
          // Verify this tx_hash was not processed before
          const existingTx = await this.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM direct_crypto_deposits WHERE tx_hash = ${txHash}
          `;
          if (Number(existingTx[0]?.count || 0) > 0) return;

          const plnAmount = Number(dep.requested_pln);
          const userId = dep.user_id;

          // Process deposit in PostgreSQL
          await this.prisma.$transaction(async (tx) => {
            // Update deposit record to paid
            await tx.$executeRaw`
              UPDATE direct_crypto_deposits
              SET status = 'paid', tx_hash = ${txHash}, paid_at = NOW(), updated_at = NOW()
              WHERE id = ${dep.id} AND status = 'pending'
            `;

            // Upsert User Balance
            await tx.$executeRaw`
              INSERT INTO balances (id, user_id, amount, currency, created_at, updated_at)
              VALUES (gen_random_uuid()::text, ${userId}, ${plnAmount}::numeric, 'PLN', NOW(), NOW())
              ON CONFLICT (user_id)
              DO UPDATE SET amount = balances.amount + ${plnAmount}::numeric, updated_at = NOW()
            `;

            // Create Transaction record
            const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            await tx.$executeRaw`
              INSERT INTO transactions (
                id, user_id, type, amount, status, created_at
              ) VALUES (
                ${txId}, ${userId}, 'deposit', ${plnAmount}::numeric, 'completed', NOW()
              )
            `;

            // Link credit transaction id
            await tx.$executeRaw`
              UPDATE direct_crypto_deposits
              SET credit_tx_id = ${txId}
              WHERE id = ${dep.id}
            `;
          });

          logger.info(
            { depositId: dep.id, userId, plnAmount, uniqueUsdt: targetAmount, network, txHash },
            'Direct crypto deposit successfully matched and credited!'
          );

          break; // Stop matching loop for this tx
        } catch (matchErr) {
          logger.error({ err: matchErr, depositId: dep.id }, 'Failed to credit direct crypto deposit');
        }
      }
    }
  }
}

export const cryptoWorker = new CryptoWorkerService();
