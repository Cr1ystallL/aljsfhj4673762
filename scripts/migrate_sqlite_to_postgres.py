#!/usr/bin/env python3
"""
One-shot migration: copy balances from the legacy SQLite store
(`casino_bot.db`) into the shared PostgreSQL `balances` table.

Why this exists
---------------
Earlier the Telegram bot wrote balances into a local SQLite file. The
mini-app reads from PostgreSQL. Switching the bot to PostgreSQL fixes
the drift going forward, but doesn't carry over the existing balances
that already accumulated in SQLite.

This script:

  1. Opens the local `casino_bot.db` (if present).
  2. For each user with a non-zero balance:
     - Finds (or creates) the matching `users` row in Postgres by
       `telegram_id`.
     - Adds the SQLite balance to whatever is currently in the
       Postgres `balances` row (preserving funds the user may have
       earned via the mini-app since the switch). This is additive
       so it's safe to re-run in either order.
  3. Backs up `casino_bot.db` to `casino_bot.db.migrated_<ts>` so it
     can't get accidentally re-applied.

Run:
    python3 scripts/migrate_sqlite_to_postgres.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
import time
from typing import Iterator, Tuple

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


def iter_sqlite_balances(path: str) -> Iterator[Tuple[int, str, str, float]]:
    if not os.path.exists(path):
        print(f"⏭  No SQLite file at {path}, nothing to migrate.")
        return
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute(
        "SELECT user_id, COALESCE(username,''), COALESCE(first_name,''), "
        "       COALESCE(balance,0) "
        "FROM users WHERE balance > 0"
    )
    for row in cur.fetchall():
        yield row
    conn.close()


def main() -> int:
    load_dotenv()
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/casino_miniapp",
    )

    sqlite_path = os.getenv("SQLITE_BOT_DB", "casino_bot.db")
    print(f"→ Source: {sqlite_path}")
    print(f"→ Target: {db_url}")

    rows = list(iter_sqlite_balances(sqlite_path))
    print(f"→ Found {len(rows)} users with positive balances in SQLite")
    if not rows:
        return 0

    pg = psycopg2.connect(db_url)
    pg.autocommit = False
    cur = pg.cursor()

    moved, skipped, created = 0, 0, 0
    for user_id, username, first_name, sqlite_amount in rows:
        # 1. Resolve / create the Postgres user row.
        cur.execute(
            "SELECT id FROM users WHERE telegram_id = %s",
            (user_id,),
        )
        user_row = cur.fetchone()
        if user_row is None:
            cur.execute(
                "INSERT INTO users (id, telegram_id, username, first_name, "
                "                   created_at, updated_at) "
                "VALUES (gen_random_uuid(), %s, NULLIF(%s,''), NULLIF(%s,''), "
                "        NOW(), NOW()) RETURNING id",
                (user_id, username, first_name),
            )
            (user_uuid,) = cur.fetchone()
            created += 1
        else:
            (user_uuid,) = user_row

        # 2. Upsert the real-money balance row, adding the SQLite amount.
        cur.execute(
            "SELECT amount FROM balances WHERE user_id = %s AND demo_mode = false",
            (user_uuid,),
        )
        bal_row = cur.fetchone()
        if bal_row is None:
            cur.execute(
                "INSERT INTO balances (id, user_id, amount, currency, "
                "                      demo_mode, last_synced_at, version, "
                "                      created_at, updated_at) "
                "VALUES (gen_random_uuid(), %s, %s, 'USD', false, NOW(), 0, "
                "        NOW(), NOW())",
                (user_uuid, sqlite_amount),
            )
            print(f"  + tg={user_id}: created with {sqlite_amount}")
        else:
            (current,) = bal_row
            new_amount = float(current) + float(sqlite_amount)
            cur.execute(
                "UPDATE balances SET amount = %s, updated_at = NOW(), "
                "                    last_synced_at = NOW(), "
                "                    version = version + 1 "
                "WHERE user_id = %s AND demo_mode = false",
                (new_amount, user_uuid),
            )
            print(
                f"  ✓ tg={user_id}: {current} + {sqlite_amount} → {new_amount}"
            )
        moved += 1

    pg.commit()
    cur.close()
    pg.close()

    # Move the SQLite file aside so re-runs are no-ops.
    if os.path.exists(sqlite_path):
        backup = f"{sqlite_path}.migrated_{int(time.time())}"
        os.rename(sqlite_path, backup)
        print(f"→ SQLite moved to {backup}")

    print(
        f"✅ Done. Migrated balances for {moved} users "
        f"(created {created} new postgres users, skipped {skipped})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
