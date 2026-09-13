import { PrismaClient } from '@prisma/client';
import { isAdminTelegramIdAsync } from '../middleware/auth.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=== AUDIT LIABILITIES & WITHDRAWAL ELIGIBILITY ===\n');

  const rows = await prisma.$queryRaw<Array<{
    user_id: string;
    telegram_id: bigint;
    username: string | null;
    first_name: string | null;
    amount: string;
    wager_target: string;
    wager_progress: string;
    is_blocked: boolean;
    withdrawal_locked: boolean;
    lifetime_deposits: string | null;
    has_recent_deposit: number | null;
    deposit_count: bigint | null;
    folux_deposits: string | null;
    folux_count: bigint | null;
  }>>`
    SELECT 
      b.user_id,
      u.telegram_id,
      u.username,
      u.first_name,
      b.amount::text as amount,
      b.wager_target::text as wager_target,
      b.wager_progress::text as wager_progress,
      COALESCE(u.is_blocked, false) as is_blocked,
      COALESCE(u.withdrawal_locked, false) as withdrawal_locked,
      ud.lifetime_deposits::text as lifetime_deposits,
      ud.has_recent_deposit,
      ud.deposit_count,
      mo.folux_deposits::text as folux_deposits,
      mo.folux_count
    FROM balances b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN (
      SELECT 
        user_id,
        SUM(amount) as lifetime_deposits,
        MAX(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as has_recent_deposit,
        COUNT(*)::bigint as deposit_count
      FROM transactions
      WHERE type IN ('deposit', 'manual_deposit', 'deposit_bonus', 'foluxpay', 'cryptobot', 'topup', 'credit', 'manual', 'deposit_credit')
         OR metadata::text ILIKE '%deposit%'
         OR metadata::text ILIKE '%депозит%'
      GROUP BY user_id
    ) ud ON ud.user_id = u.id
    LEFT JOIN (
      SELECT
        user_id,
        SUM(requested_amount) as folux_deposits,
        COUNT(*)::bigint as folux_count
      FROM macvpay_orders
      WHERE status IN ('credited', 'paid', 'completed', 'success')
      GROUP BY user_id
    ) mo ON mo.user_id = u.id
    WHERE b.demo_mode = false AND b.amount > 0
    ORDER BY b.amount DESC
  `;

  console.log(`Total accounts with balance > 0: ${rows.length}`);
  const totalBalance = rows.reduce((acc, r) => acc + Number(r.amount), 0);
  console.log(`Total balance: ${totalBalance.toFixed(2)} zł\n`);

  let withDepositCount = 0;
  let withDepositBalSum = 0;

  let readyToWithdrawCount = 0;
  let readyToWithdrawSum = 0;

  let noWagerCount = 0;
  let noWagerSum = 0;

  console.log('-----------------------------------------------------------------------------------------------------------------');
  console.log('TG ID       | User         | Bal (zł)  | Dep (zł)  | RecDep? | Wager (Tar/Prog) | Blocked? | Admin? | CAN WITHDRAW?');
  console.log('-----------------------------------------------------------------------------------------------------------------');

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bal = Number(r.amount);
    const tgId = Number(r.telegram_id);
    const isAdmin = await isAdminTelegramIdAsync(tgId);
    const depTotal = Math.max(Number(r.lifetime_deposits ?? 0), Number(r.folux_deposits ?? 0));
    const depCount = Number(r.deposit_count ?? 0) + Number(r.folux_count ?? 0);
    const hasRecent = Number(r.has_recent_deposit ?? 0) === 1;
    const wTar = Number(r.wager_target ?? 0);
    const wProg = Number(r.wager_progress ?? 0);
    const isBlocked = r.is_blocked || r.withdrawal_locked;
    const wagerSatisfied = wProg >= wTar;

    // Conditions:
    // Can withdraw = Not blocked, Not admin, Has deposited at least once, Wager completed, Balance >= 50 (min withdrawal)
    const hasDeposited = depTotal > 0 || depCount > 0;
    const canWithdraw = !isAdmin && !isBlocked && hasDeposited && wagerSatisfied && bal >= 50;

    if (hasDeposited && !isAdmin) {
      withDepositCount++;
      withDepositBalSum += bal;
    }

    if (wagerSatisfied && !isAdmin && !isBlocked) {
      noWagerCount++;
      noWagerSum += bal;
    }

    if (canWithdraw) {
      readyToWithdrawCount++;
      readyToWithdrawSum += bal;
    }

    if (i < 25 || depTotal > 0 || bal >= 50) {
      const name = (r.username ? `@${r.username}` : r.first_name || 'anon').slice(0, 12).padEnd(12);
      console.log(
        `${String(tgId).padEnd(11)} | ${name} | ${bal.toFixed(2).padStart(9)} | ${depTotal.toFixed(2).padStart(9)} | ${hasRecent ? 'YES    ' : 'NO     '} | ${wTar.toFixed(0).padStart(5)}/${wProg.toFixed(0).padEnd(5)} | ${isBlocked ? 'BLOCKED ' : 'OK      '} | ${isAdmin ? 'ADMIN ' : 'USER  '} | ${canWithdraw ? '>>> YES <<<' : 'NO'}`
      );
    }
  }

  console.log('\n============================= SUMMARY =============================');
  console.log(`1. Total balances: ${rows.length} accounts, ${totalBalance.toFixed(2)} zł`);
  console.log(`2. Users with completed wager (no wager remaining, not blocked): ${noWagerCount} accounts, ${noWagerSum.toFixed(2)} zł`);
  console.log(`3. Users who made deposits (non-admin): ${withDepositCount} accounts, ${withDepositBalSum.toFixed(2)} zł`);
  console.log(`4. READY TO WITHDRAW (Dep > 0, Wager completed, Not blocked, Bal >= 50 zł): ${readyToWithdrawCount} accounts, ${readyToWithdrawSum.toFixed(2)} zł`);
  console.log('===================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
