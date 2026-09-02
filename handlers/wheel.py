"""
Обработчик для колеса фортуны (Lucky Wheel)
Работает как в личных сообщениях с ботом, так и в Telegram-группах.
Поддерживает команды: /mb_wheel, mb_wheel, /wheel, wheel, !mb_wheel, .mb_wheel, колесо, рулетка
"""
import asyncio
import logging
from pathlib import Path
import aiohttp
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile

logger = logging.getLogger(__name__)

router = Router()

WHEEL_TRIGGERS = {
    '/mb_wheel', 'mb_wheel',
    '/wheel', 'wheel',
    '!mb_wheel', '.mb_wheel',
    '!wheel', '.wheel',
    'колесо', '/колесо',
    'рулетка', '/рулетка',
}


def is_wheel_message(message: Message) -> bool:
    """Проверяет, является ли сообщение вызовом колеса фортуны"""
    raw_text = (message.text or message.caption or "").strip().lower()
    if not raw_text:
        return False
    parts = raw_text.split()
    first = parts[0].split('@')[0]
    if first.startswith('@') and len(parts) > 1:
        first = parts[1].split('@')[0]
    return first in WHEEL_TRIGGERS


@router.message(is_wheel_message)
async def cmd_mb_wheel(message: Message):
    """
    Обработчик команды /mb_wheel и ее вариаций.
    Вращает Lucky Wheel через внутренний API бэкенда.
    """
    if not message.from_user:
        return

    user_id = message.from_user.id
    user_name = message.from_user.full_name or message.from_user.first_name or "Игрок"
    user_mention = message.from_user.mention_html(user_name)

    # Запрашиваем бэкенд на предмет вращения
    url = 'http://127.0.0.1:4000/api/bonuses/_bot/wheel/spin'
    payload = {'telegramId': user_id}

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json=payload, timeout=8) as resp:
                data = await resp.json()

                if resp.status == 429:
                    if data.get('error') == 'COOLDOWN':
                        seconds = int(data.get('message', '0'))
                        minutes = max(1, round(seconds / 60))
                        msg = await message.reply(
                            f"⏳ {user_mention}, ещё раз прокрутить можно через: <b>{minutes} минут(ы)</b>",
                            parse_mode="HTML"
                        )
                        asyncio.create_task(delete_message_later(msg, 20))
                        asyncio.create_task(delete_message_later(message, 20))
                        return
                    elif data.get('error') == 'DAILY_CAP':
                        msg = await message.reply(
                            f"❌ {user_mention}, у вас закончились вращения на сегодня. Возвращайтесь завтра!",
                            parse_mode="HTML"
                        )
                        asyncio.create_task(delete_message_later(msg, 20))
                        asyncio.create_task(delete_message_later(message, 20))
                        return

                if resp.status == 404:
                    msg = await message.reply(
                        f"❌ {user_mention}, <b>сначала зарегистрируйтесь</b>\n\n"
                        "Перейдите в личные сообщения @MacvBet_bot и отправьте команду /start",
                        parse_mode="HTML"
                    )
                    asyncio.create_task(delete_message_later(msg, 25))
                    asyncio.create_task(delete_message_later(message, 25))
                    return

                if resp.status != 200:
                    logger.warning(f"Wheel spin failed with status {resp.status}: {data}")
                    msg = await message.reply("❌ Произошла ошибка при вращении колеса. Попробуйте позже.")
                    asyncio.create_task(delete_message_later(msg, 15))
                    asyncio.create_task(delete_message_later(message, 15))
                    return

                # Успешное вращение
                amount = data.get('amount', 0)
                remaining = data.get('remaining', 0)

                # Отправляем симуляцию "Крутим колесо..."
                sim_msg = await message.reply("🎡 <i>Крутим колесо фортуны...</i>", parse_mode="HTML")

                # Небольшая задержка анимации
                await asyncio.sleep(3)

                # Пытаемся удалить сообщение-симуляцию
                try:
                    await sim_msg.delete()
                except Exception:
                    pass

                # Клавиатура
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="Играть", url="https://t.me/MacvBet_bot"),
                        InlineKeyboardButton(text="📢 Наш канал", url="https://t.me/+m9rl_ptr8fZiNzcy")
                    ]
                ])

                # Отправляем результат с картинкой
                root_dir = Path(__file__).resolve().parent.parent
                photo_candidates = [
                    root_dir / "images" / "luckywheel.png",
                    root_dir / "images" / "luckywheel.jpg",
                    root_dir / "images" / "photo_2026-07-28_04-23-37.jpg",
                    Path("/var/www/MACVBET/images/luckywheel.png"),
                    Path("/var/www/MACVBET/images/luckywheel.jpg"),
                    Path("/var/www/MACVBET/images/photo_2026-07-28_04-23-37.jpg"),
                ]
                photo_file = None
                for p in photo_candidates:
                    if p.exists():
                        photo_file = FSInputFile(str(p))
                        break

                amount_f = float(amount)
                if amount_f == 10.0:
                    text = (
                        f"🎰 <b>Колесо фортуны</b>\n"
                        f"👤 Игрок: {user_mention}\n\n"
                        f"🎉 <b>Выпало:</b> Бесплатное вращение в Обычном кейсе (10 zł)!\n\n"
                        f"📊 Осталось вращений сегодня: <b>{remaining}</b>\n"
                        f"⏳ Следующий спин через: <b>20 минут</b>"
                    )
                else:
                    text = (
                        f"🎰 <b>Колесо фортуны</b>\n"
                        f"👤 Игрок: {user_mention}\n\n"
                        f"🎉 <b>Выигрыш:</b> +{amount} zł на баланс!\n\n"
                        f"📊 Осталось вращений сегодня: <b>{remaining}</b>\n"
                        f"⏳ Следующий спин через: <b>20 минут</b>"
                    )

                result_msg = None
                try:
                    if photo_file:
                        result_msg = await message.reply_photo(
                            photo=photo_file,
                            caption=text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                    else:
                        result_msg = await message.reply(
                            text=text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                except Exception as e:
                    logger.warning(f"Failed to send wheel photo, sending text: {e}")
                    try:
                        result_msg = await message.reply(
                            text=text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                    except Exception as e2:
                        logger.error(f"Failed to send wheel text message: {e2}")

                if result_msg:
                    # Удаляем результат через 3 минуты для чистоты группы
                    asyncio.create_task(delete_message_later(result_msg, 180))
                    asyncio.create_task(delete_message_later(message, 180))

        except aiohttp.ClientError as e:
            logger.error(f"HTTP error during wheel spin: {e}")
            try:
                msg = await message.reply("❌ Сервер временно недоступен. Попробуйте через минуту.")
                asyncio.create_task(delete_message_later(msg, 15))
                asyncio.create_task(delete_message_later(message, 15))
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Unexpected error in cmd_mb_wheel: {e}", exc_info=True)


async def delete_message_later(message: Message, delay_seconds: int):
    """Фоновая задача для удаления сообщения через заданное время"""
    try:
        await asyncio.sleep(delay_seconds)
        if message:
            await message.delete()
    except Exception:
        pass
