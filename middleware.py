"""
Middleware для отслеживания активности пользователей и проверки блокировки
"""
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
