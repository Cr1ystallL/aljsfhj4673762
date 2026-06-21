"""
Middleware для отслеживания активности пользователей и проверки блокировки
"""
import aiohttp
import redis.asyncio as aioredis
from typing import Callable, Dict, Any, Awaitable, Union
from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery
from database.db import db
from config import config

# Инициализируем клиент Redis для проверки динамических админов
redis_client = aioredis.from_url(config.REDIS_URL, decode_responses=True)


async def check_is_admin(user_id: int) -> bool:
    """Проверяет, является ли пользователь администратором (seed или динамический)"""
    # 1. Проверяем статических админов из .env
    if user_id in config.ADMIN_IDS:
        return True
    
    # 2. Проверяем динамических админов в Redis
    try:
        if await redis_client.sismember("admins:dynamic", str(user_id)):
            return True
        if await redis_client.sismember("admins:withdrawal", str(user_id)):
            return True
    except Exception:
        pass
    
    return False


class UserActivityMiddleware(BaseMiddleware):
    """Middleware для отслеживания активности пользователей"""
    
    async def __call__(
        self,
        handler: Callable[[Union[Message, CallbackQuery], Dict[str, Any]], Awaitable[Any]],
        event: Union[Message, CallbackQuery],
        data: Dict[str, Any]
    ) -> Any:
        # Получаем статус администратора (seed + dynamic)
        is_admin = False
        if event.from_user:
            is_admin = await check_is_admin(event.from_user.id)

        # Проверяем технический режим (кроме админов)
        if event.from_user and not is_admin:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get('http://localhost:4000/api/maintenance/status', timeout=0.8) as response:
                        if response.status == 200:
                            res_data = await response.json()
                            if res_data.get('enabled'):
                                custom_msg = res_data.get('message')
                                text = (
                                    f"🛠 <b>Технические работы</b>\n\n"
                                    f"{custom_msg if custom_msg else 'В данный момент бот находится на техническом обслуживании. Мы проводим важные обновления системы. Пожалуйста, попробуйте зайти позже.'}"
                                )
                                if isinstance(event, Message):
                                    await event.answer(text)
                                elif isinstance(event, CallbackQuery):
                                    await event.answer(text.replace('<b>', '').replace('</b>', ''), show_alert=True)
                                return
            except Exception:
                pass

        # Проверяем блокировку пользователя (кроме админов)
        if event.from_user and not is_admin:
            if db.is_user_blocked(event.from_user.id):
                if isinstance(event, Message):
                    await event.answer(
                        "🚫 <b>Ваш аккаунт заблокирован</b>\n\n"
                        "Доступ к боту ограничен на неопределенный срок.\n"
                        "Для получения дополнительной информации обратитесь к администратору."
                    )
                elif isinstance(event, CallbackQuery):
                    await event.answer(
                        "🚫 Ваш аккаунт заблокирован",
                        show_alert=True
                    )
                return
        
        # Игнорируем любые сообщения в группах, кроме /mb_wheel
        chat = getattr(event, "chat", None)
        if not chat and hasattr(event, "message") and event.message:
            chat = event.message.chat

        if chat and chat.type in ('group', 'supergroup'):
            if isinstance(event, Message):
                if not event.text or not event.text.startswith('/mb_wheel'):
                    return
            else:
                return

        # Обновляем активность пользователя
        if getattr(event, "from_user", None):
            username = event.from_user.username
            first_name = event.from_user.first_name
            db.update_user_activity(event.from_user.id, username, first_name)
        
        # Продолжаем обработку
        return await handler(event, data)
