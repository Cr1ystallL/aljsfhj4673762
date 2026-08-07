#!/usr/bin/env python3
"""
Detailed user balance inspection script targeting 5th August balance state.

Usage:
  python3 scripts/check_user_balance.py --tg-ids 837158208 1876418609 687005254
"""

import os
import sys
import argparse
import json
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

def inspect_user(cursor, telegram_id):
    print("\n" + "=" * 75)
    print(f"       BALANCE AUDIT ON 5TH AUGUST FOR TELEGRAM ID: {telegram_id}")
    print("=" * 75 + "\n")

    # 1. User details
    cursor.execute("""
        SELECT id, telegram_id, username, first_name, last_name, created_at, is_blocked
        FROM users WHERE telegram_id = %s
    """, (telegram_id,))
    user = cursor.fetchone()

    if not user:
        print(f"[!] User with Telegram ID {telegram_id} NOT FOUND in database!")
        return

    user_id = user['id']
    print(f"👤 User Details:")
    print(f"   - UUID:        {user['id']}")
    print(f"   - Telegram ID: {user['telegram_id']}")
    print(f"   - Username:    @{user['username'] if user['username'] else 'N/A'}")
    print(f"   - Full Name:   {user['first_name'] or ''} {user['last_name'] or ''}")
    print(f"   - Registered:  {user['created_at']}")
    print("")

    # 2. Last Transaction BEFORE or ON 5th August 2026 23:59:59
    end_of_5th = "2026-08-05 23:59:59"
    cursor.execute("""
        SELECT balance_after, created_at, type, amount FROM transactions
        WHERE user_id = %s AND created_at <= %s
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, end_of_5th))
    tx_5th = cursor.fetchone()

    bal_table_on_5th = float(tx_5th['balance_after']) if tx_5th else 0.0

    # 3. Check Contest Winnings ON or BEFORE 5th August
    cursor.execute("""
        SELECT id, action, payload_after, reason, created_at
        FROM admin_audit_log
        WHERE action = 'contest.draw' AND created_at <= %s
        ORDER BY created_at ASC
    """, (end_of_5th,))
    contest_logs = cursor.fetchall()
    
    contest_winnings_up_to_5th = 0.0
    contest_details = []

    for clog in contest_logs:
        payload = clog['payload_after']
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        if isinstance(payload, dict) and 'winners' in payload:
            for w in payload['winners']:
                if w.get('userId') == user_id:
                    amt = float(w.get('amount', 0))
                    place = w.get('place')
                    contest_winnings_up_to_5th += amt
                    contest_details.append({
                        'date': clog['created_at'],
                        'place': place,
                        'amount': amt
                    })

    # Total balance on 5th August = Transaction table balance on 5th + contest wins on/before 5th
    total_balance_on_5th = bal_table_on_5th + contest_winnings_up_to_5th

    print(f"📅 BALANCE STATE ON 5TH AUGUST 2026 (23:59:59):")
    if tx_5th:
        print(f"   - Last Transaction on/before 5th Aug: {bal_table_on_5th:.2f} PLN/USD (at {tx_5th['created_at']})")
    else:
        print(f"   - No transactions recorded on or before 5th Aug (Balance: 0.00)")

    if contest_details:
        print(f"   - Contest Winnings on/before 5th Aug: +{contest_winnings_up_to_5th:.2f} PLN/USD")
        for cd in contest_details:
            print(f"     * [{cd['date']}] Place #{cd['place']}: +{cd['amount']} PLN")
    else:
        print(f"   - Contest Winnings on/before 5th Aug: 0.00")

    print(f"   👉 TOTAL EFFECTIVE BALANCE ON 5TH AUGUST: {total_balance_on_5th:.2f} PLN/USD")
    print("")

    # 4. Transactions on 5th August specifically
    cursor.execute("""
        SELECT id, type, amount, balance_before, balance_after, game_type, created_at
        FROM transactions
        WHERE user_id = %s AND created_at >= '2026-08-05 00:00:00' AND created_at <= '2026-08-05 23:59:59'
        ORDER BY created_at ASC
    """, (user_id,))
    txs_on_5th = cursor.fetchall()
    print(f"📋 Transactions ON 5th August ({len(txs_on_5th)} txs):")
    if txs_on_5th:
        for t in txs_on_5th:
            game = f" ({t['game_type']})" if t['game_type'] else ""
            print(f"   [{t['created_at']}] Type: {t['type']:<12}{game:<15} Amt: {t['amount']:>8} | Bal: {t['balance_before']} -> {t['balance_after']}")
    else:
        print("   - No transactions on 5th August.")

    print("\n" + "=" * 75 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Inspect user balance history specifically on 5th August.")
    parser.add_argument("--tg-ids", nargs="+", type=int, required=True, help="List of Telegram IDs")

    args = parser.parse_args()

    conn = get_pg_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    for tg_id in args.tg_ids:
        inspect_user(cursor, tg_id)

    conn.close()

if __name__ == "__main__":
    main()
