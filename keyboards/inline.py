"""
Inline-клавиатуры для бота
"""
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from locales.translations import get_text


def get_slots_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    """Меню выбора региона для слотов"""
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'slots_global'), callback_data="slots_global")],
        [InlineKeyboardButton(text=get_text(lang, 'slots_russia'), callback_data="slots_russia")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_games_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    """Меню игр Telegram"""
    keyboard = [
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_dice'), callback_data="game_dice"),
            InlineKeyboardButton(text=get_text(lang, 'btn_mines'), callback_data="game_mines")
        ],
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_bowling'), callback_data="game_bowling"),
            InlineKeyboardButton(text=get_text(lang, 'btn_football'), callback_data="game_football")
        ],
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_basketball'), callback_data="game_basketball"),
            InlineKeyboardButton(text=get_text(lang, 'btn_rps'), callback_data="game_rps")
        ],
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_darts'), callback_data="game_darts"),
            InlineKeyboardButton(text=get_text(lang, 'btn_spider'), callback_data="game_slot")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_confirm_bet_menu(bet_id: str, game: str = "bet", lang: str = 'ru') -> InlineKeyboardMarkup:
    """Меню подтверждения ставки"""
    keyboard = [
        [
            InlineKeyboardButton(text=get_text(lang, 'bet_confirmed'), callback_data=f"confirm_{game}:{bet_id}"),
            InlineKeyboardButton(text=get_text(lang, 'bet_rejected'), callback_data=f"cancel_{game}:{bet_id}")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для игры в кости
def get_dice_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'dice_make_bet'), callback_data="dice_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_dice_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_dice")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для боулинга
def get_bowling_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'bowling_make_bet'), callback_data="bowling_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_bowling_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_bowling")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для дартс
def get_darts_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'darts_make_bet'), callback_data="darts_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_darts_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_darts")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для баскетбола
def get_basketball_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'basketball_make_bet'), callback_data="basketball_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_basketball_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_basketball")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для футбола
def get_football_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'football_make_bet'), callback_data="football_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_football_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_football")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для мин
def get_mines_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'mines_make_bet'), callback_data="mines_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_mines_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_mines")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)



# Меню для КНБ
def get_rps_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'rps_make_bet'), callback_data="rps_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_rps_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_rps")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Меню для паучка
def get_spider_menu(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'spider_make_bet'), callback_data="spider_make_bet")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_games")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_spider_bet_instruction(lang: str = 'ru') -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_spider")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


# Админ-панель
def get_admin_panel_keyboard(callback_prefix: str) -> InlineKeyboardMarkup:
    """Главное меню админ-панели"""
    keyboard = [
        [InlineKeyboardButton(text="📋 Список игроков", callback_data=f"admin_{callback_prefix}_players_list")],
        [InlineKeyboardButton(text="👤 Управление игроком", callback_data=f"admin_{callback_prefix}_manage_player")],
        [InlineKeyboardButton(text="❌ Закрыть", callback_data=f"admin_{callback_prefix}_close")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_player_management_keyboard(callback_prefix: str, player_id: int, is_blocked: bool = False) -> InlineKeyboardMarkup:
    """Меню управления игроком"""
    block_text = "🔓 Разблокировать" if is_blocked else "🔒 Заблокировать"
    block_action = "unblock" if is_blocked else "block"
    
    keyboard = [
        [InlineKeyboardButton(text="💰 Изменить баланс", callback_data=f"admin_{callback_prefix}_change_balance_{player_id}")],
        [InlineKeyboardButton(text="🎁 Выдать бонус", callback_data=f"admin_{callback_prefix}_give_bonus_{player_id}")],
        [InlineKeyboardButton(text=block_text, callback_data=f"admin_{callback_prefix}_{block_action}_user_{player_id}")],
        [InlineKeyboardButton(text="‹ Назад", callback_data=f"admin_{callback_prefix}_back_to_admin")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)
