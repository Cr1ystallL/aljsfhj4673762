"""
Reply-клавиатуры для бота
"""
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from locales.translations import get_text


def get_main_keyboard(lang: str = 'ru') -> ReplyKeyboardMarkup:
    """Главная клавиатура.

    Раньше первая строка содержала кнопку «Слоты», открывавшую заглушку
    «выбор региона». Сейчас она заменена кнопкой Mini-App, которая
    отвечает текстом + инлайн-кнопкой запуска WebApp (см.
    `handlers/basic.py::open_miniapp`). Reply-кнопка не может сама
    запускать WebApp без `request_*` API, поэтому используем двухшаговый
    флоу: текстовая кнопка → сообщение с inline `web_app`.
    """
    keyboard = [
        [
            KeyboardButton(text=get_text(lang, 'btn_miniapp'))
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
