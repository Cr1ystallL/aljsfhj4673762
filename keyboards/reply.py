"""
Reply-клавиатуры для бота
"""
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from config import config
from locales.translations import get_text


def get_main_keyboard(lang: str = 'ru') -> ReplyKeyboardMarkup:
    """Главная клавиатура бота:
    Строка 1: Mini-App (красная кнопка style='danger')
    Строка 2: Профиль (синяя кнопка style='primary'), Информация (синяя кнопка style='primary')
    """
    miniapp_url = config.MINI_APP_URL.strip()
    keyboard = [
        [
            KeyboardButton(
                text=get_text(lang, 'btn_miniapp'),
                style='danger',
                web_app=WebAppInfo(url=miniapp_url) if miniapp_url else None
            )
        ],
        [
            KeyboardButton(text=get_text(lang, 'btn_profile'), style='primary'),
            KeyboardButton(text=get_text(lang, 'btn_info'), style='primary')
        ]
    ]
    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        input_field_placeholder="Выберите раздел..."
    )
