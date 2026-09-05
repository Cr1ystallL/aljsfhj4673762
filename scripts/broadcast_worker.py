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
    conn = psycopg2.connect(url)
    conn.set_client_encoding('UTF8')
    return conn


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


import re

COLOR_EMOJIS: dict[str, str] = {
    "green": "🟢",
    "emerald": "🟢",
    "blue": "🔵",
    "sky": "🔵",
    "yellow": "🟡",
    "amber": "🟡",
    "gold": "🟡",
    "red": "🔴",
    "rose": "🔴",
    "purple": "🟣",
    "violet": "🟣",
    "orange": "🟠",
    "white": "⚪",
    "black": "⚫",
}


def _replace_custom_emojis(text: str) -> str:
    """
    Replaces {custom_emoji_id} or {custom_emoji_id:fallback} with
    <tg-emoji emoji-id="custom_emoji_id">fallback</tg-emoji>.
    
    Example: {5368324170671202286} -> <tg-emoji emoji-id="5368324170671202286">✨</tg-emoji>
    Example: {5368324170671202286:🔥} -> <tg-emoji emoji-id="5368324170671202286">🔥</tg-emoji>
    """
    if not text:
        return ""
    pattern = re.compile(r'\{(?:emoji:|tg-emoji:)?(\d{6,25})(?::([^}\n]+))?\}')

    def _repl(match: re.Match) -> str:
        emoji_id = match.group(1)
        fallback = match.group(2) or "✨"
        return f'<tg-emoji emoji-id="{emoji_id}">{fallback}</tg-emoji>'

    return pattern.sub(_repl, text)


def _format_wheel_leaders(cur: Any) -> str:
    """Fetch top-5 participants for the active Wheel tournament and format as HTML for blockquote."""
    try:
        cur.execute(
            """
            SELECT c.id AS cycle_id, t.title, c.prize_pool, t.prize_mode, t.winners_count, t.fixed_prize
            FROM tournaments t
            JOIN tournament_cycles c ON c.tournament_id = t.id
            WHERE (LOWER(t.game_type) = 'wheel' OR LOWER(t.title) LIKE '%%wheel%%')
              AND t.active = true
            ORDER BY (c.state = 'live') DESC, c.starts_at DESC
            LIMIT 1
            """
        )
        t_row = cur.fetchone()
        if not t_row:
            return (
                "🥇 1. <i>Место свободно — сделай ставку!</i>\n"
                "🥈 2. <i>Место свободно</i>\n"
                "🥉 3. <i>Место свободно</i>\n"
                "4️⃣ 4. <i>Место свободно</i>\n"
                "5️⃣ 5. <i>Место свободно</i>"
            )

        cycle_id = t_row["cycle_id"]
        prize_pool = float(t_row.get("prize_pool") or 0)
        prize_mode = t_row.get("prize_mode") or "percent"
        fixed_prize = float(t_row.get("fixed_prize") or 0) if t_row.get("fixed_prize") else None

        percent_shares = [0.20, 0.16, 0.13, 0.11, 0.09]

        cur.execute(
            """
            SELECT p.balance, u.username, u.first_name, u.telegram_id
            FROM tournament_participants p
            JOIN users u ON u.id = p.user_id
            WHERE p.cycle_id = %s
            ORDER BY p.balance DESC, p.reached_at ASC
            LIMIT 5
            """,
            (cycle_id,),
        )
        rows = cur.fetchall()

        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
        lines = []
        for idx in range(5):
            medal = medals[idx]

            # Compute estimated prize
            prize_str = ""
            if prize_mode == "fixed" and fixed_prize:
                prize_str = f" (~{fixed_prize:,.0f} zł)".replace(",", " ")
            elif prize_pool > 0 and idx < len(percent_shares):
                p_amt = round(prize_pool * percent_shares[idx])
                prize_str = f" (~{p_amt:,.0f} zł)".replace(",", " ")

            if idx < len(rows):
                r = rows[idx]
                uname = r.get("username")
                if uname:
                    display = f"@{uname}"
                else:
                    first = (r.get("first_name") or "Игрок").strip()
                    display = first[:14]
                # Escape html characters
                display = (
                    display.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                )
                bal = float(r.get("balance") or 0)
                lines.append(f"{medal} <b>{display}</b> — <code>{bal:,.0f} pts</code>{prize_str}".replace(",", " "))
            else:
                lines.append(f"{medal} <i>Свободно — сделай ставку!</i>{prize_str}".replace(",", " "))

        return "\n".join(lines)
    except Exception as e:
        logger.warning("Failed to format wheel leaders: %s", e)
        return (
            "🥇 1. <i>Место свободно</i>\n"
            "🥈 2. <i>Место свободно</i>\n"
            "🥉 3. <i>Место свободно</i>\n"
            "4️⃣ 4. <i>Место свободно</i>\n"
            "5️⃣ 5. <i>Место свободно</i>"
        )


def _clean_html_text(text: str) -> str:
    """Fix common typos in HTML markup for Telegram."""
    if not text:
        return ""
    # Fix typos like <\blockquote> -> </blockquote>
    text = re.sub(r'<\\([a-zA-Z0-9_-]+)>', r'</\1>', text)
    # Fix typos like </ blockquote> -> </blockquote>
    text = re.sub(r'</\s+([a-zA-Z0-9_-]+)>', r'</\1>', text)
    return text


def _strip_html(text: str) -> str:
    """Strip all HTML tags as plain text fallback."""
    return re.sub(r'<[^>]*>', '', text)


async def _send_one(
    bot: Bot,
    bc: dict[str, Any],
    keyboard: InlineKeyboardMarkup | None,
    chat_id: int,
) -> tuple[str, str | None, int | None]:
    """Send a single message. Returns (status, error_or_None, message_id_or_None)."""
    parse_mode_raw = bc.get("parse_mode") or "HTML"
    parse_mode = None if parse_mode_raw == "none" else parse_mode_raw
    media_url = bc.get("media_url")
    text = _clean_html_text(bc.get("text") or "")

    async def _try_send(p_mode: str | None, payload_text: str) -> int | None:
        if media_url:
            url = f"https://macvbet.nl{media_url}" if media_url.startswith("/") else media_url
            try:
                msg = await bot.send_photo(
                    chat_id=chat_id,
                    photo=url,
                    caption=payload_text[:1024],
                    parse_mode=p_mode,
                    reply_markup=keyboard,
                )
                return msg.message_id
            except TelegramAPIError as photo_err:
                msg = str(photo_err).lower()
                if (
                    "wrong type of the web page content" in msg
                    or "wrong file identifier" in msg
                    or "failed to get http url content" in msg
                    or "image_process_failed" in msg
                ):
                    pass
                else:
                    raise
        msg = await bot.send_message(
            chat_id=chat_id,
            text=payload_text,
            parse_mode=p_mode,
            reply_markup=keyboard,
            disable_web_page_preview=True,
        )
        return msg.message_id

    try:
        try:
            sent_msg_id = await _try_send(parse_mode, text)
        except TelegramAPIError as api_err:
            msg = str(api_err).lower()
            if "can't parse entities" in msg or "entity" in msg or "tag" in msg or "parse" in msg:
                logger.warning(
                    "HTML parse error for chat %s (%s). Retrying with plain text fallback.",
                    chat_id,
                    api_err,
                )
                plain = _strip_html(text)
                sent_msg_id = await _try_send(None, plain)
            else:
                raise
        return "delivered", None, sent_msg_id
    except TelegramForbiddenError as e:
        msg = str(e).lower()
        if "deactivat" in msg:
            return "blocked", "user deactivated", None
        if "blocked" in msg:
            return "blocked", "user blocked the bot", None
        return "blocked", str(e)[:200], None
    except TelegramAPIError as e:
        return "error", str(e)[:500], None
    except Exception as e:
        return "error", f"{type(e).__name__}: {e}"[:500], None


def _format_btn_text(text: Any, color: Any) -> str:
    t = str(text or "").strip()
    if not t:
        return ""
    if color and isinstance(color, str):
        c_lower = color.lower().strip()
        icon = COLOR_EMOJIS.get(c_lower)
        if icon and not t.startswith(icon):
            t = f"{icon} {t}"
    return t


def _build_keyboard(buttons: Any) -> InlineKeyboardMarkup | None:
    """Turn the JSONB `buttons` structure into an aiogram inline keyboard.
    
    Supports:
      1. 2D list of button dicts: [[btn1, btn2], [btn3]]
      2. 1D list of button dicts with optional 'row' property (or one per row)
      3. Button colors (green, blue, yellow/amber, red, purple, orange) via icon badge
    """
    if not buttons:
        return None
    if isinstance(buttons, str):
        try:
            buttons = json.loads(buttons)
        except json.JSONDecodeError:
            return None
    if not isinstance(buttons, list) or not buttons:
        return None

    rows: list[list[InlineKeyboardButton]] = []

    # Check if buttons is already 2D (list of lists)
    if any(isinstance(item, list) for item in buttons):
        for raw_row in buttons[:6]:  # max 6 rows
            if not isinstance(raw_row, list):
                continue
            btn_row: list[InlineKeyboardButton] = []
            for b in raw_row[:4]:  # max 4 buttons per row
                if not isinstance(b, dict):
                    continue
                url = str(b.get("url") or "").strip()
                text = _format_btn_text(b.get("text"), b.get("color"))
                if text and url:
                    btn_row.append(InlineKeyboardButton(text=text, url=url))
            if btn_row:
                rows.append(btn_row)
    else:
        # 1D list: group by 'row' if present, otherwise each on its own row
        has_row_prop = any(isinstance(b, dict) and "row" in b for b in buttons)
        if has_row_prop:
            grouped: dict[int, list[InlineKeyboardButton]] = {}
            for b in buttons[:10]:
                if not isinstance(b, dict):
                    continue
                r_idx = int(b.get("row", 0))
                url = str(b.get("url") or "").strip()
                text = _format_btn_text(b.get("text"), b.get("color"))
                if text and url:
                    grouped.setdefault(r_idx, []).append(InlineKeyboardButton(text=text, url=url))
            for r_key in sorted(grouped.keys()):
                rows.append(grouped[r_key][:4])
        else:
            for b in buttons[:8]:
                if not isinstance(b, dict):
                    continue
                url = str(b.get("url") or "").strip()
                text = _format_btn_text(b.get("text"), b.get("color"))
                if text and url:
                    rows.append([InlineKeyboardButton(text=text, url=url)])

    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _process_one(bot: Bot, bc_id: str) -> None:
    """Run a single broadcast from start to finish."""
    conn = _conn()
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=RealDictCursor)
    run_succeeded = False
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

        # Resolve dynamic variables in text (Wheel tournament leaders, top5)
        raw_text = bc.get("text") or ""
        if any(tag in raw_text for tag in ["{wheel_leaders}", "{leaders}", "{wheel_top5}", "{top5}"]):
            leaders_html = _format_wheel_leaders(cur)
            for tag in ["{wheel_leaders}", "{leaders}", "{wheel_top5}", "{top5}"]:
                raw_text = raw_text.replace(tag, leaders_html)

        # Replace custom emojis: {ID} or {ID:fallback} or {emoji:ID}
        processed_text = _replace_custom_emojis(raw_text)

        bc_to_send = dict(bc)
        bc_to_send["text"] = processed_text

        targets = []
        if audience.get("channelId"):
            targets.append(audience["channelId"])
        if audience.get("channels"):
            targets.extend(audience["channels"])
            
        has_user_filters = any(k in audience for k in ["minBalance", "regAfter", "regBefore", "inactiveDays", "telegramIds"])
        if audience.get("all") or has_user_filters:
            where, params = _audience_sql_where(audience)
            cur.execute(
                f"SELECT telegram_id FROM users{where}",
                params,
            )
            targets.extend([int(row["telegram_id"]) for row in cur.fetchall()])

        targets = list(dict.fromkeys(targets))

        delivered = 0
        failed = 0
        last_flush = 0
        try:
            for tg_id in targets:
                # Fast cancellation check every 5 messages
                if delivered + failed - last_flush >= 5:
                    cur.execute(
                        "SELECT status FROM broadcasts WHERE id = %s",
                        (bc_id,),
                    )
                    row = cur.fetchone()
                    if row and row["status"] == "cancelled":
                        logger.info("Broadcast %s cancelled mid-send", bc_id)
                        break
                    last_flush = delivered + failed

                status, err, msg_id = await _send_one(bot, bc_to_send, keyboard, tg_id)
                if status == "delivered":
                    delivered += 1
                else:
                    failed += 1
                    # Surface the concrete failure reason in the bot log
                    logger.warning(
                        "Broadcast %s -> %s failed (%s): %s",
                        bc_id,
                        tg_id,
                        status,
                        err,
                    )

                cur.execute(
                    """
                    INSERT INTO broadcast_recipients (broadcast_id, telegram_id, status, error, message_id, attempted_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (broadcast_id, telegram_id)
                    DO UPDATE SET
                        status = EXCLUDED.status,
                        error = EXCLUDED.error,
                        message_id = EXCLUDED.message_id,
                        attempted_at = EXCLUDED.attempted_at
                    """,
                    (bc_id, tg_id, status, err, msg_id),
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
            run_succeeded = True
        finally:
            cur.execute(
                "SELECT status, broadcast_type, interval_seconds, until_date, cycle_count "
                "FROM broadcasts WHERE id = %s",
                (bc_id,),
            )
            bc_state = cur.fetchone()
            if bc_state and bc_state.get("status") == "cancelled":
                cur.execute(
                    "UPDATE broadcasts SET delivered = %s, failed = %s, "
                    "finished_at = COALESCE(finished_at, NOW()), updated_at = NOW() "
                    "WHERE id = %s",
                    (delivered, failed, bc_id),
                )
            elif (
                run_succeeded
                and bc_state
                and bc_state.get("broadcast_type") == "cyclical"
                and bc_state.get("interval_seconds")
            ):
                now = datetime.now()
                until_date = bc_state.get("until_date")
                interval_sec = int(bc_state["interval_seconds"])
                next_run = datetime.fromtimestamp(now.timestamp() + interval_sec)

                # Check if expiration date has been reached
                if until_date and (now >= until_date or next_run > until_date):
                    logger.info(
                        "Cyclical broadcast %s reached until_date %s; marking sent",
                        bc_id,
                        until_date,
                    )
                    cur.execute(
                        "UPDATE broadcasts SET status = 'sent', "
                        "delivered = %s, failed = %s, cycle_count = cycle_count + 1, "
                        "finished_at = NOW(), updated_at = NOW() "
                        "WHERE id = %s",
                        (delivered, failed, bc_id),
                    )
                else:
                    logger.info(
                        "Cyclical broadcast %s cycle finished. Rescheduling for %s",
                        bc_id,
                        next_run,
                    )
                    cur.execute(
                        "UPDATE broadcasts SET status = 'scheduled', scheduled_at = %s, "
                        "delivered = %s, failed = %s, cycle_count = cycle_count + 1, "
                        "updated_at = NOW() "
                        "WHERE id = %s",
                        (next_run, delivered, failed, bc_id),
                    )
            elif run_succeeded:
                cur.execute(
                    "UPDATE broadcasts SET status = 'sent', "
                    "delivered = %s, failed = %s, cycle_count = GREATEST(cycle_count, 1), "
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
