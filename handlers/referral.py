"""
Обработчик реферальной программы RevShare (50%)
"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db import db
from datetime import datetime
import asyncio

router = Router()

class PromoCodeState(StatesGroup):
    waiting_for_code = State()

class ReferralWithdrawalState(StatesGroup):
    waiting_for_details = State()

def get_referral_keyboard(has_promo: bool) -> InlineKeyboardMarkup:
    """Клавиатура для реферального меню"""
    keyboard = []
    if not has_promo:
        keyboard.append([InlineKeyboardButton(text="🎁 Создать промокод", callback_data="ref_create_promo")])
        
    keyboard.append([InlineKeyboardButton(text="📥 Вывести средства", callback_data="ref_claim_all")])
    keyboard.append([InlineKeyboardButton(text="‹ Назад", callback_data="back_to_profile_ref")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@router.callback_query(F.data == "show_referral_menu")
async def show_referral_menu(callback: CallbackQuery):
    """Показать реферальное меню"""
    bot_info = await callback.bot.get_me()
    bot_username = bot_info.username
    user_id = callback.from_user.id
    
    # Получить статистику
    stats = db.get_revshare_stats_all_time(user_id)
    promo_code = db.get_user_promo_code(user_id)
    
    clicks = stats['clicks']
    fd_count = stats['fd_count']
    rd_count = stats['rd_count']
    dep_sum = stats['dep_sum']
    total_income = stats['total_income']
    balance = stats['revshare_balance']
    negative_carryover = stats['negative_carryover']
    
    ref_link = f"https://t.me/{bot_username}?start={user_id}"
    if promo_code:
        promo_link = f"https://t.me/{bot_username}?start={promo_code}"
    else:
        promo_link = "Не создан"

    text = (
        "🎯 <b>Партнерская программа RevShare (50%)</b>\n\n"
        "Привлекайте игроков и получайте <b>пожизненно 50%</b> от чистой прибыли казино (NGR) с каждого игрока!\n\n"
        "━━━━ <b>Ваша статистика</b> ━━━━\n"
        f"• Переходы (Клики): <b>{clicks}</b>\n"
        f"• Первые депозиты (FD): <b>{fd_count}</b>\n"
        f"• Повторные депозиты (RD): <b>{rd_count}</b>\n"
        f"• Сумма депозитов: <b>{dep_sum:.2f} zl</b>\n"
        f"• Всего заработано: <b>{total_income:.2f} zl</b>\n\n"
        "━━━━ <b>Баланс</b> ━━━━\n"
        f"• Доступно к выводу: <b>{balance:.2f} zl</b>\n"
    )
    
    if negative_carryover > 0:
        text += f"• Отрицательный баланс: <b>-{negative_carryover:.2f} zl</b> (будет перекрыт будущей прибылью)\n\n"
    else:
        text += "\n"
        
    text += (
        "━━━━ <b>Ваши ссылки</b> ━━━━\n"
        f"• Реф.Ссылка (по ID):\n<code>{ref_link}</code>\n"
    )
    if promo_code:
        text += f"• Промо-ссылка:\n<code>{promo_link}</code>\n"
        text += f"• Ваш промокод: <code>{promo_code}</code>"

    try:
        if callback.message.photo:
            await callback.message.delete()
            await callback.bot.send_message(chat_id=user_id, text=text, reply_markup=get_referral_keyboard(bool(promo_code)))
        else:
            await callback.message.edit_text(text, reply_markup=get_referral_keyboard(bool(promo_code)))
    except Exception:
        await callback.message.delete()
        await callback.bot.send_message(chat_id=user_id, text=text, reply_markup=get_referral_keyboard(bool(promo_code)))
            
    try:
        await callback.answer()
    except:
        pass


@router.callback_query(F.data == "ref_create_promo")
async def start_create_promo(callback: CallbackQuery, state: FSMContext):
    """Начало создания промокода"""
    await state.set_state(PromoCodeState.waiting_for_code)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Отмена", callback_data="show_referral_menu")]
    ])
    await callback.message.edit_text(
        "📝 Введите желаемый промокод (только латинские буквы и цифры, от 3 до 15 символов):",
        reply_markup=keyboard
    )
    await callback.answer()


@router.message(PromoCodeState.waiting_for_code)
async def process_promo_code(message: Message, state: FSMContext):
    """Обработка ввода промокода"""
    code = message.text.strip().lower()
    
    if not code.isalnum() or len(code) < 3 or len(code) > 15:
        await message.answer("❌ Промокод должен состоять только из латинских букв и цифр, длиной от 3 до 15 символов. Попробуйте еще раз.")
        return
        
    success = db.create_promo_code(message.from_user.id, code)
    if success:
        await message.answer("✅ Промокод успешно создан!")
        await state.clear()
        
        # Эмуляция callback для возврата в меню
        class FakeCallback:
            def __init__(self, msg):
                self.message = msg
                self.from_user = msg.from_user
                self.bot = msg.bot
            async def answer(self): pass
            
        await show_referral_menu(FakeCallback(message))
    else:
        await message.answer("❌ Этот промокод уже занят. Попробуйте другой.")


@router.callback_query(F.data == "ref_claim_all")
async def claim_all_ref_bonus(callback: CallbackQuery, state: FSMContext):
    """Вывод партнерских средств"""
    user_id = callback.from_user.id
    
    stats = db.get_revshare_stats_all_time(user_id)
    balance = stats['revshare_balance']
    
    if balance < 200:
        await callback.answer(f"❌ Минимальная сумма для вывода: 200 zl (У вас {balance:.2f} zl)", show_alert=True)
        return
        
    # Проверка на 2-й понедельник месяца
    today = datetime.now()
    if today.weekday() != 0: # 0 - Понедельник
        await callback.answer("❌ Вывод доступен только во второй понедельник месяца.", show_alert=True)
        return
        
    # Считаем, какой это понедельник в месяце
    day_of_month = today.day
    if not (8 <= day_of_month <= 14):
        await callback.answer("❌ Сегодня понедельник, но не второй в этом месяце. Ожидайте второго понедельника.", show_alert=True)
        return

    await state.set_state(ReferralWithdrawalState.waiting_for_details)
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Отмена", callback_data="show_referral_menu")]
    ])
    await callback.message.edit_text(
        "📝 Введите ваши реквизиты для вывода средств (номер карты, кошелек USDT TRC20/BEP20 и т.д.):",
        reply_markup=keyboard
    )
    await callback.answer()

@router.message(ReferralWithdrawalState.waiting_for_details)
async def process_withdrawal_details(message: Message, state: FSMContext):
    details = message.text.strip()
    user_id = message.from_user.id
    
    # Anti-cheat check
    is_fraud = db.check_and_ban_fraud(user_id, details)
    if is_fraud:
        await message.answer("❌ В выводе отказано. Ваш аккаунт заблокирован за нарушение правил партнерской программы (мультиаккаунтинг/твинководство).")
        await state.clear()
        return

    # Перевод
    success, total_claimed = db.claim_revshare_balance(user_id)
    if success:
        wid = db.create_withdrawal(user_id, total_claimed, "pending_admin")
        await message.answer(f"✅ Успешно! Создана заявка на вывод {total_claimed:.2f} zl на реквизиты: {details}\nОжидайте проверки.")
        await state.clear()
        
        # Обновление withdrawal_details в SQLite для админ-панели (опционально, т.к. админ панель может читать из macvpay_orders)
        conn = db._get_connection()
        c = conn.cursor()
        c.execute('UPDATE users SET withdrawal_details = ? WHERE user_id = ?', (details, user_id))
        conn.commit()
        conn.close()
        
        # Эмуляция callback для возврата в меню
        class FakeCallback:
            def __init__(self, msg):
                self.message = msg
                self.from_user = msg.from_user
                self.bot = msg.bot
            async def answer(self): pass
            
        await show_referral_menu(FakeCallback(message))
    else:
        await message.answer("❌ Ошибка вывода средств.")
        await state.clear()


@router.callback_query(F.data == "back_to_profile_ref")
async def back_to_profile(callback: CallbackQuery):
    """Возврат в профиль"""
    from handlers.basic import show_profile
    await show_profile(callback)
    await callback.answer()

