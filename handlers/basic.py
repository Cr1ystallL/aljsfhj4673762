"""
Обработчики базовых команд бота
"""
from typing import Union
from aiogram import Router, F
from aiogram.filters import Command, CommandObject
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton

from database.db import db
from config import config
from keyboards.reply import get_main_keyboard
from keyboards.inline import get_slots_menu, get_games_menu
from handlers.spider import DIFFICULTY_SETTINGS
from locales.translations import get_text, format_amount

router = Router()


@router.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject):
    """Обработчик команды /start"""
    user_id = message.from_user.id
    username = message.from_user.first_name
    
    # Проверка на реферальную ссылку
    referrer_id = None
    ref_type = None

    if command.args:
        if command.args.startswith("cpa_"):
            try:
                referrer_id = int(command.args.replace("cpa_", ""))
                ref_type = 'cpa'
            except: pass
        elif command.args.startswith("ggr_"):
            try:
                referrer_id = int(command.args.replace("ggr_", ""))
                ref_type = 'ggr'
            except: pass

    # Создаем пользователя
    if referrer_id and referrer_id != user_id:
        is_new_user = db.create_user(user_id, referrer_id=referrer_id, ref_type=ref_type)
        if is_new_user and ref_type == 'cpa':
            db.add_ref_cpa_balance(referrer_id, 100.0)
            try:
                await message.bot.send_message(referrer_id, "🤝 <b>Новый реферал!</b>\nПо вашей CPA-ссылке зарегистрировался пользователь.\nВам начислено <b>100 ₽</b> на CPA-баланс.")
            except:
                pass
    else:
        is_new_user = db.create_user(user_id)
    
    # Проверяем, установлен ли язык у пользователя (даже если он не новый)
    # Если язык не установлен (None или пустая строка), показываем выбор
    current_lang = db.get_user_language_raw(user_id)  # Получаем без дефолтного значения
    
    if current_lang is None or current_lang == '':
        # Язык не установлен - показываем выбор
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang:ru")],
            [InlineKeyboardButton(text="🇵🇱 Polski", callback_data="set_lang:pl")]
        ])
        await message.answer(get_text('ru', 'choose_language'), reply_markup=keyboard)
        return
    
    # Язык установлен - показываем приветствие
    lang = current_lang
    welcome_text = get_text(lang, 'welcome', name=username)
    await message.answer(welcome_text, reply_markup=get_main_keyboard(lang))


@router.callback_query(F.data.startswith("set_lang:"))
async def set_language(callback: CallbackQuery):
    """Установить язык пользователя"""
    user_id = callback.from_user.id
    lang = callback.data.split(":")[1]
    
    db.set_user_language(user_id, lang)
    await callback.message.edit_text(get_text(lang, 'language_set'))
    
    username = callback.from_user.first_name
    welcome_text = get_text(lang, 'welcome', name=username)
    await callback.message.answer(welcome_text, reply_markup=get_main_keyboard(lang))
    await callback.answer()


@router.message(F.text.in_(["🎰 Слоты", "🎰 Sloty"]))
async def show_slots(message: Message):
    """Показать меню слотов"""
    lang = db.get_user_language(message.from_user.id)
    text = get_text(lang, 'slots_title')
    await message.answer(text, reply_markup=get_slots_menu(lang))


@router.callback_query(F.data.in_(["slots_global", "slots_russia"]))
async def slots_region(callback: CallbackQuery):
    """Обработка выбора региона слотов"""
    lang = db.get_user_language(callback.from_user.id)
    await callback.answer(get_text(lang, 'game_in_dev'), show_alert=True)


@router.message(F.text.in_(["🎲 Игры TG", "🎲 Gry TG"]))
async def show_games(message: Message):
    """Показать меню игр Telegram"""
    lang = db.get_user_language(message.from_user.id)
    text = get_text(lang, 'games_title')
    await message.answer(text, reply_markup=get_games_menu(lang))


@router.message(F.text.in_(["👤 Профиль", "👤 Profil"]))
async def show_profile(event: Union[Message, CallbackQuery]):
    """Показать профиль пользователя"""
    user = event.from_user
    user_id = user.id
    lang = db.get_user_language(user_id)
    
    balance = db.get_balance(user_id)
    bonus_balance = db.get_bonus_balance(user_id)
    active_type = db.get_active_balance_type(user_id)
    w_curr, w_req = db.get_wager_info(user_id)
    
    active_str = get_text(lang, 'balance_real') if active_type == "real" else get_text(lang, 'balance_bonus')
    
    profile_text = (
        f"{get_text(lang, 'profile_balance', balance=format_amount(balance))}\n"
        f"{get_text(lang, 'profile_bonus', bonus=format_amount(bonus_balance))}\n\n"
        f"{get_text(lang, 'profile_active', type=active_str)}"
    )
    
    if bonus_balance > 0 and w_req > 0:
        percent = min(100, round((w_curr / w_req) * 100, 1))
        profile_text += f"\n{get_text(lang, 'profile_wager', current=f'{w_curr:.2f}', required=f'{w_req:.2f}', percent=percent)}"
        
    amount_to_lose = db.get_amount_to_lose(user_id)
    if amount_to_lose > 0:
        profile_text += f"\n{get_text(lang, 'profile_to_lose', amount=f'{amount_to_lose:.2f}')}"
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_deposit'), callback_data="deposit_balance"),
            InlineKeyboardButton(text=get_text(lang, 'btn_withdraw'), callback_data="withdraw_balance")
        ],
        [InlineKeyboardButton(text=get_text(lang, 'btn_referral'), callback_data="show_referral_menu")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_switch_balance'), callback_data="switch_active_balance")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_change_language'), callback_data="change_language")]
    ])
    
    if isinstance(event, Message):
        await event.answer(text=profile_text, reply_markup=keyboard)
    else:
        await event.message.edit_text(text=profile_text, reply_markup=keyboard)


@router.callback_query(F.data == "switch_active_balance")
async def switch_balance_callback(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    db.toggle_active_balance_type(user_id)
    await show_profile(callback)
    await callback.answer(get_text(lang, 'balance_switched'))


@router.callback_query(F.data == "change_language")
async def change_language_menu(callback: CallbackQuery):
    """Показать меню смены языка"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang:ru")],
        [InlineKeyboardButton(text="🇵🇱 Polski", callback_data="set_lang:pl")],
        [InlineKeyboardButton(text="‹ Назад", callback_data="back_to_profile_from_lang")]
    ])
    await callback.message.edit_text(get_text('ru', 'choose_language'), reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data == "back_to_profile_from_lang")
async def back_to_profile_from_lang(callback: CallbackQuery):
    """Вернуться к профилю из меню языка"""
    await show_profile(callback)
    await callback.answer()


@router.message(F.text.in_(["❔ Информация", "❔ Informacje"]))
async def show_info(message: Message):
    """Показать информацию о боте"""
    lang = db.get_user_language(message.from_user.id)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_agreement'), url="https://teletype.in/@macvbet/agreement"),
            InlineKeyboardButton(text=get_text(lang, 'btn_support'), url="https://t.me/macvbet_support")
        ]
    ])
    
    text = get_text(lang, 'info_title')
    await message.answer(text=text, reply_markup=keyboard)


@router.message(F.text.in_(["‹ Назад", "‹ Wstecz"]))
async def back_handler(message: Message):
    """Обработка кнопки Назад"""
    lang = db.get_user_language(message.from_user.id)
    await message.answer(get_text(lang, 'main_menu'), reply_markup=get_main_keyboard(lang))


@router.callback_query(F.data == "dummy_btn")
async def dummy_btn_handler(callback: CallbackQuery):
    """Пустой обработчик для кнопок-заглушек"""
    await callback.answer()


@router.callback_query(F.data.startswith("game_"))
async def game_handler(callback: CallbackQuery):
    """Обработка выбора игр"""
    if callback.data in ["game_dice", "game_bowling", "game_darts", "game_basketball", 
                         "game_football", "game_mines", "game_rps", "game_slot"]:
        return
    
    lang = db.get_user_language(callback.from_user.id)
    await callback.answer(get_text(lang, 'game_in_dev'), show_alert=True)
