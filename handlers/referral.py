"""
Обработчик реферальной программы
"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message, InlineKeyboardMarkup, InlineKeyboardButton
from database.db import db
from datetime import datetime
import asyncio

router = Router()

def get_referral_keyboard() -> InlineKeyboardMarkup:
    """Клавиатура для реферального меню"""
    keyboard = [
        [InlineKeyboardButton(text="📥 Забрать с рефок", callback_data="ref_claim_all")],
        [InlineKeyboardButton(text="‹ Назад", callback_data="back_to_profile_ref")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@router.callback_query(F.data == "show_referral_menu")
async def show_referral_menu(callback: CallbackQuery):
    """Показать реферальное меню"""
    bot_info = await callback.bot.get_me()
    bot_username = bot_info.username
    user_id = callback.from_user.id
    
    # Получить статистику
    stats = db.get_referral_stats(user_id)
    invited_count = stats['count']
    cpa_bal = stats['cpa_balance']
    ggr_bal = stats['ggr_balance']
    
    cpa_link = f"https://t.me/{bot_username}?start=cpa_{user_id}"
    ggr_link = f"https://t.me/{bot_username}?start=ggr_{user_id}"

    text = (
        "🎯 <b>Реферальная программа</b>\n\n"
        "Приводи друзей — зарабатывай вместе с ними!\n\n"
        "💰 <b>Деньги за реферала</b>\n"
        "• 100 ₽ за каждого нового приглашенного пользователя\n"
        "<i>Пример: Пригласили 10 человек → Получи 1000 рублей</i>\n"
        "• Выплата раз в 1 день\n\n"
        "📈 <b>GGR-бонус</b>\n"
        "• 15% от чистой прибыли рефералов\n"
        "• Выплаты каждую неделю\n\n"
        "━━━━ <b>Ваши данные</b> ━━━━\n"
        f"• По ссылке приглашено: <b>{invited_count}</b> пользователей\n"
        f"• Баланс CPA: <b>{cpa_bal:.2f} ₽</b>\n"
        f"• Баланс GGR: <b>{ggr_bal:.2f} ₽</b>\n\n"
        f"• Реф.Ссылка для 100₽ за реферала:\n<code>{cpa_link}</code>\n"
        f"• Реф.Ссылка для GGR-бонусa:\n<code>{ggr_link}</code>"
    )

    try:
        if callback.message.photo:
            # Если было фото, удаляем и отправляем текстовое сообщение
            await callback.message.delete()
            await callback.bot.send_message(chat_id=user_id, text=text, reply_markup=get_referral_keyboard())
        else:
            await callback.message.edit_text(text, reply_markup=get_referral_keyboard())
    except Exception:
        # Fallback if editing fails
        await callback.message.delete()
        await callback.bot.send_message(chat_id=user_id, text=text, reply_markup=get_referral_keyboard())
            
    try:
        await callback.answer()
    except:
        pass

@router.callback_query(F.data == "ref_claim_all")
async def claim_all_ref_bonus(callback: CallbackQuery):
    """Единый сбор рефералки"""
    user_id = callback.from_user.id
    
    stats = db.get_referral_stats(user_id)
    last_payout = stats['last_cpa']  # Используем общий таймер
    balance = stats['cpa_balance'] + stats['ggr_balance']
    
    if balance <= 0:
        await callback.answer("❌ Нет доступных средств для вывода!", show_alert=True)
        return
        
    if last_payout:
        from datetime import datetime
        last_dt = datetime.fromisoformat(last_payout)
        now = datetime.now()
        diff = now - last_dt
        
        # Общий кулдаун 24 часа
        if diff.total_seconds() < 86400:
            hours_left = int((86400 - diff.total_seconds()) / 3600)
            mins_left = int(((86400 - diff.total_seconds()) % 3600) / 60)
            await callback.answer(f"⏳ Следующий вывод доступен через {hours_left} ч. {mins_left} мин.", show_alert=True)
            return
            
    # Перевод
    success, total_claimed = db.claim_all_ref_balance(user_id)
    if success:
        await callback.answer(f"✅ Успешно! {total_claimed:.2f} ₽ переведены на основной счет!", show_alert=True)
        # Обновляем меню
        await show_referral_menu(callback)
    else:
        await callback.answer("❌ Ошибка вывода средств.", show_alert=True)


@router.callback_query(F.data == "back_to_profile_ref")
async def back_to_profile(callback: CallbackQuery):
    """Возврат в профиль"""
    from handlers.basic import show_profile
    await show_profile(callback)
    await callback.answer()
