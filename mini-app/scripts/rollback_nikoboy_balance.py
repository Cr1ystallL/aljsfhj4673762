#!/usr/bin/env python3
"""
Script to rollback player NikoBoy (1876418609) balance back to 51.16 PLN/USD
due to Wheel RNG glitch on 07.08.2026 (Palpable Error п. 3.2).

Usage:
  python3 scripts/rollback_nikoboy_balance.py --execute
"""

import os
import sys
import argparse
import psycopg2
import psycopg2.extras
import redis

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

def rollback_nikoboy(target_balance=51.16, execute=False):
    tg_id = 1876418609
    conn = get_pg_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    print("\n" + "=" * 70)
    print(f"       ROLLBACK USER NIKOBOY (TG: {tg_id}) BALANCE")
    print(f"       Target Balance: {target_balance} PLN/USD")
    print(f"       Mode: {'EXECUTE (MUTATING DB)' if execute else 'DRY-RUN (PREVIEW ONLY)'}")
    print("=" * 70 + "\n")

    cursor.execute("SELECT id, telegram_id, username, first_name, is_blocked, withdrawal_locked FROM users WHERE telegram_id = %s", (tg_id,))
    user = cursor.fetchone()
    if not user:
        print(f"[!] User {tg_id} not found!")
        conn.close()
        return

    user_id = user['id']
    cursor.execute("SELECT amount, wager_target, wager_progress FROM balances WHERE user_id = %s", (user_id,))
    current_bal_row = cursor.fetchone()
    current_amount = float(current_bal_row['amount']) if current_bal_row else 0.0

    print(f"👤 User: @{user['username']} ({user['first_name']}) | UUID: {user_id}")
    print(f"💰 Current DB Balance: {current_amount:.2f}")
    print(f"🔄 Target Reset Balance: {target_balance:.2f}")
    print("")

    if not execute:
        print("[!] DRY RUN complete. Run with --execute to commit balance rollback in DB.")
        conn.close()
        return

    try:
        # Update balance
        cursor.execute("""
            UPDATE balances
            SET amount = %s,
                wager_target = 0,
                wager_progress = 0,
                updated_at = NOW(),
                last_synced_at = NOW(),
                version = version + 1
            WHERE user_id = %s
        """, (target_balance, user_id))

        # Unlock withdrawal lock if set
        cursor.execute("UPDATE users SET withdrawal_locked = false WHERE id = %s", (user_id,))

        # Insert Admin Audit Log
        cursor.execute("""
            INSERT INTO admin_audit_log (id, admin_user_id, admin_telegram_id, action, target_type, target_id, payload_before, payload_after, reason, created_at)
            VALUES (gen_random_uuid(), 'system', 0, 'balance.rollback', 'user', %s, %s::jsonb, %s::jsonb, %s, NOW())
        """, (
            user_id,
            f'{{"balance": {current_amount}}}',
            f'{{"balance": {target_balance}}}',
            'Rollback 07.08.2026 Wheel RNG glitch bets back to initial balance 51.16 (Palpable Error п. 3.2)'
        ))

        # Record correction transaction
        cursor.execute("""
            INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, created_at)
            VALUES (gen_random_uuid(), %s, 'refund', %s, %s, %s, NOW())
        """, (user_id, target_balance - current_amount, current_amount, target_balance))

        conn.commit()
        print(f"✅ SUCCESS! Balance for NikoBoy (@{user['username']}) successfully reset to {target_balance} PLN/USD!")

        # Attempt Redis flush
        try:
            r = redis.Redis(host='localhost', port=6379, db=0)
            r.delete(f"balance:{user_id}")
            print(f"✅ Redis cache balance:{user_id} invalidated.")
        except Exception as re_err:
            print(f"ℹ️ Redis cache flush warning: {re_err}")

    except Exception as e:
        conn.rollback()
        print(f"❌ ERROR DURING ROLLBACK: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rollback NikoBoy balance to 51.16.")
    parser.add_argument("--execute", action="store_true", help="Execute mutating database update")
    args = parser.parse_args()
    rollback_nikoboy(51.16, execute=args.execute)
