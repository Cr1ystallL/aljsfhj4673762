#!/usr/bin/env python3
"""
Script to manage and rollback pending withdrawal requests.

Usage:
  python3 scripts/rollback_withdrawals.py list
  python3 scripts/rollback_withdrawals.py refund --date 2026-07-27
  python3 scripts/rollback_withdrawals.py cancel --date 2026-07-27
"""

import sys
import argparse
from datetime import datetime
import psycopg2
import psycopg2.extras
from config import config

def get_pg_connection():
    if not config.USE_POSTGRES or not config.DATABASE_URL:
        print("[!] Postgres is disabled or DATABASE_URL not set.")
        return None
    return psycopg2.connect(config.DATABASE_URL)

def list_pending_withdrawals(date_from=None):
    conn = get_pg_connection()
    if not conn:
        return
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    query = "SELECT w.id, w.user_id, w.amount, w.currency, w.method, w.destination, w.status, w.created_at, u.telegram_id, u.username FROM withdrawal_requests w JOIN users u ON w.user_id = u.id WHERE w.status = 'pending'"
    params = []
    if date_from:
        query += " AND w.created_at >= %s"
        params.append(date_from)
    query += " ORDER BY w.created_at DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    print(f"\n--- Pending Withdrawal Requests (Count: {len(rows)}) ---")
    for r in rows:
        tg = r['telegram_id'] or 'N/A'
        un = f"@{r['username']}" if r['username'] else "No username"
        print(f"ID: {r['id']} | User: {un} (TG: {tg}) | Amount: {r['amount']} {r['currency']} | Method: {r['method']} | Created: {r['created_at']}")
    print("-" * 60)
    conn.close()

def rollback_withdrawals(mode='refund', date_from='2026-07-27'):
    conn = get_pg_connection()
    if not conn:
        return
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    try:
        # Fetch target pending withdrawals
        cursor.execute("""
            SELECT id, user_id, amount
            FROM withdrawal_requests
            WHERE status = 'pending' AND created_at >= %s
        """, (date_from,))
        pending = cursor.fetchall()
        
        if not pending:
            print(f"[*] No pending withdrawal requests found created on or after {date_from}.")
            conn.close()
            return
            
        print(f"[*] Found {len(pending)} pending withdrawal requests to rollback (mode: {mode})...")
        
        for r in pending:
            req_id = r['id']
            user_id = r['user_id']
            amount = float(r['amount'])
            
            if mode == 'refund':
                # Refund balance to user
                cursor.execute("""
                    UPDATE balances
                    SET amount = amount + %s,
                        updated_at = NOW(),
                        last_synced_at = NOW(),
                        version = version + 1
                    WHERE user_id = %s
                """, (amount, user_id))
                
                # Insert refund transaction log
                cursor.execute("""
                    INSERT INTO transactions (id, user_id, type, amount, balance_before, balance_after, metadata, created_at)
                    SELECT 
                        gen_random_uuid(),
                        %s,
                        'refund',
                        %s,
                        amount - %s,
                        amount,
                        json_build_object('reason', 'System recovery rollback to July 27 checkpoint', 'request_id', %s),
                        NOW()
                    FROM balances WHERE user_id = %s
                """, (user_id, amount, amount, req_id, user_id))
            
            # Mark withdrawal request as rejected/cancelled
            reason = f"Restored to checkpoint state (Server Hardware Failure {date_from})"
            cursor.execute("""
                UPDATE withdrawal_requests
                SET status = 'rejected',
                    rejection_reason = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (reason, req_id))
            
        conn.commit()
        print(f"[✓] Successfully processed rollback for {len(pending)} withdrawal requests!")
    except Exception as e:
        conn.rollback()
        print(f"[!] Error during rollback: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Withdrawal Rollback Utility")
    parser.add_argument("action", choices=["list", "refund", "cancel"], help="Action to perform")
    parser.add_argument("--date", default="2026-07-27", help="Start date cutoff (YYYY-MM-DD)")
    args = parser.parse_args()
    
    if args.action == "list":
        list_pending_withdrawals(args.date)
    elif args.action == "refund":
        rollback_withdrawals(mode="refund", date_from=args.date)
    elif args.action == "cancel":
        rollback_withdrawals(mode="cancel", date_from=args.date)
