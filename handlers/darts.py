"""
Обработчики игры в дартс
"""
import asyncio
import random
import string
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery

from database.db import db
from database.game_history import game_history
from keyboards.inline import get_confirm_bet_menu
from config import config
from locales.translations import get_text

router = Router()

pending_bets = {}


def generate_bet_id() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


@router.callback_query(F.data == "game_darts")
async def show_darts_game(callback: CallbackQuery):
    """Показать меню игры в дартс"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    await callback.message.delete()
    
    text = get_text(lang, 'darts_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_darts_menu
    from utils.game_photos import send_game_message
    await send_game_message(
        callback.bot,
        user_id,
        'darts',
        text,
        reply_markup=get_darts_menu(lang),
    )
    await callback.answer()


@router.callback_query(F.data == "darts_make_bet")
async def darts_make_bet(callback: CallbackQuery):
    """Показать инструкцию по ставке"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'darts_instruction')
    
    from keyboards.inline import get_darts_bet_instruction
    await callback.message.edit_text(text, reply_markup=get_darts_bet_instruction(lang))
    await callback.answer()


@router.callback_query(F.data == "back_to_darts")
async def back_to_darts(callback: CallbackQuery):
    """Вернуться к меню игры в дартс"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'darts_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_darts_menu
    await callback.message.edit_text(text, reply_markup=get_darts_menu(lang))
    await callback.answer()


@router.message(Command("darts"))
async def cmd_darts(message: Message):
    """Обработчик команды /darts"""
    user_id = message.from_user.id
    command_text = message.text.split()[1:]
    
    if not command_text:
        await message.answer(
            "❌ <b>Неверный формат команды</b>\n\n"
            "Используйте: <code>/darts [сумма] [вид]</code>"
        )
        return
    
    try:
        bet_amount = float(command_text[0])
        if bet_amount < config.MIN_BET or bet_amount > config.MAX_BET:
            raise ValueError(f"Ставка должна быть от {config.MIN_BET} до {config.MAX_BET}")
        
        bet_type = command_text[1].lower() if len(command_text) > 1 else ""
        
        if bet_type in ["яблочко", "bullseye", "6"]:
            multiplier = 5.0
            bet_desc = "Яблочко (6)"
        elif bet_type in ["4-5", "45"]:
            multiplier = 2.5
            bet_desc = "4-5 очков"
        elif bet_type in ["1-3", "13"]:
            multiplier = 1.5
            bet_desc = "1-3 очка"
        else:
            raise ValueError("Неверный тип ставки")
        
        if not db.has_sufficient_balance(user_id, bet_amount):
            await message.answer(
                "❌ <b>Не хватает баланса</b>\n\n"
                f"<i>Ваш баланс:</i> {db.get_balance(user_id)}\n"
                f"<i>Требуется:</i> {bet_amount}"
            )
            return
        
        bet_id = generate_bet_id()
        pending_bets[bet_id] = {
            'user_id': user_id,
            'amount': bet_amount,
            'bet_type': bet_type,
            'multiplier': multiplier,
            'description': bet_desc
        }
        
        text = (
            f"🎯 <b>DARTS</b> (#{bet_id})\n\n"
            f"<i>Сумма ставки:</i> {bet_amount}\n"
            f"<i>Ставка:</i> {bet_desc}\n"
            f"<i>Коэффициент:</i> x{multiplier}\n"
            f"<i>Возможный выигрыш:</i> {bet_amount * multiplier}\n\n"
            f"Подтвердите ставку:"
        )
        
        await message.answer(text, reply_markup=get_confirm_bet_menu(bet_id, "darts"))
    
    except (ValueError, IndexError) as e:
        await message.answer(f"❌ <b>Ошибка:</b> {str(e)}")


@router.callback_query(F.data.startswith("confirm_darts:"))
async def confirm_darts_bet(callback: CallbackQuery):
    """Подтверждение ставки в дартс"""
    bet_id = callback.data.split(":")[1]
    
    if bet_id not in pending_bets:
        await callback.answer("❌ Ставка не найдена", show_alert=True)
        return
    
    bet_data = pending_bets[bet_id]
    user_id = callback.from_user.id
    
    if bet_data['user_id'] != user_id:
        await callback.answer("❌ Это не ваша ставка", show_alert=True)
        return
    
    success, btype = db.process_bet_start(user_id, bet_data['amount'])
    if not success:
        await callback.message.edit_text("❌ <b>Не хватает баланса</b>")
        del pending_bets[bet_id]
        await callback.answer()
        return
    
    bet_data['btype'] = btype
    bot_username = (await callback.bot.get_me()).username
    
    await callback.message.edit_text(
        f"Бросаем <a href='https://t.me/{bot_username}?start=darts_{bet_id}'>дротик</a>..."
    )
    
    dice_message = await callback.bot.send_dice(user_id, emoji="🎯")
    await asyncio.sleep(4)
    
    dice_value = dice_message.dice.value
    is_win = False
    
    if bet_data['bet_type'] in ["яблочко", "bullseye", "6"] and dice_value == 6:
        is_win = True
    elif bet_data['bet_type'] in ["4-5", "45"] and 4 <= dice_value <= 5:
        is_win = True
    elif bet_data['bet_type'] in ["1-3", "13"] and 1 <= dice_value <= 3:
        is_win = True
    
    if is_win:
        win_amount = bet_data['amount'] * bet_data['multiplier']
        db.process_bet_result(user_id, bet_data['btype'], bet_data['amount'], win_amount, bet_data['multiplier'])
        new_balance = db.get_balance(user_id) if bet_data['btype'] == 'real' else db.get_bonus_balance(user_id)
        profit = win_amount - bet_data['amount']
        
        # Сохраняем в историю
        game_history.save_game(bet_id, 'darts', user_id, bet_data['amount'], 'win', {
            'bet_type': bet_data['description'],
            'dice_value': dice_value,
            'multiplier': bet_data['multiplier'],
            'win_amount': win_amount
        })
        
        result_msg = await callback.bot.send_message(
            user_id,
            f"🎉 <b>ВЫИГРЫШ</b>\n\n"
            f"<i>Очков:</i> {dice_value}\n"
            f"<i>Выигрыш:</i> {win_amount}\n"
            f"<i>Прибыль:</i> +{profit}\n"
            f"<i>Новый баланс:</i> {new_balance}"
        )
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await result_msg.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=darts_{bet_id}'>#{bet_id}</a>"
        )
    else:
        db.process_bet_result(user_id, bet_data['btype'], bet_data['amount'], 0, bet_data['multiplier'])
        new_balance = db.get_balance(user_id) if bet_data['btype'] == 'real' else db.get_bonus_balance(user_id)
        
        # Сохраняем в историю
        game_history.save_game(bet_id, 'darts', user_id, bet_data['amount'], 'loss', {
            'bet_type': bet_data['description'],
            'dice_value': dice_value,
            'multiplier': 0
        })
        
        result_msg = await callback.bot.send_message(
            user_id,
            f"😔 <b>Проигрыш</b>\n\n"
            f"<i>Очков:</i> {dice_value}\n"
            f"<i>Потеря:</i> -{bet_data['amount']}\n"
            f"<i>Новый баланс:</i> {new_balance}"
        )
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await result_msg.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=darts_{bet_id}'>#{bet_id}</a>"
        )
    
    del pending_bets[bet_id]
    await callback.answer()


@router.callback_query(F.data.startswith("cancel_darts:"))
async def cancel_darts_bet(callback: CallbackQuery):
    """Отмена ставки"""
    bet_id = callback.data.split(":")[1]
    if bet_id in pending_bets:
        del pending_bets[bet_id]
    
    await callback.message.edit_text(
        "❌ <b>Ставка отклонена</b>\n\n"
        "Вы можете сделать новую ставку командой /darts"
    )
    await callback.answer("Ставка отменена")
