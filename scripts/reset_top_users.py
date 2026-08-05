#!/usr/bin/env python3
"""
Script to zero out top leaderboard players (1st, 2nd, and 5th places).

Usage:
  python3 scripts/reset_top_users.py
"""

import os
import sys
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
    ]
    for p in search_paths:
        p = os.path.abspath(p)
        if os.path.isfile(p):
            print(f"[*] Loaded environment from: {p}")
            with open(p, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip().strip('"\''))

def get_pg_connection():
    load_env()
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casino_miniapp")
    return psycopg2.connect(db_url)

def reset_places(target_positions=[1, 2, 5]):
    conn = get_pg_connection()
    if not conn:
        return
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    
    try:
        # Get top users by wagered sum
        cursor.execute("""
            SELECT b.user_id, u.first_name, u.username, u.telegram_id, SUM(b.amount) as total_wagered
            FROM bets b
            JOIN users u ON b.user_id = u.id
            WHERE b.metadata->>'tournamentId' IS NULL
            GROUP BY b.user_id, u.first_name, u.username, u.telegram_id
            ORDER BY total_wagered DESC
            LIMIT 10
        """)
        rows = cursor.fetchall()
        
        print("\n--- Current Top 10 Leaderboard Players ---")
        for idx, r in enumerate(rows, start=1):
            name = r['first_name'] or r['username'] or f"TG:{r['telegram_id']}"
            print(f"#{idx} | User: {name} (ID: {r['user_id']}) | Wagered: {r['total_wagered']} PLN")
        
        users_to_reset = []
        for pos in target_positions:
            if pos <= len(rows):
                users_to_reset.append((pos, rows[pos - 1]))
                
        if not users_to_reset:
            print("\n[!] No matching users found to reset.")
            conn.close()
            return
            
        print("\n[*] Zeroing out data for positions:", [pos for pos, _ in users_to_reset])
        for pos, user_info in users_to_reset:
            uid = user_info['user_id']
            uname = user_info['first_name'] or user_info['username'] or f"TG:{user_info['telegram_id']}"
            print(f"  -> Resetting #{pos}: {uname} (ID: {uid})")
            
            # Delete bets
            cursor.execute("DELETE FROM bets WHERE user_id = %s", (uid,))
            # Delete transactions
            cursor.execute("DELETE FROM transactions WHERE user_id = %s", (uid,))
            # Delete withdrawal requests
            cursor.execute("DELETE FROM withdrawal_requests WHERE user_id = %s", (uid,))
            # Reset balance to 0
            cursor.execute("""
                UPDATE balances 
                SET amount = 0, wager_target = 0, wager_progress = 0, updated_at = NOW() 
                WHERE user_id = %s
            """, (uid,))
            
        conn.commit()
        print("\n[✓✓✓] SUCCESS! Data for 1st, 2nd, and 5th places has been completely zeroed out!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n[!] ERROR resetting top users: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    reset_places([1, 2, 5])
