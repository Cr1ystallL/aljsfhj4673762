"""
Middleware для отслеживания активности пользователей и проверки блокировки
"""
import aiohttp
from typing import Callable, Dict, Any, Awaitable, Union
from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery
from database.db import db
from config import config


class UserActivityMiddleware(BaseMiddleware):
    """Middleware для отслеживания активности пользователей"""
    
    async def __call__(
        self,
        handler: Callable[[Union[Message, CallbackQuery], Dict[str, Any]], Awaitable[Any]],
        event: Union[Message, CallbackQuery],
        data: Dict[str, Any]
    ) -> Any:
        # Проверяем технический режим (кроме админов)
        if event.from_user and event.from_user.id not in config.ADMIN_IDS:
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
        if event.from_user and event.from_user.id not in config.ADMIN_IDS:
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
        
        # Обновляем активность пользователя
        if event.from_user:
            username = event.from_user.username
            first_name = event.from_user.first_name
            db.update_user_activity(event.from_user.id, username, first_name)
        
        # Продолжаем обработку
        return await handler(event, data)
