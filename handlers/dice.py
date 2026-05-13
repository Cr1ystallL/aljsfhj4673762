"""
Обработчики игры в кости
"""
import asyncio
import random
import string
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery

from database.db import db
from database.game_history import game_history
from logic.game_logic import parse_cube_command, check_win, calculate_win, BetType
from keyboards.inline import get_confirm_bet_menu
from config import config
from utils.logger import log_action
from locales.translations import format_amount, get_text

router = Router()

# Временное хранилище ставок (в продакшене использовать Redis или БД)
pending_bets = {}


def generate_bet_id() -> str:
    """Генерация случайного ID ставки"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


@router.callback_query(F.data == "game_dice")
async def show_dice_game(callback: CallbackQuery):
    """Показать меню игры в кости"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    # Удаляем сообщение со списком игр
    await callback.message.delete()
    
    text = get_text(lang, 'dice_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    # Отправляем текстовое сообщение без фото
    from keyboards.inline import get_dice_menu
    await callback.bot.send_message(
        chat_id=user_id,
        text=text,
        reply_markup=get_dice_menu(lang)
    )
    await callback.answer()


@router.callback_query(F.data == "dice_make_bet")
async def dice_make_bet(callback: CallbackQuery):
    """Показать инструкцию по ставке"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    # Удаляем сообщение с фото
    await callback.message.delete()
    
    text = get_text(lang, 'dice_instruction')
    
    from keyboards.inline import get_dice_bet_instruction
    await callback.bot.send_message(
        chat_id=user_id,
        text=text,
        reply_markup=get_dice_bet_instruction(lang)
    )
    await callback.answer()


@router.callback_query(F.data == "back_to_dice")
async def back_to_dice(callback: CallbackQuery):
    """Вернуться к меню игры в кости"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    # Удаляем текущее сообщение
    await callback.message.delete()
    
    text = get_text(lang, 'dice_menu', min_bet=config.MIN_BET, max_bet=config.MAX_BET)
    
    # Отправляем текстовое сообщение без фото
    from keyboards.inline import get_dice_menu
    await callback.bot.send_message(
        chat_id=user_id,
        text=text,
        reply_markup=get_dice_menu(lang)
    )
    await callback.answer()


@router.callback_query(F.data == "back_to_games")
async def back_to_games(callback: CallbackQuery):
    """Вернуться к списку игр"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    await callback.message.delete()
    
    text = get_text(lang, 'games_title')
    
    # Отправляем текстовое сообщение без фото
    from keyboards.inline import get_games_menu
    await callback.bot.send_message(
        chat_id=user_id,
        text=text,
        reply_markup=get_games_menu(lang)
    )
    await callback.answer()


@router.message(Command("cube"))
async def cmd_cube(message: Message):
    """
    Обработчик команды /cube
    Создает ставку и запрашивает подтверждение
    """
    user_id = message.from_user.id
    
    # Получаем аргументы команды
    command_text = message.text.split()[1:]
    
    if not command_text:
        await message.answer(
            "❌ <b>Неверный формат команды</b>\n\n"
            "Используйте: <code>/cube [сумма] [вид]</code>\n\n"
            "<b>Примеры:</b>\n"
            "<code>/cube 100 чет</code>\n"
            "<code>/cube 50 б</code>\n"
            "<code>/cube 20 5</code>"
        )
        return
    
    try:
        # Парсим команду
        bet_amount, bet_type, exact_number = parse_cube_command(command_text)
        
        # Проверяем баланс
        if not db.has_sufficient_balance(user_id, bet_amount):
            await message.answer(
                "❌ <b>Не хватает баланса</b>\n\n"
                "Пополните баланс в личном кабинете.\n\n"
                f"<i>Ваш баланс:</i> {db.get_balance(user_id)} монет\n"
                f"<i>Требуется:</i> {bet_amount} монет"
            )
            return
        
        # Генерируем ID ставки
        bet_id = generate_bet_id()
        
        # Рассчитываем коэффициент
        multiplier = get_multiplier_for_type(bet_type)
        
        # Формируем описание ставки
        bet_description = get_bet_description_short(bet_type, exact_number)
        
        # Сохраняем ставку с информацией о пользователе
        pending_bets[bet_id] = {
            'user_id': user_id,
            'amount': bet_amount,
            'bet_type': bet_type,
            'exact_number': exact_number,
            'multiplier': multiplier,
            'user_first_name': message.from_user.first_name,
            'user_username': message.from_user.username
        }
        
        # Отправляем подтверждение
        text = (
            f"🎲 <b>CUBE</b> (#{bet_id})\n\n"
            f"<i>Сумма ставки:</i> {bet_amount}\n"
            f"<i>Ставка:</i> {bet_description}\n"
            f"<i>Коэффициент:</i> x{multiplier}\n"
            f"<i>Возможный выигрыш:</i> {calculate_win(bet_amount, bet_type)}\n\n"
            f"Подтвердите ставку:"
        )
        
        await message.answer(text, reply_markup=get_confirm_bet_menu(bet_id))
    
    except ValueError as e:
        await message.answer(
            f"❌ <b>Ошибка:</b> {str(e)}\n\n"
            "Используйте: <code>/cube [сумма] [вид]</code>"
        )


@router.callback_query(F.data.startswith("confirm_bet:"))
async def confirm_bet(callback: CallbackQuery):
    """Подтверждение и выполнение ставки"""
    bet_id = callback.data.split(":")[1]
    
    # Проверяем наличие ставки
    if bet_id not in pending_bets:
        await callback.answer("❌ Ставка не найдена или уже обработана", show_alert=True)
        return
    
    bet_data = pending_bets[bet_id]
    user_id = callback.from_user.id
    
    # Проверяем, что пользователь тот же
    if bet_data['user_id'] != user_id:
        await callback.answer("❌ Это не ваша ставка", show_alert=True)
        return
    
    # Проверяем баланс и списываем
    success, btype = db.process_bet_start(user_id, bet_data['amount'])
    if not success:
        await callback.message.edit_text(
            "❌ <b>Не хватает баланса</b>\n\n"
            "Пополните баланс в личном кабинете или смените активный счет."
        )
        del pending_bets[bet_id]
        await callback.answer()
        return
    
    bet_data['btype'] = btype
    
    # Получаем username бота для ссылки
    bot_username = (await callback.bot.get_me()).username
    
    # Обновляем сообщение и сохраняем его для последующего удаления
    throwing_msg = await callback.message.edit_text(
        f"Бросаем <a href='https://t.me/{bot_username}?start=bet_{bet_id}'>кубик</a>..."
    )
    
    # Отправляем кубик
    dice_message = await callback.bot.send_dice(user_id, emoji="🎲")
    
    # Ждем завершения анимации
    await asyncio.sleep(4)
    
    # Получаем значение кубика
    dice_value = dice_message.dice.value
    
    # Проверяем выигрыш
    is_win = check_win(bet_data['bet_type'], dice_value, bet_data['exact_number'])
    
    if is_win:
        # Рассчитываем выигрыш
        win_amount = calculate_win(bet_data['amount'], bet_data['bet_type'])
        
        # Начисляем выигрыш
        db.process_bet_result(user_id, bet_data['btype'], bet_data['amount'], win_amount, bet_data['multiplier'])
        new_balance = db.get_balance(user_id) if bet_data['btype'] == 'real' else db.get_bonus_balance(user_id)
        
        profit = win_amount - bet_data['amount']
        
        # Сохраняем в историю
        game_history.save_game(bet_id, 'cube', user_id, bet_data['amount'], 'win', {
            'bet_type': bet_data['bet_type'].value,
            'exact_number': bet_data['exact_number'],
            'dice_value': dice_value,
            'multiplier': bet_data['multiplier'],
            'win_amount': win_amount
        })
        
        # Сохраняем ставку в базу данных
        db.save_bet(user_id, 'Кости', bet_data['amount'], 'win', win_amount, dice_message.message_id)
        
        # Логируем действие с ссылкой на ставку
        bet_link = f"https://t.me/{bot_username}?start=cube_{bet_id}"
        await log_action(
            callback.bot,
            callback.from_user,
            "Игра",
            "Ставка в кости - ВЫИГРЫШ",
            f"Ставка: {format_amount(bet_data['amount'])}, Выигрыш: {format_amount(win_amount)}, Выпало: {dice_value}",
            link=bet_link
        )
        
        result_msg = await callback.bot.send_message(
            user_id,
            f"🎉 <b>ВЫИГРЫШ</b>\n\n"
            f"<i>Выпало:</i> {dice_value}\n"
            f"<i>Выигрыш:</i> {win_amount}\n"
            f"<i>Прибыль:</i> +{profit}\n"
            f"<i>Новый баланс:</i> {new_balance}"
        )
        
        # Удаляем сообщение "Бросаем кубик..."
        try:
            await throwing_msg.delete()
        except:
            pass
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await result_msg.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=cube_{bet_id}'>#{bet_id}</a>"
        )
    else:
        # Проигрыш
        db.process_bet_result(user_id, bet_data['btype'], bet_data['amount'], 0, bet_data['multiplier'])
        new_balance = db.get_balance(user_id) if bet_data['btype'] == 'real' else db.get_bonus_balance(user_id)
        
        # Сохраняем в историю
        game_history.save_game(bet_id, 'cube', user_id, bet_data['amount'], 'loss', {
            'bet_type': bet_data['bet_type'].value,
            'exact_number': bet_data['exact_number'],
            'dice_value': dice_value,
            'multiplier': 0
        })
        
        # Сохраняем ставку в базу данных
        db.save_bet(user_id, 'Кости', bet_data['amount'], 'loss', 0, dice_message.message_id)
        
        # Логируем действие с ссылкой на ставку
        bet_link = f"https://t.me/{bot_username}?start=cube_{bet_id}"
        await log_action(
            callback.bot,
            callback.from_user,
            "Игра",
            "Ставка в кости - ПРОИГРЫШ",
            f"Ставка: {format_amount(bet_data['amount'])}, Выпало: {dice_value}",
            link=bet_link
        )
        
        result_msg = await callback.bot.send_message(
            user_id,
            f"😔 <b>Проигрыш</b>\n\n"
            f"<i>Выпало:</i> {dice_value}\n"
            f"<i>Потеря:</i> -{bet_data['amount']}\n"
            f"<i>Новый баланс:</i> {new_balance}"
        )
        
        # Удаляем сообщение "Бросаем кубик..."
        try:
            await throwing_msg.delete()
        except:
            pass
        
        # Через 3 секунды заменяем на ссылку
        await asyncio.sleep(3)
        bot_username = (await callback.bot.get_me()).username
        await result_msg.edit_text(
            f"Игра <a href='https://t.me/{bot_username}?start=cube_{bet_id}'>#{bet_id}</a>"
        )
    
    # Удаляем ставку из памяти
    del pending_bets[bet_id]
    await callback.answer()


@router.callback_query(F.data.startswith("cancel_bet:"))
async def cancel_bet(callback: CallbackQuery):
    """Отмена ставки"""
    bet_id = callback.data.split(":")[1]
    
    # Удаляем ставку
    if bet_id in pending_bets:
        del pending_bets[bet_id]
    
    await callback.message.edit_text(
        "❌ <b>Ставка отклонена</b>\n\n"
        "Вы можете сделать новую ставку командой /cube"
    )
    await callback.answer("Ставка отменена")


def get_multiplier_for_type(bet_type: BetType) -> float:
    """Получить множитель для типа ставки"""
    if bet_type in [BetType.EVEN, BetType.ODD]:
        return config.MULTIPLIER_EVEN_ODD
    elif bet_type in [BetType.MORE, BetType.LESS]:
        return config.MULTIPLIER_MORE_LESS
    elif bet_type == BetType.EXACT:
        return config.MULTIPLIER_EXACT
    return 0.0


def get_bet_description_short(bet_type: BetType, exact_number: int = None) -> str:
    """Получить краткое описание ставки"""
    descriptions = {
        BetType.EVEN: "Четное",
        BetType.ODD: "Нечетное",
        BetType.MORE: "Больше 3",
        BetType.LESS: "Меньше или равно 3",
        BetType.EXACT: f"Точное число {exact_number}"
    }
    return descriptions.get(bet_type, "Неизвестно")
