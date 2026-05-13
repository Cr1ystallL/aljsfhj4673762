"""
Обработчики игры в мины
"""
import asyncio
import random
import string
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from database.db import db
from database.game_history import game_history
from config import config
from locales.translations import get_text

router = Router()
active_games = {}

def generate_game_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

def calculate_multiplier(mines_count, opened_count):
    if opened_count == 0:
        return 1.0
    # Более сбалансированная формула
    base = 1.0 + (mines_count * 0.05)
    increment = 0.08 if mines_count <= 5 else 0.06
    return round(base * (1 + (opened_count * increment)), 2)

def generate_minefield(mines_count):
    field = [False] * 25
    for pos in random.sample(range(25), mines_count):
        field[pos] = True
    return field

def create_field_keyboard(game_id, opened):
    keyboard = []
    for row in range(5):
        row_buttons = []
        for col in range(5):
            idx = row * 5 + col
            if opened[idx] == 'safe':
                btn = InlineKeyboardButton(text="✅", callback_data="mines_noop")
            elif opened[idx] == 'mine':
                btn = InlineKeyboardButton(text="💣", callback_data="mines_noop")
            else:
                btn = InlineKeyboardButton(text="⬜", callback_data=f"mines_open:{game_id}:{idx}")
            row_buttons.append(btn)
        keyboard.append(row_buttons)
    keyboard.append([InlineKeyboardButton(text="💰 Забрать выигрыш", callback_data=f"mines_cashout:{game_id}")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard)

@router.callback_query(F.data == "game_mines")
async def show_mines_game(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    await callback.message.delete()
    
    text = get_text(lang, 'mines_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_mines_menu
    await callback.bot.send_message(user_id, text, reply_markup=get_mines_menu(lang))
    await callback.answer()


@router.callback_query(F.data == "mines_make_bet")
async def mines_make_bet(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'mines_instruction')
    
    from keyboards.inline import get_mines_bet_instruction
    await callback.message.edit_text(text, reply_markup=get_mines_bet_instruction(lang))
    await callback.answer()

@router.callback_query(F.data == "back_to_mines")
async def back_to_mines(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    text = get_text(lang, 'mines_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_mines_menu
    await callback.message.edit_text(text, reply_markup=get_mines_menu(lang))
    await callback.answer()

@router.message(Command("mines"))
async def cmd_mines(message: Message):
    user_id = message.from_user.id
    args = message.text.split()[1:]
    if len(args) < 2:
        await message.answer("❌ <b>Формат:</b> <code>/mines [сумма] [мины]</code>")
        return
    try:
        amount = float(args[0])
        mines_count = int(args[1])
        if amount < config.MIN_BET or amount > config.MAX_BET:
            raise ValueError(f"Ставка: {config.MIN_BET}-{config.MAX_BET}")
        if mines_count < 3 or mines_count > 10:
            raise ValueError("Мины: 3-10")
        success, btype = db.process_bet_start(user_id, amount)
        if not success:
            active_type = "Реальный" if btype == 'real' else "Бонусный"
            await message.answer(f"❌ <b>Не хватает баланса</b>\n<i>Активный счет:</i> {active_type}")
            return

        game_id = generate_game_id()
        active_games[game_id] = {
            'user_id': user_id, 'amount': amount, 'mines_count': mines_count,
            'field': generate_minefield(mines_count), 'opened': [None]*25,
            'opened_count': 0, 'is_active': True, 'btype': btype
        }
        mult = calculate_multiplier(mines_count, 0)
        await message.answer(
            f"💣 <b>MINES</b> (#{game_id})\n\n<i>Ставка:</i> {amount}\n<i>Мин:</i> {mines_count}\n"
            f"<i>Открыто:</i> 0/25\n<i>Множитель:</i> x{mult}\n<i>Выигрыш:</i> {amount*mult}",
            reply_markup=create_field_keyboard(game_id, active_games[game_id]['opened']))
    except (ValueError, IndexError) as e:
        await message.answer(f"❌ <b>Ошибка:</b> {e}")

@router.callback_query(F.data.startswith("mines_open:"))
async def mines_open_cell(callback: CallbackQuery):
    parts = callback.data.split(":")
    game_id, cell_idx = parts[1], int(parts[2])
    if game_id not in active_games:
        await callback.answer("❌ Игра не найдена", show_alert=True)
        return
    game = active_games[game_id]
    if game['user_id'] != callback.from_user.id or not game['is_active'] or game['opened'][cell_idx]:
        await callback.answer("❌ Ошибка", show_alert=True)
        return
    if game['field'][cell_idx]:
        game['opened'][cell_idx] = 'mine'
        game['is_active'] = False
        
        for i, is_mine in enumerate(game['field']):
            if is_mine and not game['opened'][i]:
                game['opened'][i] = 'mine'
        
        # Сохраняем в историю
        game_history.save_game(game_id, 'mines', game['user_id'], game['amount'], 'loss', {
            'mines_count': game['mines_count'],
            'opened_count': game['opened_count'],
            'opened_cells': [i for i, v in enumerate(game['opened']) if v == 'safe']
        })
        
        # Обработка проигрыша
        db.process_bet_result(game['user_id'], game['btype'], game['amount'], 0, 0)
        new_bal = db.get_balance(game['user_id']) if game['btype'] == 'real' else db.get_bonus_balance(game['user_id'])
        
        await callback.message.edit_text(
            f"💥 <b>МИНА!</b>\n\n<i>Ставка:</i> {game['amount']}\n<i>Открыто:</i> {game['opened_count']}/25\n"
            f"<i>Потеря:</i> -{game['amount']}\n<i>Баланс:</i> {new_bal}",
            reply_markup=create_field_keyboard(game_id, game['opened']))
        await callback.answer("💥 Мина!", show_alert=True)
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await callback.message.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=mines_{game_id}'>#{game_id}</a>"
        )
        
        await asyncio.sleep(27)
        if game_id in active_games:
            del active_games[game_id]
        return
    game['opened'][cell_idx] = 'safe'
    game['opened_count'] += 1
    mult = calculate_multiplier(game['mines_count'], game['opened_count'])
    win = game['amount'] * mult
    await callback.message.edit_text(
        f"💣 <b>MINES</b> (#{game_id})\n\n<i>Ставка:</i> {game['amount']}\n<i>Мин:</i> {game['mines_count']}\n"
        f"<i>Открыто:</i> {game['opened_count']}/25\n<i>Множитель:</i> x{mult}\n<i>Выигрыш:</i> {win}",
        reply_markup=create_field_keyboard(game_id, game['opened']))
    await callback.answer("✅ Безопасно!")

@router.callback_query(F.data.startswith("mines_cashout:"))
async def mines_cashout(callback: CallbackQuery):
    game_id = callback.data.split(":")[1]
    if game_id not in active_games:
        await callback.answer("❌ Игра не найдена", show_alert=True)
        return
    game = active_games[game_id]
    if game['user_id'] != callback.from_user.id or not game['is_active']:
        await callback.answer("❌ Ошибка", show_alert=True)
        return
    if game['opened_count'] == 0:
        await callback.answer("❌ Откройте хотя бы 1 клетку", show_alert=True)
        return
    mult = calculate_multiplier(game['mines_count'], game['opened_count'])
    win = game['amount'] * mult
    profit = win - game['amount']
    db.process_bet_result(game['user_id'], game['btype'], game['amount'], win, mult)
    new_bal = db.get_balance(game['user_id']) if game['btype'] == 'real' else db.get_bonus_balance(game['user_id'])
    game['is_active'] = False
    
    for i, is_mine in enumerate(game['field']):
        if is_mine and not game['opened'][i]:
            game['opened'][i] = 'mine'
    
    # Сохраняем в историю
    game_history.save_game(game_id, 'mines', game['user_id'], game['amount'], 'win', {
        'mines_count': game['mines_count'],
        'opened_count': game['opened_count'],
        'multiplier': mult,
        'win_amount': win,
        'opened_cells': [i for i, v in enumerate(game['opened']) if v == 'safe']
    })
    
    await callback.message.edit_text(
        f"🎉 <b>ВЫИГРЫШ!</b>\n\n<i>Ставка:</i> {game['amount']}\n<i>Открыто:</i> {game['opened_count']}/25\n"
        f"<i>Множитель:</i> x{mult}\n<i>Выигрыш:</i> {win}\n<i>Прибыль:</i> +{profit}\n<i>Баланс:</i> {new_bal}",
        reply_markup=create_field_keyboard(game_id, game['opened']))
    await callback.answer("💰 Выигрыш забран!")
    
    # Через 3 секунды заменяем на ссылку
    await asyncio.sleep(3)
    bot_username = (await callback.bot.get_me()).username
    await callback.message.edit_text(
        f"Игра <a href='https://t.me/{bot_username}?start=mines_{game_id}'>#{game_id}</a>"
    )
    
    await asyncio.sleep(27)
    if game_id in active_games:
        del active_games[game_id]

@router.callback_query(F.data == "mines_noop")
async def mines_noop(callback: CallbackQuery):
    await callback.answer()
