"""
Обработчики базовых команд бота
"""
import random
import logging
from pathlib import Path
from typing import Union
from aiogram import Router, F
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton,
    FSInputFile, WebAppInfo
)
from aiogram.fsm.context import FSMContext

from database.db import db
from config import config
from keyboards.reply import get_main_keyboard
from locales.translations import get_text, format_amount

logger = logging.getLogger(__name__)

HEARTS = ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "🩷", "🩵", "🩶"]

MOTIVATIONAL_QUOTES = {
    'ru': [
        "Удача сопутствует смелым!",
        "Твой главный соперник — ты вчерашний.",
        "Победа начинается с первого шага.",
        "Большой куш любит уверенность и хладнокровие.",
        "Фортуна всегда на стороне решительных.",
        "Успех — это сумма маленьких шагов каждый день.",
        "Верь в свою победу, и она не заставит себя ждать.",
        "Каждый день открывает новые возможности для триумфа.",
        "Смелость побеждает любые сомнения.",
        "Кто рискует, тот пишет свою историю побед."
    ],
    'pl': [
        "Szczęście sprzyja odważnym!",
        "Twój największy rywal to ty z wczoraj.",
        "Zwycięstwo zaczyna się od pierwszego kroku.",
        "Wielka wygrana lubi pewność siebie i spokój.",
        "Fortuna sprzyja zdeterminowanym.",
        "Sukces to suma małych kroków każdego dnia.",
        "Uwierz w wygraną, a przyjdzie szybciej niż myślisz.",
        "Każdy dzień to nowa szansa na triumf."
    ]
}


def get_fallback_avatar() -> Union[FSInputFile, None]:
    paths = [
        Path('/var/www/MACVBET/mini-app/apps/frontend/public/SmallLogo.png'),
        Path('mini-app/apps/frontend/public/SmallLogo.png'),
        Path('/var/www/MACVBET/mini-app/apps/frontend/public/MenuLogo.png'),
        Path('mini-app/apps/frontend/public/MenuLogo.png'),
    ]
    for p in paths:
        if p.is_file():
            return FSInputFile(str(p))
    return None

router = Router()


@router.message(Command("start"))
async def cmd_start(message: Message, command: CommandObject, state: FSMContext):
    """Обработчик команды /start"""
    await state.clear()
    user_id = message.from_user.id
    username = message.from_user.first_name
    
    # Проверка на реферальную ссылку/промокод
    referrer_id = None

    if command.args:
        arg = command.args.strip()
        # 1. Поиск по промокоду
        aff_id = db.get_promo_code_owner(arg)
        if aff_id:
            referrer_id = aff_id
        else:
            # 2. Поиск по ID (поддержка старых ссылок)
            try:
                if arg.startswith("cpa_"):
                    referrer_id = int(arg.replace("cpa_", ""))
                elif arg.startswith("ggr_"):
                    referrer_id = int(arg.replace("ggr_", ""))
                else:
                    referrer_id = int(arg)
            except:
                pass
                
        if referrer_id == user_id:
            await message.answer("❌ Нельзя использовать свой же промокод или реферальную ссылку.")
            referrer_id = None
        elif referrer_id:
            # Трекинг клика/перехода
            try:
                db.add_affiliate_click(referrer_id)
            except Exception as e:
                pass

    # Создаем пользователя
    if referrer_id:
        is_new_user = db.create_user(user_id, referrer_id=referrer_id, ref_type='ggr') # По умолчанию RevShare
        if is_new_user:
            try:
                await message.bot.send_message(referrer_id, "🤝 <b>Новый игрок!</b>\nПо вашей реферальной ссылке/промокоду зарегистрировался новый пользователь.")
                await message.answer("✅ Вы успешно привязаны к партнеру!")
            except:
                pass
        else:
            # Пытаемся привязать реферала, если он существует но у него нет реферера
            bound = db.bind_referrer_if_empty(user_id, referrer_id)
            if bound:
                try:
                    await message.bot.send_message(referrer_id, "🤝 <b>Новый игрок!</b>\nПо вашей реферальной ссылке/промокоду зарегистрировался новый пользователь.")
                    await message.answer("✅ Вы успешно привязаны к партнеру!")
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
    
    # Проверка на спец-аргументы пополнения (переход из Mini App)
    if command.args and command.args.strip() in ["deposit_balance", "deposit_cryptobot"]:
        from handlers.payment import fetch_usdt_pln_rate, get_min_deposit_pln, DepositStates
        rate = fetch_usdt_pln_rate()
        min_pln = await get_min_deposit_pln()
        min_usdt = max(round(min_pln / rate + 1e-8, 2), 0.01)
        lang = current_lang or 'ru'
        text = get_text(
            lang,
            'deposit_enter_amount',
            min_amount=f"{min_usdt:.2f}",
            min_pln=f"{min_pln:.2f}",
        )
        msg = await message.answer(text)
        await state.update_data(
            prompt_message_id=msg.message_id,
            min_usdt=min_usdt,
            min_pln=min_pln,
            rate=rate,
        )
        await state.set_state(DepositStates.waiting_for_amount)
        return

    # Язык установлен - показываем приветствие и сразу предлагаем открыть MiniApp
    lang = current_lang
    welcome_text = get_text(lang, 'welcome', name=username)
    await message.answer(welcome_text, reply_markup=get_main_keyboard(lang))

    miniapp_url = config.MINI_APP_URL.strip()
    if miniapp_url:
        miniapp_keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text=get_text(lang, 'btn_start_miniapp'),
                web_app=WebAppInfo(url=miniapp_url),
                style="danger",
            )
        ]])
        await message.answer(
            get_text(lang, 'start_miniapp_prompt'),
            reply_markup=miniapp_keyboard,
        )


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

    miniapp_url = config.MINI_APP_URL.strip()
    if miniapp_url:
        miniapp_keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text=get_text(lang, 'btn_start_miniapp'),
                web_app=WebAppInfo(url=miniapp_url),
                style="danger",
            )
        ]])
        await callback.message.answer(
            get_text(lang, 'start_miniapp_prompt'),
            reply_markup=miniapp_keyboard,
        )
    await callback.answer()


@router.message(F.text.in_(["Mini-App", "🔴 Mini-App", "🎰 Mini-App", "🎰 Слоты", "🎰 Sloty", "🎲 Игры TG", "🎲 Gry TG"]))
async def open_miniapp(message: Message):
    """Открыть Mini-App."""
    lang = db.get_user_language(message.from_user.id)
    miniapp_url = config.MINI_APP_URL.strip()

    if not miniapp_url:
        await message.answer(get_text(lang, 'game_in_dev'))
        return

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=get_text(lang, 'btn_open_miniapp'),
            web_app=WebAppInfo(url=miniapp_url),
            style="danger",
        )
    ]])

    await message.answer(
        get_text(lang, 'miniapp_intro'),
        reply_markup=keyboard,
    )


@router.callback_query(F.data.in_(["slots_global", "slots_russia"]))
async def slots_region(callback: CallbackQuery):
    """Обработка выбора региона слотов (legacy)."""
    lang = db.get_user_language(callback.from_user.id)
    await callback.answer(get_text(lang, 'game_in_dev'), show_alert=True)


@router.message(F.text.in_(["Профиль", "Profil", "🔵 Профиль", "🔵 Profil", "👤 Профиль", "👤 Profil"]))
async def show_profile(event: Union[Message, CallbackQuery]):
    """Показать профиль пользователя с аватаркой и прикрепленным сообщением"""
    bot = event.bot
    user = event.from_user
    user_id = user.id
    lang = db.get_user_language(user_id)
    
    balance = db.get_balance(user_id)
    username_display = f"@{user.username}" if user.username else (user.first_name or ("Gracz" if lang == 'pl' else "Игрок"))

    # Вейджер: прогресс\цель(если есть)
    w_curr, w_req = 0.0, 0.0
    try:
        w_curr, w_req = db.get_wager_info(user_id)
    except Exception:
        pass

    amount_to_lose = 0.0
    try:
        amount_to_lose = db.get_amount_to_lose(user_id)
    except Exception:
        pass

    heart = random.choice(HEARTS)
    quote = random.choice(MOTIVATIONAL_QUOTES.get(lang, MOTIVATIONAL_QUOTES['ru']))

    if lang == 'pl':
        lines = [
            f"👤 <b>Nick:</b> {username_display}",
            f"💰 <b>Saldo:</b> {format_amount(balance)}",
        ]
        if w_req > 0:
            lines.append("")
            lines.append(f"📊 <b>Wager:</b> {w_curr:.2f}\\{w_req:.2f}")
        elif amount_to_lose > 0:
            lines.append("")
            lines.append(f"📊 <b>Obrót:</b> {amount_to_lose:.2f} zł")
        lines.append("")
        lines.append(f"{heart} <i>{quote}</i>")
    else:
        lines = [
            f"👤 <b>Ник:</b> {username_display}",
            f"💰 <b>Баланс:</b> {format_amount(balance)}",
        ]
        if w_req > 0:
            lines.append("")
            lines.append(f"📊 <b>Вейджер:</b> {w_curr:.2f}\\{w_req:.2f}")
        elif amount_to_lose > 0:
            lines.append("")
            lines.append(f"📊 <b>Отыгрыш:</b> {amount_to_lose:.2f} zł")
        lines.append("")
        lines.append(f"{heart} <i>{quote}</i>")

    caption = "\n".join(lines)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=get_text(lang, 'btn_deposit'),
                callback_data="deposit_balance",
                style="success"
            ),
        ],
        [
            InlineKeyboardButton(
                text=get_text(lang, 'btn_change_language'),
                callback_data="change_language"
            ),
            InlineKeyboardButton(
                text=get_text(lang, 'btn_back'),
                callback_data="back_to_main_menu"
            )
        ]
    ])

    photo_file_id = None
    try:
        user_photos = await bot.get_user_profile_photos(user_id, limit=1)
        if user_photos and user_photos.total_count > 0:
            photo_file_id = user_photos.photos[0][-1].file_id
    except Exception as e:
        logger.warning(f"Could not get profile photo for {user_id}: {e}")

    fallback_photo = get_fallback_avatar()

    if isinstance(event, Message):
        if photo_file_id:
            await event.answer_photo(photo=photo_file_id, caption=caption, reply_markup=keyboard)
        elif fallback_photo:
            await event.answer_photo(photo=fallback_photo, caption=caption, reply_markup=keyboard)
        else:
            await event.answer(text=caption, reply_markup=keyboard)
    else:
        # CallbackQuery
        if event.message and event.message.photo:
            try:
                await event.message.edit_caption(caption=caption, reply_markup=keyboard)
                return
            except Exception:
                pass
        try:
            await event.message.delete()
        except Exception:
            pass
        if photo_file_id:
            await bot.send_photo(chat_id=user_id, photo=photo_file_id, caption=caption, reply_markup=keyboard)
        elif fallback_photo:
            await bot.send_photo(chat_id=user_id, photo=fallback_photo, caption=caption, reply_markup=keyboard)
        else:
            await bot.send_message(chat_id=user_id, text=caption, reply_markup=keyboard)


@router.callback_query(F.data == "change_language")
async def change_language_menu(callback: CallbackQuery):
    """Показать меню смены языка"""
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang:ru")],
        [InlineKeyboardButton(text="🇵🇱 Polski", callback_data="set_lang:pl")],
        [InlineKeyboardButton(text="‹ Назад", callback_data="back_to_profile_from_lang")]
    ])
    if callback.message.photo:
        try:
            await callback.message.delete()
        except Exception:
            pass
        await callback.message.answer(get_text('ru', 'choose_language'), reply_markup=keyboard)
    else:
        await callback.message.edit_text(get_text('ru', 'choose_language'), reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data == "back_to_profile_from_lang")
async def back_to_profile_from_lang(callback: CallbackQuery):
    """Вернуться к профилю из меню языка"""
    await show_profile(callback)
    await callback.answer()


@router.callback_query(F.data == "back_to_main_menu")
async def back_to_main_menu(callback: CallbackQuery):
    """Вернуться в главное меню из профиля"""
    lang = db.get_user_language(callback.from_user.id)
    try:
        await callback.message.delete()
    except Exception:
        pass
    await callback.message.answer(get_text(lang, 'main_menu'), reply_markup=get_main_keyboard(lang))
    await callback.answer()


@router.message(F.text.in_(["Информация", "Informacje", "🔵 Информация", "🔵 Informacje", "❔ Информация", "❔ Informacje"]))
async def show_info(message: Message):
    """Показать информацию о боте"""
    lang = db.get_user_language(message.from_user.id)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text=get_text(lang, 'btn_agreement'),
                url="https://telegra.ph/POLZOVATELSKOE-SOGLASHENIE-I-PRAVILA-IGROVOJ-PLATFORMY-MACVBET-06-01",
            ),
            InlineKeyboardButton(text=get_text(lang, 'btn_support'), url="https://t.me/MacvBetSupport")
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
    """Обработка legacy вызовов игр"""
    lang = db.get_user_language(callback.from_user.id)
    miniapp_url = config.MINI_APP_URL.strip()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=get_text(lang, 'btn_start_miniapp'),
            web_app=WebAppInfo(url=miniapp_url),
            style="danger",
        )
    ]]) if miniapp_url else None
    await callback.answer()
    await callback.message.answer(get_text(lang, 'miniapp_intro'), reply_markup=keyboard)


@router.callback_query(F.data.startswith("disable_goals:"))
async def cb_disable_goals(callback: CallbackQuery):
    """Отключение уведомлений о голах в Telegram"""
    user_id_str = callback.data.split(":", 1)[1]
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(config.REDIS_URL or "redis://localhost:6379/0")
        await r.set(f"user:sports:disable_goals:{user_id_str}", "1")
        if callback.from_user and callback.from_user.id:
            await r.set(f"user:sports:disable_goals:{callback.from_user.id}", "1")
        await r.close()
    except Exception:
        pass

    await callback.answer("🔕 Уведомления о голах отключены!", show_alert=True)
    try:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔔 Включить голы", callback_data=f"enable_goals:{user_id_str}")]
        ])
        await callback.message.edit_reply_markup(reply_markup=keyboard)
    except Exception:
        pass


@router.callback_query(F.data.startswith("enable_goals:"))
async def cb_enable_goals(callback: CallbackQuery):
    """Включение уведомлений о голах в Telegram"""
    user_id_str = callback.data.split(":", 1)[1]
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(config.REDIS_URL or "redis://localhost:6379/0")
        await r.delete(f"user:sports:disable_goals:{user_id_str}")
        if callback.from_user and callback.from_user.id:
            await r.delete(f"user:sports:disable_goals:{callback.from_user.id}")
        await r.close()
    except Exception:
        pass

    await callback.answer("🔔 Уведомления о голах включены!", show_alert=True)
    try:
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔕 Выключить голы", callback_data=f"disable_goals:{user_id_str}")]
        ])
        await callback.message.edit_reply_markup(reply_markup=keyboard)
    except Exception:
        pass
