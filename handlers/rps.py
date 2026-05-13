"""
Обработчики игры Камень-Ножницы-Бумага
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

# Варианты выбора
CHOICES = {
    'rock': {'emoji': '🗿', 'name': 'Камень', 'beats': 'scissors'},
    'scissors': {'emoji': '✂️', 'name': 'Ножницы', 'beats': 'paper'},
    'paper': {'emoji': '📄', 'name': 'Бумага', 'beats': 'rock'}
}

pending_bets = {}


def generate_game_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def parse_choice(choice_str: str) -> str:
    """Парсинг выбора пользователя"""
    choice_str = choice_str.lower()
    if choice_str in ['к', 'камень', 'rock', 'r']:
        return 'rock'
    elif choice_str in ['н', 'ножницы', 'scissors', 's']:
        return 'scissors'
    elif choice_str in ['б', 'бумага', 'paper', 'p']:
        return 'paper'
    else:
        raise ValueError("Неверный выбор. Используйте: к, н или б")


@router.callback_query(F.data == "game_rps")
async def show_rps_game(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    await callback.message.delete()
    
    text = get_text(lang, 'rps_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_rps_menu
    await callback.bot.send_message(user_id, text, reply_markup=get_rps_menu(lang))
    await callback.answer()


@router.callback_query(F.data == "rps_make_bet")
async def rps_make_bet(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'rps_instruction')
    
    from keyboards.inline import get_rps_bet_instruction
    await callback.message.edit_text(text, reply_markup=get_rps_bet_instruction(lang))
    await callback.answer()


@router.callback_query(F.data == "back_to_rps")
async def back_to_rps(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'rps_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_rps_menu
    await callback.message.edit_text(text, reply_markup=get_rps_menu(lang))
    await callback.answer()


@router.message(Command("knb"))
async def cmd_knb(message: Message):
    user_id = message.from_user.id
    args = message.text.split()[1:]
    
    if len(args) < 2:
        await message.answer(
            "❌ <b>Формат:</b> <code>/knb [сумма] [к|н|б]</code>\n\n"
            "<b>Примеры:</b>\n<code>/knb 100 к</code>\n<code>/knb 50 н</code>"
        )
        return
    
    try:
        amount = float(args[0])
        if amount < config.MIN_BET or amount > config.MAX_BET:
            raise ValueError(f"Ставка: {config.MIN_BET}-{config.MAX_BET}")
        
        user_choice = parse_choice(args[1])
        
        success, btype = db.process_bet_start(user_id, amount)
        if not success:
            active_type = "Реальный" if btype == 'real' else "Бонусный"
            await message.answer(
                f"❌ <b>Не хватает баланса</b>\n\n"
                f"<i>Активный счет:</i> {active_type}\n<i>Требуется:</i> {amount}"
            )
            return
        
        # Случайный выбор
        bot_choice = random.choice(['rock', 'scissors', 'paper'])
        
        game_id = generate_game_id()
        
        # Определяем результат
        if user_choice == bot_choice:
            result = 'draw'
            result_text = "Ничья"
            # Возвращаем ставку
            db.process_bet_result(user_id, btype, amount, amount, 1.0)
            new_balance = db.get_balance(user_id) if btype == 'real' else db.get_bonus_balance(user_id)
            outcome = f"<i>Ставка возвращена</i>\n<i>Баланс:</i> {new_balance}"
        elif CHOICES[user_choice]['beats'] == bot_choice:
            result = 'win'
            result_text = "ПОБЕДА"
            win_amount = amount * 2.0
            db.process_bet_result(user_id, btype, amount, win_amount, 2.0)
            new_balance = db.get_balance(user_id) if btype == 'real' else db.get_bonus_balance(user_id)
            profit = win_amount - amount
            outcome = f"<i>Выигрыш:</i> {win_amount}\n<i>Прибыль:</i> +{profit}\n<i>Баланс:</i> {new_balance}"
        else:
            result = 'loss'
            result_text = "Проигрыш"
            db.process_bet_result(user_id, btype, amount, 0, 0)
            new_balance = db.get_balance(user_id) if btype == 'real' else db.get_bonus_balance(user_id)
            outcome = f"<i>Потеря:</i> -{amount}\n<i>Баланс:</i> {new_balance}"
        
        # Сохраняем в историю
        game_history.save_game(game_id, 'knb', user_id, amount, result, {
            'user_choice': user_choice,
            'bot_choice': bot_choice,
            'user_choice_name': CHOICES[user_choice]['name'],
            'bot_choice_name': CHOICES[bot_choice]['name'],
            'multiplier': 2.0 if result == 'win' else 0
        })
        
        # Отправляем эмодзи выбора бота
        await message.answer(CHOICES[bot_choice]['emoji'])
        await asyncio.sleep(1)
        
        # Отправляем результат
        emoji = "🎉" if result == 'win' else "😔" if result == 'loss' else "🤝"
        result_msg = await message.answer(
            f"{emoji} <b>{result_text.upper()}</b>\n\n"
            f"<i>Ваш выбор:</i> {CHOICES[user_choice]['name']}\n"
            f"<i>Выбор бота:</i> {CHOICES[bot_choice]['name']}\n"
            f"<i>Ставка:</i> {amount}\n\n"
            f"{outcome}"
        )
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await message.bot.get_me()).username
        await result_msg.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=knb_{game_id}'>#{game_id}</a>"
        )
    
    except (ValueError, IndexError) as e:
        await message.answer(f"❌ <b>Ошибка:</b> {e}")
