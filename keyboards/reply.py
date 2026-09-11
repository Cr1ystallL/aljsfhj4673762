"""
Reply-клавиатуры для бота
"""
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from locales.translations import get_text


def get_main_keyboard(lang: str = 'ru') -> ReplyKeyboardMarkup:
    """Главная клавиатура бота:
    Строка 1: 🔴 Mini-App
    Строка 2: 🔵 Профиль, 🔵 Информация
    """
    keyboard = [
        [
            KeyboardButton(text=get_text(lang, 'btn_miniapp'))
        ],
        [
            KeyboardButton(text=get_text(lang, 'btn_profile')),
            KeyboardButton(text=get_text(lang, 'btn_info'))
        ]
    ]
    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите раздел..."
    )
