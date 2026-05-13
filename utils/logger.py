"""
Система логирования действий в боте
"""
from aiogram import Bot
from aiogram.types import Message, User
from datetime import datetime


async def log_action(
    bot: Bot,
    user: User,
    category: str,
    action: str,
    details: str = "",
    link: str = ""
):
    """
    Логировать действие пользователя (отключено - только консоль)
    
    Args:
        bot: Экземпляр бота
        user: Пользователь
        category: Категория действия
        action: Действие
        details: Дополнительные сведения
        link: Ссылка на действие (опционально)
    """
    # Логирование в Telegram отключено - только консоль
    print(f"[LOG] {category} - {action} | User: {user.id} | {details}")
