"""Модуль клавиатур"""
from .inline import *
from .reply import *

__all__ = [
    'get_main_keyboard',
    'get_slots_menu', 'get_games_menu', 'get_dice_menu', 'get_dice_bet_instruction', 'get_confirm_bet_menu'
]
