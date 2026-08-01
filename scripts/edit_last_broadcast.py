"""
Script to edit the recent broadcast message sent around 21:15:08
Removes the line containing '👉 Запустить MACVBET Mini App' without sending any new messages.
"""
import asyncio
import logging
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import sqlite3
from dotenv import load_dotenv

load_dotenv()
load_dotenv('/var/www/MACVBET/mini-app/apps/backend/.env', override=True)

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Updated text WITHOUT the line with the link
NEW_TEXT = (
    "🔥 <b>НОВАЯ ИГРА НА MACVBET: MACVPOT (JACKPOT)!</b> 🔥\n\n"
    "Готовы забрать <b>ВЕСЬ БАНК</b> одной ставкой? Встречайте <b>MacvPot</b> — культовую рулетку с общим пулом и реальными шансами на победу! 🎰💰\n\n"
    "✨ <b>Как это работает?</b>\n"
    "1️⃣ <b>Делай ставку:</b> чем выше ставка — тем выше % на победу!\n"
    "2️⃣ <b>ПОБЕДИТЕЛЬ ЗАБИРАЕТ ВСЁ:</b> 100% банка уходит одному счастливчику! 🏆🎉\n\n"
    "💡 <i>Даже с минимальной ставкой в 10 zł у тебя есть шанс выбить игрока с банком в 10 000 zł!</i>\n\n"
    "🎁 <b>Бонус для быстрых игроков:</b>\n"
    "Забирай промокод: <b>MACVPOT10</b>"
)

def get_target_users() -> list[int]:
    """Get all telegram IDs from Postgres or SQLite."""
    user_ids = []
    
    # 1. Try Postgres DATABASE_URL
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        try:
            conn = psycopg2.connect(db_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            try:
                cur.execute(
                    "SELECT DISTINCT telegram_id FROM broadcast_recipients "
                    "WHERE status = 'delivered' ORDER BY telegram_id"
                )
                rows = cur.fetchall()
                if rows:
                    user_ids = [int(r["telegram_id"]) for r in rows]
                    logger.info(f"Loaded {len(user_ids)} recipients from broadcast_recipients")
            except Exception as e:
                logger.warning(f"Could not query broadcast_recipients: {e}")
                
            if not user_ids:
                cur.execute("SELECT telegram_id FROM users WHERE is_blocked = false")
                rows = cur.fetchall()
                user_ids = [int(r["telegram_id"]) for r in rows if r["telegram_id"]]
                logger.info(f"Loaded {len(user_ids)} users from Postgres users table")
                
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning(f"Postgres error: {e}")

    # 2. Try SQLite if Postgres didn't return users
    if not user_ids and os.path.exists("casino_bot.db"):
        try:
            conn = sqlite3.connect("casino_bot.db")
            cur = conn.cursor()
            cur.execute("SELECT user_id FROM users WHERE is_blocked = 0 OR is_blocked IS NULL")
            rows = cur.fetchall()
            user_ids = [int(r[0]) for r in rows if r[0]]
            logger.info(f"Loaded {len(user_ids)} users from SQLite casino_bot.db")
            conn.close()
        except Exception as e:
            logger.warning(f"SQLite error: {e}")

    return list(dict.fromkeys(user_ids))


async def edit_broadcast_for_user(bot: Bot, chat_id: int) -> bool:
    """Attempt to edit the broadcast message for a given chat_id by trying recent message_ids."""
    for mid in range(150, 0, -1):
        try:
            # 1. Try editing text
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=mid,
                text=NEW_TEXT,
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
            logger.info(f"✅ Successfully edited message {mid} for user {chat_id} (text)")
            return True
        except TelegramAPIError as e:
            err_msg = str(e).lower()
            if "message is not modified" in err_msg:
                logger.info(f"✅ Message {mid} for user {chat_id} already updated")
                return True
            if "there is no text in the message to edit" in err_msg:
                # Original message might be a photo/media with caption
                try:
                    await bot.edit_message_caption(
                        chat_id=chat_id,
                        message_id=mid,
                        caption=NEW_TEXT,
                        parse_mode="HTML",
                    )
                    logger.info(f"✅ Successfully edited message {mid} for user {chat_id} (caption)")
                    return True
                except TelegramAPIError as caption_err:
                    if "message is not modified" in str(caption_err).lower():
                        return True
                    pass
        except TelegramForbiddenError:
            logger.warning(f"User {chat_id} blocked the bot")
            return False
        except Exception:
            pass
        
        await asyncio.sleep(0.01)
        
    logger.warning(f"❌ Could not find target broadcast message for user {chat_id}")
    return False


async def main():
    token = os.getenv("BOT_TOKEN")
    if not token:
        try:
            from config import config
            token = config.BOT_TOKEN
        except Exception:
            pass
        
    if not token:
        logger.error("BOT_TOKEN not found!")
        return

    bot = Bot(token=token)
    users = get_target_users()
    logger.info(f"Starting broadcast edit for {len(users)} users...")

    edited_count = 0
    for idx, uid in enumerate(users, 1):
        logger.info(f"[{idx}/{len(users)}] Processing user {uid}...")
        success = await edit_broadcast_for_user(bot, uid)
        if success:
            edited_count += 1
        await asyncio.sleep(0.03)

    logger.info(f"🎉 Editing complete! Updated {edited_count}/{len(users)} messages.")
    await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())
