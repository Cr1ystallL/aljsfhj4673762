#!/usr/bin/env python3
"""
Complete Database Rollback Utility to restore database state to a specific checkpoint date.

Usage:
  python3 scripts/db_rollback_to_date.py --date 2026-07-27 --dry-run
  python3 scripts/db_rollback_to_date.py --date 2026-07-27 --execute
"""

import sys
import argparse
from datetime import datetime
import psycopg2
import psycopg2.extras
from config import config

def get_pg_connection():
    if not config.USE_POSTGRES or not config.DATABASE_URL:
        print("[!] Postgres is disabled or DATABASE_URL not set in config.")
        return None
    return psycopg2.connect(config.DATABASE_URL)

def perform_rollback(cutoff_date_str, execute=False):
    cutoff_ts = f"{cutoff_date_str} 00:00:00"
    print(f"\n========================================================")
    print(f"       DATABASE ROLLBACK TO CHECKPOINT: {cutoff_ts}")
    print(f"       MODE: {'EXECUTE (MUTATING DB)' if execute else 'DRY RUN (PREVIEW ONLY)'}")
    print(f"========================================================\n")

    conn = get_pg_connection()
    if not conn:
        return

    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    try:
        # 1. Count items to be affected after cutoff
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE created_at >= %s", (cutoff_ts,))
        tx_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM bets WHERE placed_at >= %s", (cutoff_ts,))
        bets_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM withdrawal_requests WHERE created_at >= %s", (cutoff_ts,))
        wd_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM macvpay_orders WHERE created_at >= %s", (cutoff_ts,))
        orders_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM promo_redemptions WHERE created_at >= %s", (cutoff_ts,))
        promo_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM bonus_wheel_spins WHERE created_at >= %s", (cutoff_ts,))
        spins_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM users WHERE created_at >= %s", (cutoff_ts,))
        users_count = cursor.fetchone()[0]

        print(f"[+] Impact Analysis since {cutoff_ts}:")
        print(f"  - Transactions to delete:        {tx_count}")
        print(f"  - Bets to delete:                {bets_count}")
        print(f"  - Withdrawal requests to delete: {wd_count}")
        print(f"  - Macvpay orders to delete:      {orders_count}")
        print(f"  - Promo redemptions to delete:   {promo_count}")
        print(f"  - Bonus wheel spins to delete:   {spins_count}")
        print(f"  - Users registered after cutoff: {users_count}")
        print("")

        # 2. Find users needing balance reset to July 27th state
        cursor.execute("""
            SELECT DISTINCT user_id FROM transactions WHERE created_at >= %s
            UNION
            SELECT DISTINCT user_id FROM withdrawal_requests WHERE created_at >= %s
        """, (cutoff_ts, cutoff_ts))
        affected_user_rows = cursor.fetchall()
        affected_user_ids = [r[0] for r in affected_user_rows]
        print(f"[+] Total active users with post-cutoff activity to restore balance: {len(affected_user_ids)}")

        if not execute:
            print("\n[!] Dry run finished. Run with --execute to perform actual rollback.")
            conn.close()
            return

        # 3. Execute Balance Restoration
        print("\n[*] Restoring user balances to last state before cutoff...")
        restored_count = 0
        for uid in affected_user_ids:
            # Find last transaction balance_after before cutoff
            cursor.execute("""
                SELECT balance_after FROM transactions
                WHERE user_id = %s AND created_at < %s
                ORDER BY created_at DESC LIMIT 1
            """, (uid, cutoff_ts))
            last_tx = cursor.fetchone()

            if last_tx and last_tx['balance_after'] is not None:
                restored_balance = float(last_tx['balance_after'])
            else:
                restored_balance = 0.0

            # Update balance
            cursor.execute("""
                UPDATE balances
                SET amount = %s,
                    updated_at = NOW(),
                    last_synced_at = NOW(),
                    version = version + 1
                WHERE user_id = %s
            """, (restored_balance, uid))
            restored_count += 1

        print(f"[✓] Restored balances for {restored_count} users.")

        # 4. Delete post-cutoff records
        print("[*] Deleting post-cutoff records...")
        cursor.execute("DELETE FROM transactions WHERE created_at >= %s", (cutoff_ts,))
        cursor.execute("DELETE FROM bets WHERE placed_at >= %s", (cutoff_ts,))
        cursor.execute("DELETE FROM withdrawal_requests WHERE created_at >= %s", (cutoff_ts,))
        cursor.execute("DELETE FROM macvpay_orders WHERE created_at >= %s", (cutoff_ts,))
        cursor.execute("DELETE FROM promo_redemptions WHERE created_at >= %s", (cutoff_ts,))
        cursor.execute("DELETE FROM bonus_wheel_spins WHERE created_at >= %s", (cutoff_ts,))
        
        # Optionally delete game_rounds if table exists
        try:
            cursor.execute("DELETE FROM game_rounds WHERE created_at >= %s", (cutoff_ts,))
        except Exception:
            conn.rollback()

        # Delete users registered after cutoff date (cascades to their balance/sessions)
        cursor.execute("DELETE FROM users WHERE created_at >= %s", (cutoff_ts,))

        conn.commit()
        print(f"\n[✓✓✓] SUCCESS! Database state has been completely rolled back to {cutoff_ts}!")

    except Exception as e:
        conn.rollback()
        print(f"\n[!] ROLLBACK FAILED: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Database Rollback to Checkpoint Date")
    parser.add_argument("--date", default="2026-07-27", help="Cutoff date (YYYY-MM-DD)")
    parser.add_argument("--execute", action="store_true", help="Actually execute the rollback in DB")
    parser.add_argument("--dry-run", action="store_true", help="Preview impact without changing DB")
    args = parser.parse_args()

    perform_rollback(args.date, execute=args.execute)
