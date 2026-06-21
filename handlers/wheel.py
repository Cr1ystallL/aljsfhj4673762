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
                        await message.answer(f"⏳ Ещё раз прокрутить можно через: {minutes} минут(ы)")
                        return
                    elif data.get('error') == 'DAILY_CAP':
                        await message.answer("❌ У вас закончились вращения на сегодня. Возвращайтесь завтра!")
                        return
                
                if resp.status == 404:
                    await message.answer(
                        "❌ <b>Сначала зарегистрируйтесь</b>\n\n"
                        "Перейдите в личные сообщения @MacvBet_bot и отправьте команду /start"
                    )
                    return
                    
                if resp.status != 200:
                    await message.answer("❌ Произошла ошибка при вращении колеса. Попробуйте позже.")
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
                photo = FSInputFile("/var/www/MACVBET/images/luckywheel.png")
                
                text = (
                    f"🎰 <b>Выпало:</b> {amount} zł\n\n"
                    f"У вас осталось: {remaining} спинов\n"
                    f"⏳ Ещё раз прокрутить можно через: 15 минут"
                )
                
                try:
                    result_msg = await message.answer_photo(
                        photo=photo,
                        caption=text,
                        reply_markup=keyboard
                    )
                    
                    # Запускаем задачу на удаление через 2 минуты
                    asyncio.create_task(delete_message_later(result_msg, 120))
                except Exception as e:
                    # Если картинки нет, отправляем текстом
                    result_msg = await message.answer(
                        text=text,
                        reply_markup=keyboard
                    )
                    asyncio.create_task(delete_message_later(result_msg, 120))
                    
        except Exception as e:
            await message.answer("❌ Сервер временно недоступен.")


async def delete_message_later(message: Message, delay_seconds: int):
    """Фоновая задача для удаления сообщения через заданное время"""
    await asyncio.sleep(delay_seconds)
    try:
        await message.delete()
    except Exception:
        pass
