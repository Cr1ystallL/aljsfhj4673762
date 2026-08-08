#!/usr/bin/env python3
"""
Forensic audit script for user bets, game activity, bet frequency, and balance growth on a specific date.

Usage:
  python3 scripts/audit_user_bets.py --tg-id 1876418609 --date 2026-08-07
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

def audit_user(telegram_id, date_str="2026-08-07"):
    conn = get_pg_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    start_ts = f"{date_str} 00:00:00"
    end_ts = f"{date_str} 23:59:59"

    print("\n" + "=" * 80)
    print(f"       FORENSIC BET AUDIT REPORT FOR TELEGRAM ID: {telegram_id}")
    print(f"       Target Date: {date_str}")
    print("=" * 80 + "\n")

    # 1. User Info
    cursor.execute("""
        SELECT id, telegram_id, username, first_name, last_name, created_at, is_blocked, withdrawal_locked
        FROM users WHERE telegram_id = %s
    """, (telegram_id,))
    user = cursor.fetchone()

    if not user:
        print(f"[!] User {telegram_id} not found in database!")
        conn.close()
        return

    user_id = user['id']
    print(f"👤 User Profile:")
    print(f"   - UUID:             {user['id']}")
    print(f"   - Telegram ID:      {user['telegram_id']}")
    print(f"   - Username:         @{user['username'] if user['username'] else 'N/A'}")
    print(f"   - Full Name:        {user['first_name'] or ''} {user['last_name'] or ''}")
    print(f"   - Registration:     {user['created_at']}")
    print(f"   - Is Blocked:       {user['is_blocked']}")
    print(f"   - Withdrawal Lock:  {user['withdrawal_locked']}")
    print("")

    # 2. Current Balance & Withdrawal Requests
    cursor.execute("SELECT amount, currency, wager_target, wager_progress FROM balances WHERE user_id = %s", (user_id,))
    bal = cursor.fetchone()
    if bal:
        print(f"💰 Current DB Balance: {bal['amount']} {bal['currency']} (Wager Target: {bal['wager_target']}, Progress: {bal['wager_progress']})")

    cursor.execute("SELECT id, amount, status, destination, created_at FROM withdrawal_requests WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
    wds = cursor.fetchall()
    if wds:
        print(f"💸 Withdrawal Requests ({len(wds)} total):")
        for w in wds:
            print(f"   - [{w['created_at']}] Amount: {w['amount']} | Status: {w['status']} | Dest: {w['destination']}")
    else:
        print("💸 Withdrawal Requests: None")
    print("")

    # 3. Bets on date_str
    cursor.execute("""
        SELECT id, game_type, amount, state, payout, multiplier, metadata, placed_at, resolved_at
        FROM bets
        WHERE user_id = %s AND placed_at >= %s AND placed_at <= %s
        ORDER BY placed_at ASC
    """, (user_id, start_ts, end_ts))
    bets = cursor.fetchall()

    print(f"🎲 BET STATS ON {date_str}:")
    total_bets = len(bets)
    print(f"   - Total Bets Placed:    {total_bets}")

    if total_bets == 0:
        print("   ⚠️ No bets found in 'bets' table on this date! Checking transactions table...")
    else:
        wins = [b for b in bets if b['state'] == 'won' or (b['payout'] and float(b['payout']) > 0)]
        losses = [b for b in bets if b['state'] == 'lost' or (b['payout'] is not None and float(b['payout']) == 0)]
        
        total_wagered = sum(float(b['amount']) for b in bets)
        total_payout = sum(float(b['payout'] or 0) for b in bets)
        net_profit = total_payout - total_wagered
        win_rate = (len(wins) / total_bets * 100) if total_bets > 0 else 0

        multipliers = [float(b['multiplier']) for b in bets if b['multiplier'] is not None]
        max_mult = max(multipliers) if multipliers else 0.0

        print(f"   - Wins:                 {len(wins)} ({win_rate:.1f}%)")
        print(f"   - Losses:               {len(losses)}")
        print(f"   - Total Wagered Amount: {total_wagered:.2f} PLN/USD")
        print(f"   - Total Payout Received:{total_payout:.2f} PLN/USD")
        print(f"   - Net Profit/Loss:      {net_profit:+.2f} PLN/USD")
        print(f"   - Highest Multiplier:   {max_mult}x")
        print("")

        # Bet Frequency Analysis
        intervals = []
        for i in range(1, len(bets)):
            t1 = bets[i-1]['placed_at']
            t2 = bets[i]['placed_at']
            if t1 and t2:
                diff = (t2 - t1).total_seconds()
                intervals.append(diff)

        if intervals:
            avg_interval = sum(intervals) / len(intervals)
            min_interval = min(intervals)
            fast_bets_under_2s = sum(1 for sec in intervals if sec < 2.0)
            fast_bets_under_1s = sum(1 for sec in intervals if sec < 1.0)
            print(f"⏱️ BET PACE & AUTOMATION AUDIT:")
            print(f"   - Average Time Between Bets: {avg_interval:.2f} seconds")
            print(f"   - Minimum Time Between Bets: {min_interval:.2f} seconds")
            print(f"   - Ultra-fast bets (< 2.0 sec gap): {fast_bets_under_2s} ({fast_bets_under_2s/len(intervals)*100:.1f}%)")
            print(f"   - Instant bets (< 1.0 sec gap):    {fast_bets_under_1s} ({fast_bets_under_1s/len(intervals)*100:.1f}%)")
            if min_interval < 0.5 or fast_bets_under_1s > 10:
                print("   🚨 HIGH ANOMALY DETECTED: Automated betting / script execution pattern!")
            else:
                print("   ℹ️ Pace appears to be human speed or manual clicks.")
        print("")

        # Detailed Breakdown Table
        print("📜 FULL LIST OF BETS ON " + date_str + ":")
        print(f"   {'#':<4} {'Placed At':<23} {'Game':<10} {'Bet Amt':<9} {'Mult':<8} {'State':<8} {'Payout':<9}")
        print("   " + "-" * 72)
        for idx, b in enumerate(bets, 1):
            mult_str = f"{float(b['multiplier']):.2f}x" if b['multiplier'] is not None else "-"
            payout_str = f"{float(b['payout']):.2f}" if b['payout'] is not None else "-"
            print(f"   {idx:<4} {str(b['placed_at']):<23} {b['game_type']:<10} {float(b['amount']):<9.2f} {mult_str:<8} {b['state']:<8} {payout_str:<9}")

    print("\n" + "=" * 80)

    # 4. Check All Transactions on Date
    cursor.execute("""
        SELECT id, type, amount, balance_before, balance_after, game_type, created_at
        FROM transactions
        WHERE user_id = %s AND created_at >= %s AND created_at <= %s
        ORDER BY created_at ASC
    """, (user_id, start_ts, end_ts))
    txs = cursor.fetchall()
    print(f"\n📊 ALL TRANSACTIONS ON {date_str} ({len(txs)} records):")
    if txs:
        for t in txs:
            game = f" ({t['game_type']})" if t['game_type'] else ""
            print(f"   [{t['created_at']}] Type: {t['type']:<12}{game:<12} Amt: {t['amount']:>8} | Bal: {t['balance_before']:>8} -> {t['balance_after']:>8}")
    else:
        print("   - No transaction records on this date.")

    print("\n" + "=" * 80 + "\n")
    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit user bets and pace on a given date.")
    parser.add_argument("--tg-id", type=int, required=True, help="Telegram ID")
    parser.add_argument("--date", default="2026-08-07", help="Date YYYY-MM-DD (default 2026-08-07)")

    args = parser.parse_args()
    audit_user(args.tg_id, args.date)
