import asyncio
import logging
from datetime import datetime, timedelta
import psycopg2
from config import config

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('daily_revshare')

async def calculate_daily_revshare():
    if not config.USE_POSTGRES:
        logger.warning("Postgres is disabled, skipping RevShare calculation.")
        return

    try:
        conn = psycopg2.connect(config.DATABASE_URL)
        cursor = conn.cursor()
        
        # Calculate for yesterday
        target_date = (datetime.now() - timedelta(days=1)).date()
        logger.info(f"Calculating RevShare for {target_date}")
        
        # We need all affiliates
        cursor.execute("SELECT telegram_id, id FROM users WHERE telegram_id IS NOT NULL")
        all_users = cursor.fetchall()
        
        for aff_tg_id, aff_uuid in all_users:
            aff_tg_id = int(aff_tg_id)
            
            # Find referrals
            cursor.execute("SELECT id FROM users WHERE referrer_telegram_id = %s", (aff_tg_id,))
            referrals = cursor.fetchall()
            if not referrals:
                continue
                
            ref_ids = [str(r[0]) for r in referrals]
            
            # 1. Total Bets and Payouts for yesterday
            cursor.execute('''
                SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(payout), 0) 
                FROM "Bet" 
                WHERE user_id = ANY(%s) AND DATE(created_at) = %s
            ''', (ref_ids, target_date))
            res = cursor.fetchone()
            total_bets = float(res[0]) if res else 0.0
            total_wins = float(res[1]) if res else 0.0
            
            # GGR = Bets - Wins
            ggr = total_bets - total_wins
            
            # NGR = GGR - Bonuses (0 for now) - (Bets * 0.044) RTP/Commission
            ngr = ggr - (total_bets * 0.044)
            
            # 2. Get Deposits (FD, RD, Sum)
            cursor.execute('''
                SELECT user_id, COALESCE(SUM(amount), 0), COUNT(*) 
                FROM macvpay_orders 
                WHERE user_id = ANY(%s) AND status = 'COMPLETED' AND method != 'WITHDRAWAL' AND DATE(created_at) = %s
                GROUP BY user_id
            ''', (ref_ids, target_date))
            deps = cursor.fetchall()
            dep_sum = sum([float(d[1]) for d in deps])
            
            # Check FDs
            fd_count = 0
            rd_count = 0
            for u_id, amt, cnt in deps:
                cursor.execute("SELECT COUNT(*) FROM macvpay_orders WHERE user_id = %s AND status = 'COMPLETED' AND method != 'WITHDRAWAL' AND DATE(created_at) < %s", (u_id, target_date))
                prev_deps = cursor.fetchone()[0]
                if prev_deps == 0:
                    fd_count += 1
                    rd_count += (cnt - 1)
                else:
                    rd_count += cnt

            income = ngr * 0.5

            if total_bets > 0 or dep_sum > 0:
                # Update AffiliateStatsDaily
                cursor.execute('''
                    INSERT INTO affiliate_stats_daily (id, date, affiliate_telegram_id, clicks, fd_count, rd_count, dep_sum, ggr, ngr, income)
                    VALUES (gen_random_uuid(), %s, %s, 0, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (date, affiliate_telegram_id) DO UPDATE SET
                    fd_count = affiliate_stats_daily.fd_count + EXCLUDED.fd_count,
                    rd_count = affiliate_stats_daily.rd_count + EXCLUDED.rd_count,
                    dep_sum = affiliate_stats_daily.dep_sum + EXCLUDED.dep_sum,
                    ggr = affiliate_stats_daily.ggr + EXCLUDED.ggr,
                    ngr = affiliate_stats_daily.ngr + EXCLUDED.ngr,
                    income = affiliate_stats_daily.income + EXCLUDED.income
                ''', (target_date, aff_tg_id, fd_count, rd_count, dep_sum, ggr, ngr, income))
                
                # Update Revshare Balance and Carryover
                cursor.execute("SELECT revshare_balance, negative_carryover FROM users WHERE telegram_id = %s", (aff_tg_id,))
                bal_res = cursor.fetchone()
                if bal_res:
                    rev_bal = float(bal_res[0] or 0)
                    neg_car = float(bal_res[1] or 0)
                    
                    if income < 0:
                        neg_car += abs(income)
                    else:
                        if neg_car > 0:
                            if income >= neg_car:
                                income -= neg_car
                                neg_car = 0
                                rev_bal += income
                            else:
                                neg_car -= income
                        else:
                            rev_bal += income
                            
                    cursor.execute("UPDATE users SET revshare_balance = %s, negative_carryover = %s WHERE telegram_id = %s", (rev_bal, neg_car, aff_tg_id))
        
        conn.commit()
        conn.close()
        logger.info("Daily RevShare calculation completed successfully.")
        
    except Exception as e:
        logger.error(f"Error calculating daily revshare: {e}")

async def revshare_worker_loop(bot):
    logger.info("Starting RevShare worker loop...")
    while True:
        now = datetime.now()
        # Run at 00:05 every day
        target = now.replace(hour=0, minute=5, second=0, microsecond=0)
        if now > target:
            target += timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        
        logger.info(f"Sleeping for {wait_seconds} seconds until next RevShare calculation.")
        await asyncio.sleep(wait_seconds)
        await calculate_daily_revshare()

if __name__ == '__main__':
    asyncio.run(calculate_daily_revshare())
