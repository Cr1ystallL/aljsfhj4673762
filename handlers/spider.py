"""
Обработчики игры Паучок
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

# Настройки сложности
DIFFICULTY_SETTINGS = {
    'easy': {
        'name': 'Легкий',
        'base_multiplier': 1.2,
        'increment': 0.25,
        'spider_chance': 0.5,  # 50% что паук будет в ряду
        'min_spiders': 0,
        'max_spiders': 1
    },
    'medium': {
        'name': 'Средний',
        'base_multiplier': 1.5,
        'increment': 0.35,
        'spider_chance': 1.0,  # 100% паук в ряду
        'min_spiders': 1,
        'max_spiders': 1
    },
    'hard': {
        'name': 'Сложный',
        'base_multiplier': 2.0,
        'increment': 0.5,
        'spider_chance': 1.0,  # 100% паук в ряду
        'min_spiders': 2,
        'max_spiders': 2
    }
}


def generate_game_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def calculate_spider_multiplier(difficulty: str, rows_passed: int) -> float:
    """Рассчитать множитель"""
    settings = DIFFICULTY_SETTINGS[difficulty]
    return round(settings['base_multiplier'] + (rows_passed * settings['increment']), 2)


def generate_spider_field(difficulty: str) -> list:
    """Генерация поля 5 рядов по 3 клетки"""
    settings = DIFFICULTY_SETTINGS[difficulty]
    field = []
    
    for row in range(5):
        row_cells = [False, False, False]  # False = безопасно, True = паук
        
        # Определяем количество пауков в ряду
        if random.random() < settings['spider_chance']:
            spider_count = random.randint(settings['min_spiders'], settings['max_spiders'])
            spider_positions = random.sample(range(3), min(spider_count, 3))
            for pos in spider_positions:
                row_cells[pos] = True
        
        field.append(row_cells)
    
    return field


def create_spider_keyboard(game_id: str, field: list, opened: list, current_row: int) -> InlineKeyboardMarkup:
    """Создать клавиатуру игрового поля"""
    keyboard = []
    
    for row_idx in range(5):
        row_buttons = []
        for col_idx in range(3):
            cell_key = f"{row_idx}_{col_idx}"
            
            if row_idx < current_row:
                # Пройденные ряды - показываем результат
                if opened.get(cell_key) == 'clicked':
                    # Клетка на которую нажал игрок
                    btn = InlineKeyboardButton(text="✅", callback_data="spider_noop")
                elif field[row_idx][col_idx]:
                    # Паук (не нажатый)
                    btn = InlineKeyboardButton(text="🕷", callback_data="spider_noop")
                else:
                    # Безопасная клетка (не нажатая)
                    btn = InlineKeyboardButton(text="⚪", callback_data="spider_noop")
            elif row_idx == current_row:
                # Текущий ряд - можно нажимать
                if cell_key in opened:
                    if opened[cell_key] == 'clicked':
                        btn = InlineKeyboardButton(text="✅", callback_data="spider_noop")
                    elif field[row_idx][col_idx]:
                        btn = InlineKeyboardButton(text="🕷", callback_data="spider_noop")
                    else:
                        btn = InlineKeyboardButton(text="⚪", callback_data="spider_noop")
                else:
                    btn = InlineKeyboardButton(text="⬜", callback_data=f"spider_open:{game_id}:{row_idx}:{col_idx}")
            else:
                # Будущие ряды - закрыты
                btn = InlineKeyboardButton(text="⬛", callback_data="spider_noop")
            
            row_buttons.append(btn)
        keyboard.append(row_buttons)
    
    # Кнопка забрать выигрыш (если прошли хотя бы 1 ряд)
    if current_row > 0:
        keyboard.append([InlineKeyboardButton(text="💰 Забрать выигрыш", callback_data=f"spider_cashout:{game_id}")])
    
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@router.callback_query(F.data == "game_slot")
async def show_spider_game(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    await callback.message.delete()
    
    text = get_text(lang, 'spider_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    from keyboards.inline import get_spider_menu
    from utils.game_photos import send_game_message
    await send_game_message(callback.bot, user_id, 'spider', text, reply_markup=get_spider_menu(lang))
    await callback.answer()


@router.callback_query(F.data == "spider_make_bet")
async def spider_make_bet(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)

    text = get_text(lang, 'spider_instruction')

    from keyboards.inline import get_spider_bet_instruction
    from utils.game_photos import replace_with_game_photo
    await replace_with_game_photo(
        callback,
        'spider',
        text,
        reply_markup=get_spider_bet_instruction(lang),
    )
    await callback.answer()


@router.callback_query(F.data == "back_to_spider")
async def back_to_spider(callback: CallbackQuery):
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)

    text = get_text(lang, 'spider_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)

    from keyboards.inline import get_spider_menu
    from utils.game_photos import replace_with_game_photo
    await replace_with_game_photo(
        callback,
        'spider',
        text,
        reply_markup=get_spider_menu(lang),
    )
    await callback.answer()


@router.message(Command("spider"))
async def cmd_spider(message: Message):
    user_id = message.from_user.id
    args = message.text.split()[1:]
    
    if len(args) < 2:
        await message.answer(
            "❌ <b>Формат:</b> <code>/spider [сумма] [e|m|h]</code>\n\n"
            "<b>Примеры:</b>\n<code>/spider 100 e</code>\n<code>/spider 50 m</code>"
        )
        return
    
    try:
        amount = float(args[0])
        difficulty_input = args[1].lower()
        
        # Парсинг сложности
        if difficulty_input in ['e', 'easy', 'легкий']:
            difficulty = 'easy'
        elif difficulty_input in ['m', 'medium', 'средний']:
            difficulty = 'medium'
        elif difficulty_input in ['h', 'hard', 'сложный']:
            difficulty = 'hard'
        else:
            raise ValueError("Сложность: e (легкий), m (средний), h (сложный)")
        
        if amount < config.MIN_BET or amount > config.MAX_BET:
            raise ValueError(f"Ставка: {config.MIN_BET}-{config.MAX_BET}")
        
        success, btype = db.process_bet_start(user_id, amount)
        if not success:
            active_type = "Реальный" if btype == 'real' else "Бонусный"
            await message.answer(
                f"❌ <b>Не хватает баланса</b>\n\n"
                f"<i>Активный счет:</i> {active_type}\n<i>Требуется:</i> {amount}"
            )
            return
        
        # Создаем игру
        game_id = generate_game_id()
        field = generate_spider_field(difficulty)
        
        active_games[game_id] = {
            'user_id': user_id,
            'amount': amount,
            'difficulty': difficulty,
            'field': field,
            'opened': {},
            'current_row': 0,
            'is_active': True,
            'btype': btype
        }
        
        mult = calculate_spider_multiplier(difficulty, 0)
        diff_name = DIFFICULTY_SETTINGS[difficulty]['name']
        
        text = (
            f"🎰 <b>SPIDER</b> (#{game_id})\n\n"
            f"<i>Ставка:</i> {amount}\n"
            f"<i>Сложность:</i> {diff_name}\n"
            f"<i>Ряд:</i> 1/5\n"
            f"<i>Множитель:</i> x{mult}\n"
            f"<i>Текущий выигрыш:</i> {amount * mult}\n\n"
            f"Выберите клетку в первом ряду!"
        )
        
        await message.answer(text, reply_markup=create_spider_keyboard(game_id, field, {}, 0))
    
    except (ValueError, IndexError) as e:
        await message.answer(f"❌ <b>Ошибка:</b> {e}")


@router.callback_query(F.data.startswith("spider_open:"))
async def spider_open_cell(callback: CallbackQuery):
    parts = callback.data.split(":")
    game_id, row_idx, col_idx = parts[1], int(parts[2]), int(parts[3])
    
    if game_id not in active_games:
        await callback.answer("❌ Игра не найдена", show_alert=True)
        return
    
    game = active_games[game_id]
    
    if game['user_id'] != callback.from_user.id:
        await callback.answer("❌ Это не ваша игра", show_alert=True)
        return
    
    if not game['is_active']:
        await callback.answer("❌ Игра завершена", show_alert=True)
        return
    
    if row_idx != game['current_row']:
        await callback.answer("❌ Выберите клетку в текущем ряду", show_alert=True)
        return
    
    cell_key = f"{row_idx}_{col_idx}"
    
    # Проверяем, паук или нет
    if game['field'][row_idx][col_idx]:
        # Паук! Проигрыш
        game['opened'][cell_key] = 'clicked'
        game['is_active'] = False
        
        # Открываем все клетки
        for r in range(5):
            for c in range(3):
                key = f"{r}_{c}"
                if key not in game['opened']:
                    game['opened'][key] = 'revealed'
        
        # Сохраняем в историю
        game_history.save_game(game_id, 'spider', game['user_id'], game['amount'], 'loss', {
            'difficulty': game['difficulty'],
            'rows_passed': game['current_row'],
            'clicked_cells': [k for k, v in game['opened'].items() if v == 'clicked']
        })
        
        # Сохраняем в историю и проигрыш
        db.process_bet_result(game['user_id'], game['btype'], game['amount'], 0, 0)
        new_bal = db.get_balance(callback.from_user.id) if game['btype'] == 'real' else db.get_bonus_balance(callback.from_user.id)
        
        text = (
            f"🕷 <b>ПАУК! Вы проиграли!</b>\n\n"
            f"<i>Ставка:</i> {game['amount']}\n"
            f"<i>Пройдено рядов:</i> {game['current_row']}/5\n"
            f"<i>Потеря:</i> -{game['amount']}\n"
            f"<i>Баланс:</i> {new_bal}"
        )
        
        # Создаем клавиатуру с кнопкой паука
        spider_keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🕷", callback_data="spider_noop")]
        ])
        
        await callback.message.edit_text(text, reply_markup=spider_keyboard)
        await callback.answer("🕷 Паук!", show_alert=True)
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await callback.message.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=spider_{game_id}'>#{game_id}</a>"
        )
        
        await asyncio.sleep(27)
        if game_id in active_games:
            del active_games[game_id]
        return
    
    # Безопасная клетка!
    game['opened'][cell_key] = 'clicked'
    
    # Открываем весь ряд
    for c in range(3):
        key = f"{row_idx}_{c}"
        if key not in game['opened']:
            game['opened'][key] = 'revealed'
    
    # Переходим к следующему ряду
    game['current_row'] += 1
    
    # Проверяем, прошли ли все ряды
    if game['current_row'] >= 5:
        # Победа!
        game['is_active'] = False
        mult = calculate_spider_multiplier(game['difficulty'], 5)
        win_amount = game['amount'] * mult
        profit = win_amount - game['amount']
        db.process_bet_result(game['user_id'], game['btype'], game['amount'], win_amount, mult)
        new_balance = db.get_balance(callback.from_user.id) if game['btype'] == 'real' else db.get_bonus_balance(callback.from_user.id)
        
        # Сохраняем в историю
        game_history.save_game(game_id, 'spider', game['user_id'], game['amount'], 'win', {
            'difficulty': game['difficulty'],
            'rows_passed': 5,
            'multiplier': mult,
            'win_amount': win_amount,
            'clicked_cells': [k for k, v in game['opened'].items() if v == 'clicked']
        })
        
        text = (
            f"🎉 <b>ПОБЕДА! Все ряды пройдены!</b>\n\n"
            f"<i>Ставка:</i> {game['amount']}\n"
            f"<i>Пройдено рядов:</i> 5/5\n"
            f"<i>Множитель:</i> x{mult}\n"
            f"<i>Выигрыш:</i> {win_amount}\n"
            f"<i>Прибыль:</i> +{profit}\n"
            f"<i>Баланс:</i> {new_balance}"
        )
        
        await callback.message.edit_text(text, reply_markup=create_spider_keyboard(
            game_id, game['field'], game['opened'], game['current_row']))
        await callback.answer("🎉 Победа!", show_alert=True)
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await callback.message.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=spider_{game_id}'>#{game_id}</a>"
        )
        
        await asyncio.sleep(27)
        if game_id in active_games:
            del active_games[game_id]
        return
    
    # Продолжаем игру
    mult = calculate_spider_multiplier(game['difficulty'], game['current_row'])
    current_win = game['amount'] * mult
    
    text = (
        f"🎰 <b>SPIDER</b> (#{game_id})\n\n"
        f"<i>Ставка:</i> {game['amount']}\n"
        f"<i>Сложность:</i> {DIFFICULTY_SETTINGS[game['difficulty']]['name']}\n"
        f"<i>Ряд:</i> {game['current_row'] + 1}/5\n"
        f"<i>Множитель:</i> x{mult}\n"
        f"<i>Текущий выигрыш:</i> {current_win}\n\n"
        f"Выберите клетку в ряду {game['current_row'] + 1}!"
    )
    
    await callback.message.edit_text(text, reply_markup=create_spider_keyboard(
        game_id, game['field'], game['opened'], game['current_row']))
    await callback.answer("✅ Безопасно!")


@router.callback_query(F.data.startswith("spider_cashout:"))
async def spider_cashout(callback: CallbackQuery):
    game_id = callback.data.split(":")[1]
    
    if game_id not in active_games:
        await callback.answer("❌ Игра не найдена", show_alert=True)
        return
    
    game = active_games[game_id]
    
    if game['user_id'] != callback.from_user.id or not game['is_active']:
        await callback.answer("❌ Ошибка", show_alert=True)
        return
    
    if game['current_row'] == 0:
        await callback.answer("❌ Пройдите хотя бы 1 ряд", show_alert=True)
        return
    
    # Рассчитываем выигрыш
    mult = calculate_spider_multiplier(game['difficulty'], game['current_row'])
    win_amount = game['amount'] * mult
    profit = win_amount - game['amount']
    db.process_bet_result(game['user_id'], game['btype'], game['amount'], win_amount, mult)
    new_balance = db.get_balance(callback.from_user.id) if game['btype'] == 'real' else db.get_bonus_balance(callback.from_user.id)
    
    game['is_active'] = False
    
    # Открываем все оставшиеся клетки
    for r in range(5):
        for c in range(3):
            key = f"{r}_{c}"
            if key not in game['opened']:
                game['opened'][key] = 'revealed'
    
    # Сохраняем в историю
    game_history.save_game(game_id, 'spider', game['user_id'], game['amount'], 'win', {
        'difficulty': game['difficulty'],
        'rows_passed': game['current_row'],
        'multiplier': mult,
        'win_amount': win_amount,
        'clicked_cells': [k for k, v in game['opened'].items() if v == 'clicked']
    })
    
    text = (
        f"🎉 <b>ВЫИГРЫШ ЗАБРАН!</b>\n\n"
        f"<i>Ставка:</i> {game['amount']}\n"
        f"<i>Пройдено рядов:</i> {game['current_row']}/5\n"
        f"<i>Множитель:</i> x{mult}\n"
        f"<i>Выигрыш:</i> {win_amount}\n"
        f"<i>Прибыль:</i> +{profit}\n"
        f"<i>Баланс:</i> {new_balance}"
    )
    
    await callback.message.edit_text(text, reply_markup=create_spider_keyboard(
        game_id, game['field'], game['opened'], game['current_row']))
    await callback.answer("💰 Выигрыш забран!")
    
    # Через 3 секунды заменяем на ссылку
    await asyncio.sleep(3)
    bot_username = (await callback.bot.get_me()).username
    await callback.message.edit_text(
        f"Игра <a href='https://t.me/{bot_username}?start=spider_{game_id}'>#{game_id}</a>"
    )
    
    await asyncio.sleep(27)
    if game_id in active_games:
        del active_games[game_id]


@router.callback_query(F.data == "spider_noop")
async def spider_noop(callback: CallbackQuery):
    await callback.answer()
