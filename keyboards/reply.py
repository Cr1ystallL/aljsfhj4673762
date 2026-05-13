"""
Reply-клавиатуры для бота
"""
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from locales.translations import get_text


def get_main_keyboard(lang: str = 'ru') -> ReplyKeyboardMarkup:
    """Главная клавиатура"""
    keyboard = [
        [
            KeyboardButton(text=get_text(lang, 'btn_slots'))
        ],
        [
            KeyboardButton(text=get_text(lang, 'btn_games'))
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
