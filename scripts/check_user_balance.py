#!/usr/bin/env python3
"""
Script to inspect user balance history between specific dates (e.g. 27th to 5th)
and check the final balance before a database rollback.

Usage:
  python3 scripts/check_user_balance.py --tg-id 837158208
  python3 scripts/check_user_balance.py --tg-id 837158208 --start-date 2026-07-27 --end-date 2026-08-05
"""

import os
import sys
import argparse
from datetime import datetime
import psycopg2
import psycopg2.extras

def load_env():
    search_paths = [
        '/var/www/MACVBET/mini-app/apps/backend/.env',
        '/var/www/MACVBET/.env',
        '/var/www/MACVBET/mini-app/.env',
        os.path.join(os.getcwd(), '.env'),
        os.path.join(os.getcwd(), '..', '.env'),
        os.path.join(os.getcwd(), 'apps', 'backend', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
        os.path.join(os.path.dirname(__file__), '..', 'apps', 'backend', '.env'),
    ]
    for p in search_paths:
        p = os.path.abspath(p)
        if os.path.isfile(p):
            with open(p, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip().strip('"\''))

def get_pg_connection():
    load_env()
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        db_url = "postgresql://postgres:postgres@localhost:5432/casino_miniapp"
    return psycopg2.connect(db_url)

def inspect_user_balance(telegram_id, start_date_str="2026-07-27", end_date_str="2026-08-05"):
    conn = get_pg_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    print("\n" + "=" * 70)
    print(f"       USER BALANCE AUDIT REPORT: Telegram ID {telegram_id}")
    print(f"       Target Period: {start_date_str} to {end_date_str}")
    print("=" * 70 + "\n")

    # 1. Get User Details
    cursor.execute("""
        SELECT id, telegram_id, username, first_name, last_name, created_at, is_blocked
        FROM users WHERE telegram_id = %s
    """, (telegram_id,))
    user = cursor.fetchone()

    if not user:
        print(f"[!] User with Telegram ID {telegram_id} not found in database!")
        conn.close()
        return

    user_id = user['id']
    print(f"👤 User Info:")
    print(f"   - Internal UUID: {user['id']}")
    print(f"   - Telegram ID:   {user['telegram_id']}")
    print(f"   - Username:      @{user['username'] if user['username'] else 'N/A'}")
    print(f"   - Full Name:     {user['first_name'] or ''} {user['last_name'] or ''}")
    print(f"   - Registered:    {user['created_at']}")
    print(f"   - Is Blocked:    {user['is_blocked']}")
    print("")

    # 2. Current Balance
    cursor.execute("""
        SELECT amount, currency, wager_target, wager_progress, updated_at
        FROM balances WHERE user_id = %s
    """, (user_id,))
    balance = cursor.fetchone()
    if balance:
        print(f"💰 Current DB Balance:")
        print(f"   - Amount:         {balance['amount']} {balance['currency']}")
        print(f"   - Wager Target:   {balance['wager_target']}")
        print(f"   - Wager Progress: {balance['wager_progress']}")
        print(f"   - Last Updated:   {balance['updated_at']}")
    else:
        print("⚠️ No balance record found!")
    print("")

    # 3. Check Admin Audit Log (Rollbacks & Admin actions)
    cursor.execute("""
        SELECT action, payload_before, payload_after, reason, created_at
        FROM admin_audit_log
        WHERE target_id = %s OR payload_before::text LIKE %s OR payload_after::text LIKE %s
        ORDER BY created_at DESC
    """, (user_id, f"%{user_id}%", f"%{user_id}%"))
    audit_logs = cursor.fetchall()

    print(f"📜 Admin Audit / Rollback Logs ({len(audit_logs)} records):")
    if audit_logs:
        for log in audit_logs:
            print(f"   [{log['created_at']}] Action: {log['action']} | Reason: {log['reason']}")
            print(f"      - Before: {log['payload_before']}")
            print(f"      - After:  {log['payload_after']}")
    else:
        print("   - No audit log entries found for this user.")
    print("")

    # 4. Check Transactions in period (27th to 5th)
    start_ts = f"{start_date_str} 00:00:00"
    end_ts = f"{end_date_str} 23:59:59"

    cursor.execute("""
        SELECT id, type, amount, balance_before, balance_after, game_type, metadata, created_at
        FROM transactions
        WHERE user_id = %s AND created_at >= %s AND created_at <= %s
        ORDER BY created_at ASC
    """, (user_id, start_ts, end_ts))
    period_txs = cursor.fetchall()

    print(f"📊 Transactions from {start_date_str} to {end_date_str} ({len(period_txs)} transactions):")
    if period_txs:
        first_tx = period_txs[0]
        last_tx = period_txs[-1]
        
        max_bal = max(float(t['balance_after']) for t in period_txs)
        min_bal = min(float(t['balance_after']) for t in period_txs)

        print(f"   - Opening Balance ({first_tx['created_at']}): {first_tx['balance_before']} PLN")
        print(f"   - Closing Balance ({last_tx['created_at']}): {last_tx['balance_after']} PLN")
        print(f"   - Highest Balance in Period: {max_bal} PLN")
        print(f"   - Lowest Balance in Period:  {min_bal} PLN")
        print("")
        print("   Detailed List of Transactions:")
        for t in period_txs:
            game = f" ({t['game_type']})" if t['game_type'] else ""
            print(f"     [{t['created_at']}] Type: {t['type']:<12}{game:<15} Amount: {t['amount']:>10} PLN | Bal Before: {t['balance_before']:>10} -> Bal After: {t['balance_after']:>10}")
    else:
        print("   - No transactions recorded in this date range.")
    print("")

    # 5. Last Balance BEFORE DB Rollback
    # Check transactions right before cutoff (e.g. 2026-07-27 00:00:00)
    cursor.execute("""
        SELECT balance_after, created_at FROM transactions
        WHERE user_id = %s AND created_at < %s
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, start_ts))
    last_before_cutoff = cursor.fetchone()

    # Check overall last transaction ever recorded for user (if rollback deleted post-cutoff or if post-cutoff transactions still exist)
    cursor.execute("""
        SELECT balance_after, balance_before, type, amount, created_at FROM transactions
        WHERE user_id = %s
        ORDER BY created_at DESC LIMIT 1
    """, (user_id,))
    latest_overall_tx = cursor.fetchone()

    print(f"🔍 Rollback Audit & Final Balance Analysis:")
    if last_before_cutoff:
        print(f"   - Balance BEFORE cutoff ({start_date_str}): {last_before_cutoff['balance_after']} PLN (at {last_before_cutoff['created_at']})")
    else:
        print(f"   - No transactions found before cutoff date ({start_date_str}).")

    if latest_overall_tx:
        print(f"   - Latest transaction recorded in DB: {latest_overall_tx['balance_after']} PLN (type: {latest_overall_tx['type']}, amount: {latest_overall_tx['amount']}, at {latest_overall_tx['created_at']})")

    # Check deposits & withdrawals summary
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawals
        FROM transactions WHERE user_id = %s
    """, (user_id,))
    totals = cursor.fetchone()
    print(f"   - Total Deposits All Time:    {totals['total_deposits']} PLN")
    print(f"   - Total Withdrawals All Time: {totals['total_withdrawals']} PLN")

    print("\n" + "=" * 70 + "\n")
    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect user balance history and pre-rollback balance.")
    parser.add_argument("--tg-id", type=int, required=True, help="Telegram ID of the user (e.g. 837158208)")
    parser.add_argument("--start-date", default="2026-07-27", help="Start date (YYYY-MM-DD), default 2026-07-27")
    parser.add_argument("--end-date", default="2026-08-05", help="End date (YYYY-MM-DD), default 2026-08-05")

    args = parser.parse_args()
    inspect_user_balance(args.tg_id, args.start_date, args.end_date)
