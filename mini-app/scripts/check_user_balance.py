#!/usr/bin/env python3
"""
Detailed user balance inspection script for post-27th July activity and pre-rollback balance audit.

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

def inspect_user(cursor, telegram_id, start_date_str="2026-07-27"):
    print("\n" + "=" * 75)
    print(f"       POST-27TH BALANCE AUDIT FOR TELEGRAM ID: {telegram_id}")
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

    # 2. Current DB Balance
    cursor.execute("SELECT amount, wager_target, wager_progress, updated_at FROM balances WHERE user_id = %s", (user_id,))
    balance = cursor.fetchone()
    if balance:
        print(f"💰 Current DB Balance: {balance['amount']} USD/PLN (Updated: {balance['updated_at']})")
    else:
        print("⚠️ No balance row found in DB!")
    print("")

    # 3. Base Balance on 27.07 (last tx before 2026-07-27 00:00:00)
    cutoff_ts = f"{start_date_str} 00:00:00"
    cursor.execute("""
        SELECT balance_after, created_at FROM transactions
        WHERE user_id = %s AND created_at < %s
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, cutoff_ts))
    base_tx = cursor.fetchone()
    base_balance = float(base_tx['balance_after']) if base_tx else 0.0
    print(f"📌 Base Balance ON {start_date_str} (before post-27 activity): {base_balance} PLN/USD")
    if base_tx:
        print(f"   (Last tx before cutoff at {base_tx['created_at']})")
    print("")

    # 4. Check Contest Draws in Admin Audit Log after 27.07
    cursor.execute("""
        SELECT id, action, payload_after, reason, created_at
        FROM admin_audit_log
        WHERE action = 'contest.draw' AND created_at >= %s
        ORDER BY created_at ASC
    """, (cutoff_ts,))
    contest_logs = cursor.fetchall()
    
    contest_winnings = 0.0
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
                    contest_winnings += amt
                    contest_details.append({
                        'date': clog['created_at'],
                        'place': place,
                        'amount': amt,
                        'reason': clog['reason']
                    })

    if contest_details:
        print(f"🏆 Contest Wins after {start_date_str}:")
        for cd in contest_details:
            print(f"   - [{cd['date']}] Place #{cd['place']}: +{cd['amount']} PLN (Reason: {cd['reason']})")
        print(f"   Total Contest Winnings: +{contest_winnings} PLN")
    else:
        print(f"🏆 Contest Wins after {start_date_str}: None")
    print("")

    # 5. Transactions recorded after 27.07
    cursor.execute("""
        SELECT id, type, amount, balance_before, balance_after, game_type, created_at
        FROM transactions
        WHERE user_id = %s AND created_at >= %s
        ORDER BY created_at ASC
    """, (user_id, cutoff_ts))
    post_txs = cursor.fetchall()

    print(f"📊 Transactions recorded after {start_date_str} ({len(post_txs)} transactions):")
    max_bal_tx = base_balance
    min_bal_tx = base_balance
    if post_txs:
        for t in post_txs:
            b_after = float(t['balance_after'])
            if b_after > max_bal_tx:
                max_bal_tx = b_after
            if b_after < min_bal_tx:
                min_bal_tx = b_after
            game = f" ({t['game_type']})" if t['game_type'] else ""
            print(f"   [{t['created_at']}] Type: {t['type']:<12}{game:<15} Amount: {t['amount']:>10} | Bal: {t['balance_before']} -> {t['balance_after']}")
    else:
        print("   - No transaction records exist after 27th (wiped by rollback or no activity recorded).")
    print("")

    # 6. Overall Pre-Rollback Balance Estimation
    calculated_pre_rollback_balance = base_balance + contest_winnings
    if post_txs:
        net_tx_change = float(post_txs[-1]['balance_after']) - float(post_txs[0]['balance_before'])
        calculated_pre_rollback_balance += net_tx_change

    max_reached_after_27 = max(max_bal_tx, base_balance + contest_winnings)

    print(f"💡 SUMMARY FOR USER {telegram_id} (@{user['username'] or 'N/A'}):")
    print(f"   1️⃣ Balance ON 27th July:                  {base_balance:.2f} PLN/USD")
    print(f"   2️⃣ Contest Winnings (won after 27th):     +{contest_winnings:.2f} PLN/USD")
    print(f"   3️⃣ Max Peak Balance reached after 27th:  {max_reached_after_27:.2f} PLN/USD")
    print(f"   4️⃣ Calculated Total Balance BEFORE Rollback: {calculated_pre_rollback_balance:.2f} PLN/USD")
    print(f"   5️⃣ Current DB Balance:                    {float(balance['amount']) if balance else 0.0:.2f} PLN/USD")
    print("=" * 75 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Inspect user balance history after July 27th.")
    parser.add_argument("--tg-ids", nargs="+", type=int, required=True, help="List of Telegram IDs (e.g. 837158208 1876418609 687005254)")
    parser.add_argument("--start-date", default="2026-07-27", help="Cutoff date YYYY-MM-DD (default 2026-07-27)")

    args = parser.parse_args()

    conn = get_pg_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    for tg_id in args.tg_ids:
        inspect_user(cursor, tg_id, args.start_date)

    conn.close()

if __name__ == "__main__":
    main()
