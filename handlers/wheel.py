"""
Обработчик для колеса фортуны (Lucky Wheel)
"""
import asyncio
import aiohttp
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile


router = Router()

@router.message(Command("mb_wheel"))
async def cmd_mb_wheel(message: Message):
    """
    Обработчик команды /mb_wheel
    Вращает Lucky Wheel через внутренний API бэкенда
    """
    user_id = message.from_user.id
    
    # Запрашиваем бэкенд на предмет вращения
    url = 'http://localhost:4000/api/bonuses/_bot/wheel/spin'
    payload = {'telegramId': user_id}
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json=payload, timeout=5) as resp:
                data = await resp.json()
                
                if resp.status == 429:
                    if data.get('error') == 'COOLDOWN':
                        # В бэкенде мы возвращаем remaining в секундах в message
                        seconds = int(data.get('message', '0'))
                        minutes = max(1, round(seconds / 60))
                        msg = await message.answer(f"⏳ Ещё раз прокрутить можно через: {minutes} минут(ы)")
                        asyncio.create_task(delete_message_later(msg, 15))
                        return
                    elif data.get('error') == 'DAILY_CAP':
                        msg = await message.answer("❌ У вас закончились вращения на сегодня. Возвращайтесь завтра!")
                        asyncio.create_task(delete_message_later(msg, 15))
                        return
                
                if resp.status == 404:
                    msg = await message.answer(
                        "❌ <b>Сначала зарегистрируйтесь</b>\n\n"
                        "Перейдите в личные сообщения @MacvBet_bot и отправьте команду /start"
                    )
                    asyncio.create_task(delete_message_later(msg, 15))
                    return
                    
                if resp.status != 200:
                    msg = await message.answer("❌ Произошла ошибка при вращении колеса. Попробуйте позже.")
                    asyncio.create_task(delete_message_later(msg, 15))
                    return
                
                # Успешное вращение
                amount = data.get('amount', 0)
                remaining = data.get('remaining', 0)
                
                # Отправляем симуляцию "Крутим колесо..."
                sim_msg = await message.answer("🎡 <i>Крутим колесо...</i>")
                
                # Симуляция 5 секунд
                await asyncio.sleep(5)
                
                # Пытаемся удалить сообщение-симуляцию
                try:
                    await sim_msg.delete()
                except Exception:
                    pass

                # Клавиатура
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="Бот", url="https://t.me/MacvBet_bot"),
                        InlineKeyboardButton(text="Наш канал", url="https://t.me/+m9rl_ptr8fZiNzcy")
                    ]
                ])
                
                # Отправляем результат с картинкой
                from pathlib import Path
                root_dir = Path(__file__).resolve().parent.parent
                photo_candidates = [
                    root_dir / "images" / "luckywheel.png",
                    root_dir / "mini-app" / "apps" / "frontend" / "public" / "Wheel.png",
                    Path("/var/www/MACVBET/images/luckywheel.png"),
                ]
                photo_file = None
                for p in photo_candidates:
                    if p.exists():
                        photo_file = FSInputFile(str(p))
                        break
                
                amount_f = float(amount)
                if amount_f == 10.0:
                    text = (
                        f"🎰 <b>Выпало:</b> Бесплатное вращение в Обычном кейсе (10 zł)!\n\n"
                        f"У вас осталось: {remaining} спинов\n"
                        f"⏳ Ещё раз прокрутить можно через: 20 минут"
                    )
                else:
                    text = (
                        f"🎰 <b>Выпало:</b> {amount} zł\n\n"
                        f"У вас осталось: {remaining} спинов\n"
                        f"⏳ Ещё раз прокрутить можно через: 20 минут"
                    )
                
                try:
                    if photo_file:
                        result_msg = await message.answer_photo(
                            photo=photo_file,
                            caption=text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                    else:
                        result_msg = await message.answer(
                            text=text,
                            reply_markup=keyboard,
                            parse_mode="HTML"
                        )
                    
                    # Запускаем задачу на удаление через 2 минуты
                    asyncio.create_task(delete_message_later(result_msg, 120))
                except Exception as e:
                    # Если отправка с картинкой упала, отправляем текстом
                    result_msg = await message.answer(
                        text=text,
                        reply_markup=keyboard,
                        parse_mode="HTML"
                    )
                    asyncio.create_task(delete_message_later(result_msg, 120))
                    
        except Exception as e:
            msg = await message.answer("❌ Сервер временно недоступен.")
            asyncio.create_task(delete_message_later(msg, 15))


async def delete_message_later(message: Message, delay_seconds: int):
    """Фоновая задача для удаления сообщения через заданное время"""
    await asyncio.sleep(delay_seconds)
    try:
        await message.delete()
    except Exception:
        pass
