"""
Broadcast worker — runs as a background task inside the main bot
process. Polls the `broadcasts` table for `scheduled` rows whose
`scheduled_at` is in the past and dispatches them through Telegram.

Throttling:
  - 25 messages / second hard cap (Telegram limits a bot to ~30/s).
  - On `Forbidden` (user blocked the bot) the recipient is recorded as
    `blocked` and we keep going.
  - On any other API error we record `error` and keep going.

Cancellation:
  - The handler refuses to send if the broadcast has been flipped to
    `cancelled` between batches.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramAPIError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

logger = logging.getLogger(__name__)


# Tuned slightly under Telegram's 30 msg/s global limit per bot.
RATE_PER_SEC = 25
SLEEP_PER_MSG = 1.0 / RATE_PER_SEC


def _conn():
    """New psycopg2 connection. Reuses DATABASE_URL from env."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg2.connect(url)


def _audience_sql_where(audience: dict[str, Any]) -> tuple[str, list[Any]]:
    """Build a WHERE fragment + positional params from an audience filter.

    Mirrors the TypeScript `audienceWhere` in routes/admin.ts. We never
    target blocked users.
    """
    parts = ["is_blocked = false"]
    params: list[Any] = []

    if audience.get("minBalance") and audience["minBalance"] > 0:
        parts.append(
            "id IN (SELECT user_id FROM balances WHERE demo_mode = false "
            "AND amount >= %s::numeric)"
        )
        params.append(audience["minBalance"])

    if audience.get("regAfter"):
        parts.append("created_at >= %s")
        params.append(datetime.fromtimestamp(audience["regAfter"] / 1000))
    if audience.get("regBefore"):
        parts.append("created_at <= %s")
        params.append(datetime.fromtimestamp(audience["regBefore"] / 1000))

    if audience.get("inactiveDays") and audience["inactiveDays"] > 0:
        cutoff = datetime.fromtimestamp(
            datetime.now().timestamp() - audience["inactiveDays"] * 86400
        )
        parts.append("id NOT IN (SELECT user_id FROM bets WHERE placed_at >= %s)")
        params.append(cutoff)

    if audience.get("telegramIds"):
        ids = list(audience["telegramIds"])
        if ids:
            placeholders = ",".join(["%s"] * len(ids))
            parts.append(f"telegram_id IN ({placeholders})")
            params.extend(ids)

    return " WHERE " + " AND ".join(parts), params


async def _send_one(
    bot: Bot,
    bc: dict[str, Any],
    keyboard: InlineKeyboardMarkup | None,
    chat_id: int,
) -> tuple[str, str | None]:
    """Send a single message. Returns (status, error_or_None)."""
    parse_mode_raw = bc.get("parse_mode") or "HTML"
    parse_mode = None if parse_mode_raw == "none" else parse_mode_raw
    media_url = bc.get("media_url")
    text = bc["text"]
    try:
        if media_url:
            try:
                await bot.send_photo(
                    chat_id=chat_id,
                    photo=media_url,
                    caption=text[:1024],
                    parse_mode=parse_mode,
                    reply_markup=keyboard,
                )
            except TelegramAPIError as photo_err:
                # Telegram couldn't fetch the URL as an image (broken
                # link, non-image content type, HTML page, etc). Rather
                # than dropping the whole message, fall back to a plain
                # text send so the broadcast still reaches the user.
                msg = str(photo_err).lower()
                if (
                    "wrong type of the web page content" in msg
                    or "wrong file identifier" in msg
                    or "failed to get http url content" in msg
                    or "image_process_failed" in msg
                ):
                    await bot.send_message(
                        chat_id=chat_id,
                        text=text,
                        parse_mode=parse_mode,
                        reply_markup=keyboard,
                        disable_web_page_preview=True,
                    )
                else:
                    raise
        else:
            await bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode=parse_mode,
                reply_markup=keyboard,
                disable_web_page_preview=True,
            )
        return "delivered", None
    except TelegramForbiddenError:
        return "blocked", "user blocked the bot"
    except TelegramAPIError as e:
        return "error", str(e)[:500]
    except Exception as e:
        return "error", f"{type(e).__name__}: {e}"[:500]


def _build_keyboard(buttons: Any) -> InlineKeyboardMarkup | None:
    """Turn the JSONB `buttons` array into an aiogram inline keyboard."""
    if not buttons:
        return None
    if isinstance(buttons, str):
        try:
            buttons = json.loads(buttons)
        except json.JSONDecodeError:
            return None
    if not isinstance(buttons, list) or not buttons:
        return None
    rows = []
    for b in buttons[:3]:
        if not isinstance(b, dict):
            continue
        text = str(b.get("text") or "").strip()
        url = str(b.get("url") or "").strip()
        if not text or not url:
            continue
        rows.append([InlineKeyboardButton(text=text, url=url)])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _process_one(bot: Bot, bc_id: str) -> None:
    """Run a single broadcast from start to finish."""
    conn = _conn()
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE broadcasts SET status = 'sending', "
            "started_at = COALESCE(started_at, NOW()), updated_at = NOW() "
            "WHERE id = %s AND status = 'scheduled' RETURNING *",
            (bc_id,),
        )
        bc = cur.fetchone()
        if not bc:
            return
        audience = bc["audience"] or {"all": True}
        if isinstance(audience, str):
            audience = json.loads(audience)
        keyboard = _build_keyboard(bc.get("buttons"))

        if audience.get("channelId"):
            targets = [audience["channelId"]]
        else:
            where, params = _audience_sql_where(audience)
            cur.execute(
                f"SELECT telegram_id FROM users{where}",
                params,
            )
            targets = [int(row["telegram_id"]) for row in cur.fetchall()]

        delivered = 0
        failed = 0
        last_flush = 0
        try:
            for tg_id in targets:
                # Cancellation check every 50 messages — keeps Postgres
                # round-trips low while still being responsive.
                if delivered + failed - last_flush >= 50:
                    cur.execute(
                        "SELECT status FROM broadcasts WHERE id = %s",
                        (bc_id,),
                    )
                    row = cur.fetchone()
                    if row and row["status"] == "cancelled":
                        logger.info("Broadcast %s cancelled mid-send", bc_id)
                        break
                    last_flush = delivered + failed

                status, err = await _send_one(bot, bc, keyboard, tg_id)
                if status == "delivered":
                    delivered += 1
                else:
                    failed += 1
                    # Surface the concrete failure reason in the bot log
                    # so we don't have to dig into broadcast_recipients to
                    # understand why a whole broadcast came back empty.
                    logger.warning(
                        "Broadcast %s -> %s failed (%s): %s",
                        bc_id,
                        tg_id,
                        status,
                        err,
                    )

                cur.execute(
                    "INSERT INTO broadcast_recipients "
                    "(broadcast_id, telegram_id, status, error) "
                    "VALUES (%s, %s, %s, %s)",
                    (bc_id, tg_id, status, err),
                )
                # Periodic stats update.
                if (delivered + failed) % 25 == 0:
                    cur.execute(
                        "UPDATE broadcasts "
                        "SET delivered = %s, failed = %s, updated_at = NOW() "
                        "WHERE id = %s",
                        (delivered, failed, bc_id),
                    )
                await asyncio.sleep(SLEEP_PER_MSG)
        finally:
            cur.execute(
                "UPDATE broadcasts SET status = "
                "  CASE WHEN status = 'cancelled' THEN 'cancelled' "
                "       ELSE 'sent' END, "
                "delivered = %s, failed = %s, "
                "finished_at = NOW(), updated_at = NOW() "
                "WHERE id = %s",
                (delivered, failed, bc_id),
            )
        logger.info(
            "Broadcast %s done: delivered=%d failed=%d",
            bc_id,
            delivered,
            failed,
        )
    except Exception as e:
        logger.exception("Broadcast %s failed: %s", bc_id, e)
        try:
            cur.execute(
                "UPDATE broadcasts SET status = 'failed', "
                "error_message = %s, finished_at = NOW(), updated_at = NOW() "
                "WHERE id = %s",
                (str(e)[:500], bc_id),
            )
        except Exception:
            pass
    finally:
        cur.close()
        conn.close()


async def broadcast_worker_loop(bot: Bot) -> None:
    """Top-level loop. Polls every 10s for due broadcasts."""
    logger.info("Broadcast worker started")
    while True:
        try:
            conn = _conn()
            conn.autocommit = True
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT id FROM broadcasts "
                "WHERE status = 'scheduled' "
                "  AND (scheduled_at IS NULL OR scheduled_at <= NOW()) "
                "ORDER BY scheduled_at ASC NULLS FIRST LIMIT 1"
            )
            row = cur.fetchone()
            cur.close()
            conn.close()

            if row:
                await _process_one(bot, row["id"])
                # After processing, check for the next one immediately.
                continue
        except Exception:
            logger.exception("Broadcast worker iteration failed")
        await asyncio.sleep(10)
