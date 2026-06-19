"""
Обработчик админ-панели
"""
import secrets
import os
import asyncio
from datetime import datetime
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, FSInputFile
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from database.db import db
from config import config
from keyboards.inline import get_admin_panel_keyboard, get_player_management_keyboard
from utils.logger import log_action
from locales.translations import format_amount
from middleware import check_is_admin

router = Router()

# Хранилище callback префиксов для каждого админа
admin_callbacks = {}


class AdminStates(StatesGroup):
    """Состояния для админ-панели"""
    waiting_for_player_id = State()
    waiting_for_balance_change = State()
    waiting_for_bonus_amount = State()
    waiting_for_spam_message = State()


def get_admin_callback_prefix(admin_id: int) -> str:
    """
    Получить или создать уникальный префикс callback для админа
    
    Args:
        admin_id: ID администратора
        
    Returns:
        Уникальный префикс
    """
    if admin_id not in admin_callbacks:
        admin_callbacks[admin_id] = secrets.token_hex(8)
    return admin_callbacks[admin_id]


def regenerate_admin_callback(admin_id: int) -> str:
    """
    Сгенерировать новый префикс callback для админа
    
    Args:
        admin_id: ID администратора
        
    Returns:
        Новый уникальный префикс
    """
    admin_callbacks[admin_id] = secrets.token_hex(8)
    return admin_callbacks[admin_id]


@router.message(Command("spam"))
async def spam_command(message: Message, state: FSMContext):
    if message.chat.id != config.WITHDRAWAL_GROUP_ID:
        return
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    msg = await message.answer(
        "Отправьте сообщение для рассылки (сохраняются фото, видео, гифки и форматирование текста HTML).\n"
        "Отправьте его <b>ОТВЕТОМ</b> на это сообщение.\n\n"
        "Вы можете вставить в конец описания/текста строку:\n"
        "<code>{butn:{Текст}{Ссылка (или оставьте пустым для просто кнопки)}}</code>\n"
        "Она будет удалена из текста и преобразована в инлайн-кнопку."
    )
    await state.set_state(AdminStates.waiting_for_spam_message)
    await state.update_data(spam_request_msg_id=msg.message_id)


import re
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
import asyncio

@router.message(AdminStates.waiting_for_spam_message)
async def process_spam_message(message: Message, state: FSMContext):
    if message.chat.id != config.WITHDRAWAL_GROUP_ID:
        return
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    data = await state.get_data()
    req_msg_id = data.get('spam_request_msg_id')
    
    # Требуем, чтобы это было ответом на наше сообщение
    if not message.reply_to_message or message.reply_to_message.message_id != req_msg_id:
        return

    # Текст сообщения без форматирования Aiogram, чтобы работали сырые HTML-теги
    text = message.text or message.caption or ""
    markup = message.reply_markup

    # Пробуем распарсить кнопку {butn:...}
    match = re.search(r'\{butn:\{(.*?)\}\{(.*?)\}\}\s*$', text)
    if match:
        # Убираем строку кнопки из текста
        text = text[:match.start()].strip()
        
        btn_text = match.group(1)
        btn_url = match.group(2)
        
        if btn_url:
            kb = [[InlineKeyboardButton(text=btn_text, url=btn_url)]]
        else:
            kb = [[InlineKeyboardButton(text=btn_text, callback_data="dummy_btn")]]
        markup = InlineKeyboardMarkup(inline_keyboard=kb)

    # Предпросмотр в группе
    try:
        if message.photo:
            await message.bot.send_photo(chat_id=message.chat.id, photo=message.photo[-1].file_id, caption=text, reply_markup=markup, parse_mode="HTML")
        elif message.video:
            await message.bot.send_video(chat_id=message.chat.id, video=message.video.file_id, caption=text, reply_markup=markup, parse_mode="HTML")
        elif message.animation:
            await message.bot.send_animation(chat_id=message.chat.id, animation=message.animation.file_id, caption=text, reply_markup=markup, parse_mode="HTML")
        else:
            await message.bot.send_message(chat_id=message.chat.id, text=text, reply_markup=markup, parse_mode="HTML")
    except Exception as e:
        await message.reply(f"❌ <b>Ошибка при формировании сообщения!</b> Проверьте правильность HTML тегов.\n<code>{str(e)}</code>")
        return

    # Сохраняем данные для рассылки
    await state.update_data(
        spam_text=text,
        spam_photo=message.photo[-1].file_id if message.photo else None,
        spam_video=message.video.file_id if message.video else None,
        spam_animation=message.animation.file_id if message.animation else None,
        spam_markup_dict=markup.model_dump() if markup else None
    )

    # Кнопки подтверждения
    confirm_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Начать рассылку", callback_data="confirm_spam")],
        [InlineKeyboardButton(text="❌ Отменить", callback_data="cancel_spam")]
    ])
    await message.bot.send_message(message.chat.id, "Предпросмотр сообщения показан выше ☝️\nХотите запустить рассылку для всех пользователей?", reply_markup=confirm_kb)


@router.callback_query(F.data.in_(["confirm_spam", "cancel_spam"]))
async def spam_control_callback(callback: CallbackQuery, state: FSMContext):
    if callback.from_user.id not in config.ADMIN_IDS:
        await callback.answer("Нет доступа", show_alert=True)
        return

    if callback.data == "cancel_spam":
        await state.clear()
        await callback.message.edit_text("❌ <b>Рассылка отменена.</b>", reply_markup=None)
        await callback.answer()
        return

    data = await state.get_data()
    text = data.get('spam_text', '')
    photo = data.get('spam_photo')
    video = data.get('spam_video')
    animation = data.get('spam_animation')
    markup_dict = data.get('spam_markup_dict')

    markup = InlineKeyboardMarkup(**markup_dict) if markup_dict else None

    await state.clear()
    await callback.message.edit_text("⏳ <b>Рассылка запущена... Это может занять некоторое время.</b>", reply_markup=None)

    async def send_broadcast(user_id):
        try:
            if photo:
                await callback.bot.send_photo(chat_id=user_id, photo=photo, caption=text, reply_markup=markup, parse_mode="HTML")
            elif video:
                await callback.bot.send_video(chat_id=user_id, video=video, caption=text, reply_markup=markup, parse_mode="HTML")
            elif animation:
                await callback.bot.send_animation(chat_id=user_id, animation=animation, caption=text, reply_markup=markup, parse_mode="HTML")
            else:
                await callback.bot.send_message(chat_id=user_id, text=text, reply_markup=markup, parse_mode="HTML")
            return True
        except Exception:
            return False

    success_count = 0
    all_users = db.get_all_users()

    for uid_tuple in all_users:
        uid = uid_tuple[0]
        if await send_broadcast(uid):
            success_count += 1
        await asyncio.sleep(0.05)

    await callback.message.edit_text(
        f"✅ <b>Рассылка завершена!</b>\nУспешно отправлено: <b>{success_count}</b> пользователям.",
        reply_markup=None,
    )



@router.message(Command("admin"))
async def admin_command(message: Message, state: FSMContext):
    """Обработчик команды /admin"""
    # Проверяем, что команда отправлена в группе вывода
    if message.chat.id != config.WITHDRAWAL_GROUP_ID:
        return
    
    # Проверяем, что пользователь является админом
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    # Удаляем команду из группы
    try:
        await message.delete()
    except:
        pass
    
    # Получаем статистику
    total_users = db.get_total_users_count()
    online_users = db.get_online_users_count(minutes=10)
    
    # Генерируем уникальный префикс для этого админа
    callback_prefix = get_admin_callback_prefix(message.from_user.id)
    
    # Формируем сообщение
    text = (
        f"<b>Админ панель:</b>\n\n"
        f"<b>Кол-во пользователей:</b> {total_users}\n"
        f"<b>Кол-во онлайн:</b> {online_users}\n\n"
        f"<i>Статус работы:</i> <code>Стабильно</code>"
    )
    
    # Отправляем админу в ЛС
    try:
        await message.bot.send_message(
            chat_id=message.from_user.id,
            text=text,
            reply_markup=get_admin_panel_keyboard(callback_prefix)
        )
    except Exception as e:
        # Если не удалось отправить в ЛС (пользователь не начал диалог с ботом)
        pass


@router.callback_query(F.data.startswith("admin_"))
async def admin_callback_handler(callback: CallbackQuery, state: FSMContext):
    """Обработчик callback кнопок админ-панели"""
    # Проверяем, что пользователь является админом
    if callback.from_user.id not in config.ADMIN_IDS:
        await callback.answer("У вас нет доступа к админ-панели", show_alert=True)
        return
    
    # Получаем префикс админа
    callback_prefix = get_admin_callback_prefix(callback.from_user.id)
    
    # Проверяем, что callback принадлежит этому админу
    if not callback.data.startswith(f"admin_{callback_prefix}_"):
        await callback.answer("Эта панель устарела", show_alert=True)
        return
    
    # Извлекаем действие
    action = callback.data.replace(f"admin_{callback_prefix}_", "")
    
    if action == "close":
        # Закрываем панель и регенерируем callback
        regenerate_admin_callback(callback.from_user.id)
        await callback.message.delete()
        await callback.answer()
        
    elif action == "players_list":
        # Генерируем файл со списком игроков
        await callback.answer("Генерирую список игроков...")
        
        users = db.get_all_users()
        
        # Создаем временный файл
        filename = f"players_{callback.from_user.id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        with open(filename, 'w', encoding='utf-8') as f:
            for idx, user in enumerate(users, 1):
                user_id, username, first_name, balance, turnover = user
                name = first_name or "Без имени"
                username_str = f"@{username}" if username else "Нет username"
                f.write(f"{idx}. {name} | {username_str} | ID: {user_id} | Баланс: {balance:.2f} | Оборот: {turnover:.2f}\n")
        
        # Удаляем старое сообщение
        await callback.message.delete()
        
        # Отправляем файл
        from aiogram.types import FSInputFile
        file = FSInputFile(filename)
        await callback.message.answer_document(
            document=file,
            caption=f"📊 Список игроков ({len(users)} чел.)"
        )
        
        # Удаляем временный файл
        os.remove(filename)
        
        # Отправляем панель заново
        total_users = db.get_total_users_count()
        online_users = db.get_online_users_count(minutes=10)
        
        text = (
            f"<b>Админ панель:</b>\n\n"
            f"<b>Кол-во пользователей:</b> {total_users}\n"
            f"<b>Кол-во онлайн:</b> {online_users}\n\n"
            f"<i>Статус работы:</i> <code>Стабильно</code>"
        )
        
        await callback.message.answer(
            text=text,
            reply_markup=get_admin_panel_keyboard(callback_prefix)
        )


    elif action == "manage_player":
        # Запрашиваем ID игрока
        await state.set_state(AdminStates.waiting_for_player_id)
        await state.update_data(admin_callback_prefix=callback_prefix)
        
        await callback.message.edit_text(
            "Отправьте Telegram ID игрока:",
            reply_markup=None
        )
        await callback.answer()
    
    elif action.startswith("change_balance_"):
        # Изменение баланса игрока
        player_id = int(action.split("_")[-1])
        
        await state.set_state(AdminStates.waiting_for_balance_change)
        await state.update_data(
            player_id=player_id,
            admin_callback_prefix=callback_prefix,
            message_id=callback.message.message_id
        )
        
        await callback.message.edit_text(
            "Отправьте сумму для изменения баланса:\n"
            "(положительное число для пополнения, отрицательное для списания)",
            reply_markup=None
        )
        await callback.answer()
    
    elif action.startswith("give_bonus_"):
        # Выдача бонуса игроку
        player_id = int(action.split("_")[-1])
        
        await state.set_state(AdminStates.waiting_for_bonus_amount)
        await state.update_data(
            player_id=player_id,
            admin_callback_prefix=callback_prefix,
            message_id=callback.message.message_id
        )
        
        await callback.message.edit_text(
            "Отправьте сумму бонуса для начисления на бонусный баланс:",
            reply_markup=None
        )
        await callback.answer()
    
    elif action.startswith("block_user_"):
        # Блокировка пользователя
        player_id = int(action.split("_")[-1])
        db.block_user(player_id)
        
        # Логируем действие
        await log_action(
            callback.bot,
            callback.from_user,
            "Админ-панель",
            "Блокировка пользователя",
            f"ID игрока: {player_id}"
        )
        
        # Обновляем информацию об игроке
        user_info = db.get_user_info(player_id)
        last_bet = db.get_last_bet(player_id)
        
        name = user_info['first_name'] or "Без имени"
        username_str = f"@{user_info['username']}" if user_info['username'] else "Нет username"
        is_blocked = True
        
        text = (
            f"<b>Информация об игроке:</b>\n\n"
            f"<b>Имя:</b> {name}\n"
            f"<b>Username:</b> {username_str}\n"
            f"<b>ID:</b> <code>{user_info['user_id']}</code>\n"
            f"<b>Статус:</b> 🔒 Заблокирован\n"
            f"<b>Баланс:</b> {format_amount(user_info['balance'])}\n"
            f"<b>Бонусный баланс:</b> {format_amount(user_info['bonus_balance'])}\n"
            f"<b>Оборот:</b> {format_amount(user_info['turnover'])}\n"
        )
        
        if last_bet:
            result_emoji = "✅" if last_bet['result'] == 'win' else "❌"
            text += (
                f"\n<b>Последняя ставка:</b>\n"
                f"{result_emoji} {last_bet['game_type']} | Ставка: {format_amount(last_bet['bet_amount'])}"
            )
            if last_bet['message_id']:
                text += f" | <a href='https://t.me/c/{str(config.WITHDRAWAL_GROUP_ID)[4:]}/{last_bet['message_id']}'>Ссылка</a>"
        
        text += f"\n\n<b>Оборот игрока:</b> {format_amount(user_info['turnover'])}"
        
        await callback.message.edit_text(
            text=text,
            reply_markup=get_player_management_keyboard(callback_prefix, player_id, is_blocked)
        )
        await callback.answer("✅ Пользователь заблокирован")
    
    elif action.startswith("unblock_user_"):
        # Разблокировка пользователя
        player_id = int(action.split("_")[-1])
        db.unblock_user(player_id)
        
        # Логируем действие
        await log_action(
            callback.bot,
            callback.from_user,
            "Админ-панель",
            "Разблокировка пользователя",
            f"ID игрока: {player_id}"
        )
        
        # Обновляем информацию об игроке
        user_info = db.get_user_info(player_id)
        last_bet = db.get_last_bet(player_id)
        
        name = user_info['first_name'] or "Без имени"
        username_str = f"@{user_info['username']}" if user_info['username'] else "Нет username"
        is_blocked = False
        
        text = (
            f"<b>Информация об игроке:</b>\n\n"
            f"<b>Имя:</b> {name}\n"
            f"<b>Username:</b> {username_str}\n"
            f"<b>ID:</b> <code>{user_info['user_id']}</code>\n"
            f"<b>Статус:</b> 🔓 Активен\n"
            f"<b>Баланс:</b> {format_amount(user_info['balance'])}\n"
            f"<b>Бонусный баланс:</b> {format_amount(user_info['bonus_balance'])}\n"
            f"<b>Оборот:</b> {format_amount(user_info['turnover'])}\n"
        )
        
        if last_bet:
            result_emoji = "✅" if last_bet['result'] == 'win' else "❌"
            text += (
                f"\n<b>Последняя ставка:</b>\n"
                f"{result_emoji} {last_bet['game_type']} | Ставка: {format_amount(last_bet['bet_amount'])}"
            )
            if last_bet['message_id']:
                text += f" | <a href='https://t.me/c/{str(config.WITHDRAWAL_GROUP_ID)[4:]}/{last_bet['message_id']}'>Ссылка</a>"
        
        text += f"\n\n<b>Оборот игрока:</b> {format_amount(user_info['turnover'])}"
        
        await callback.message.edit_text(
            text=text,
            reply_markup=get_player_management_keyboard(callback_prefix, player_id, is_blocked)
        )
        await callback.answer("✅ Пользователь разблокирован")
    
    elif action == "back_to_admin":
        # Возврат к главной панели
        total_users = db.get_total_users_count()
        online_users = db.get_online_users_count(minutes=10)
        
        text = (
            f"<b>Админ панель:</b>\n\n"
            f"<b>Кол-во пользователей:</b> {total_users}\n"
            f"<b>Кол-во онлайн:</b> {online_users}\n\n"
            f"<i>Статус работы:</i> <code>Стабильно</code>"
        )
        
        await callback.message.edit_text(
            text=text,
            reply_markup=get_admin_panel_keyboard(callback_prefix)
        )
        await callback.answer()
        await state.clear()


@router.message(AdminStates.waiting_for_player_id)
async def process_player_id(message: Message, state: FSMContext):
    """Обработка ввода ID игрока"""
    # Проверяем, что пользователь является админом
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    try:
        player_id = int(message.text.strip())
    except ValueError:
        await message.answer("❌ Неверный формат ID. Отправьте числовой ID.")
        return
    
    # Получаем информацию об игроке
    user_info = db.get_user_info(player_id)
    
    if not user_info:
        await message.answer("❌ Игрок не найден в базе данных.")
        return
    
    # Получаем последнюю ставку
    last_bet = db.get_last_bet(player_id)
    
    # Формируем сообщение
    name = user_info['first_name'] or "Без имени"
    username = f"@{user_info['username']}" if user_info['username'] else "Нет username"
    is_blocked = db.is_user_blocked(player_id)
    block_status = "🔒 Заблокирован" if is_blocked else "🔓 Активен"
    
    text = (
        f"<b>Информация об игроке:</b>\n\n"
        f"<b>Имя:</b> {name}\n"
        f"<b>Username:</b> {username}\n"
        f"<b>ID:</b> <code>{user_info['user_id']}</code>\n"
        f"<b>Статус:</b> {block_status}\n"
        f"<b>Баланс:</b> {format_amount(user_info['balance'])}\n"
        f"<b>Бонусный баланс:</b> {format_amount(user_info['bonus_balance'])}\n"
        f"<b>Оборот:</b> {format_amount(user_info['turnover'])}\n"
    )
    
    if last_bet:
        bet_time = last_bet['timestamp']
        result_emoji = "✅" if last_bet['result'] == 'win' else "❌"
        text += (
            f"\n<b>Последняя ставка:</b>\n"
            f"{result_emoji} {last_bet['game_type']} | Ставка: {format_amount(last_bet['bet_amount'])}"
        )
        if last_bet['message_id']:
            # Создаем ссылку на сообщение (если это было в группе)
            text += f" | <a href='https://t.me/c/{str(config.WITHDRAWAL_GROUP_ID)[4:]}/{last_bet['message_id']}'>Ссылка</a>"
    
    text += f"\n\n<b>Оборот игрока:</b> {format_amount(user_info['turnover'])}"
    
    # Удаляем сообщение с ID
    await message.delete()
    
    # Получаем данные из состояния
    data = await state.get_data()
    callback_prefix = data.get('admin_callback_prefix')
    
    # Отправляем информацию с кнопками управления
    await message.answer(
        text=text,
        reply_markup=get_player_management_keyboard(callback_prefix, player_id, is_blocked)
    )
    
    # Логируем действие
    await log_action(
        message.bot,
        message.from_user,
        "Админ-панель",
        "Просмотр информации об игроке",
        f"ID игрока: {player_id}"
    )
    
    # Очищаем только состояние, но оставляем данные
    await state.clear()


@router.message(AdminStates.waiting_for_balance_change)
async def process_balance_change(message: Message, state: FSMContext):
    """Обработка изменения баланса"""
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    try:
        amount = float(message.text.strip())
    except ValueError:
        await message.answer("❌ Неверный формат суммы. Отправьте число.")
        return
    
    data = await state.get_data()
    player_id = data['player_id']
    callback_prefix = data['admin_callback_prefix']
    request_message_id = data.get('message_id')
    
    # Изменяем баланс
    old_balance = db.get_balance(player_id)
    db.add_balance(player_id, amount)
    new_balance = db.get_balance(player_id)
    
    # Удаляем сообщение с суммой
    await message.delete()
    
    # Удаляем сообщение с запросом
    if request_message_id:
        try:
            await message.bot.delete_message(
                chat_id=message.chat.id,
                message_id=request_message_id
            )
        except:
            pass
    
    # Логируем действие
    await log_action(
        message.bot,
        message.from_user,
        "Админ-панель",
        "Изменение баланса игрока",
        f"ID игрока: {player_id}, Изменение: {'+' if amount > 0 else ''}{format_amount(amount)}, Было: {format_amount(old_balance)}, Стало: {format_amount(new_balance)}"
    )
    
    # Получаем обновленную информацию об игроке
    user_info = db.get_user_info(player_id)
    last_bet = db.get_last_bet(player_id)
    is_blocked = db.is_user_blocked(player_id)
    
    name = user_info['first_name'] or "Без имени"
    username = f"@{user_info['username']}" if user_info['username'] else "Нет username"
    block_status = "🔒 Заблокирован" if is_blocked else "🔓 Активен"
    
    text = (
        f"<b>Информация об игроке:</b>\n\n"
        f"<b>Имя:</b> {name}\n"
        f"<b>Username:</b> {username}\n"
        f"<b>ID:</b> <code>{user_info['user_id']}</code>\n"
        f"<b>Статус:</b> {block_status}\n"
        f"<b>Баланс:</b> {format_amount(user_info['balance'])}\n"
        f"<b>Бонусный баланс:</b> {format_amount(user_info['bonus_balance'])}\n"
        f"<b>Оборот:</b> {format_amount(user_info['turnover'])}\n"
    )
    
    if last_bet:
        result_emoji = "✅" if last_bet['result'] == 'win' else "❌"
        text += (
            f"\n<b>Последняя ставка:</b>\n"
            f"{result_emoji} {last_bet['game_type']} | Ставка: {format_amount(last_bet['bet_amount'])}"
        )
        if last_bet['message_id']:
            text += f" | <a href='https://t.me/c/{str(config.WITHDRAWAL_GROUP_ID)[4:]}/{last_bet['message_id']}'>Ссылка</a>"
    
    text += f"\n\n<b>Оборот игрока:</b> {format_amount(user_info['turnover'])}"
    
    # Отправляем обновленную панель
    await message.answer(
        text=text,
        reply_markup=get_player_management_keyboard(callback_prefix, player_id, is_blocked)
    )
    
    await state.clear()


# ------------------------------------------------------------
# /dbdump — только для админов
@router.message(Command("dbdump"))
async def dbdump_command(message: Message):
    if not await check_is_admin(message.from_user.id):
        await message.answer("⛔ Нет доступа")
        return

    await message.answer("⏳ Формирую дамп базы…")

    dump_path = f"/tmp/dbdump_{message.from_user.id}_{int(datetime.now().timestamp())}.dump"
    # Запускаем pg_dump внутри контейнера базы данных, а результат сохраняем на хост
    cmd = f"docker exec -i casino-postgres pg_dump --dbname={os.getenv('DATABASE_URL', '')} --format=custom > {dump_path}"

    proc = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        await message.answer("❌ Не удалось создать дамп.\n" + (stderr.decode()[:400] if stderr else ""))
        return

    try:
        file = FSInputFile(dump_path)
        await message.answer_document(file, caption="📦 Дамп БД")
    except Exception as e:
        await message.answer(f"❌ Ошибка отправки файла: {e}")
    finally:
        try:
            os.remove(dump_path)
        except Exception:
            pass


@router.message(AdminStates.waiting_for_bonus_amount)
async def process_bonus_amount(message: Message, state: FSMContext):
    """Обработка выдачи бонуса"""
    if message.from_user.id not in config.ADMIN_IDS:
        return
    
    try:
        amount = float(message.text.strip())
        if amount <= 0:
            raise ValueError()
    except ValueError:
        await message.answer("❌ Неверный формат суммы. Отправьте положительное число.")
        return
    
    data = await state.get_data()
    player_id = data['player_id']
    callback_prefix = data['admin_callback_prefix']
    request_message_id = data.get('message_id')
    
    # Начисляем бонус с вейджером
    old_bonus = db.get_bonus_balance(player_id)
    db.set_bonus_wager(player_id, amount)
    new_bonus = db.get_bonus_balance(player_id)
    
    # Отправляем уведомление игроку напрямую
    try:
        await message.bot.send_message(
            chat_id=player_id,
            text=f"🎁 <b>Вам начислен бонус!</b>\n\nВаш бонусный баланс пополнен на: <b>+{format_amount(amount)}</b>"
        )
    except Exception:
        pass  # Игрок мог заблокировать бота
    
    # Удаляем сообщение с суммой
    await message.delete()
    
    # Удаляем сообщение с запросом
    if request_message_id:
        try:
            await message.bot.delete_message(
                chat_id=message.chat.id,
                message_id=request_message_id
            )
        except:
            pass
    
    # Логируем действие
    await log_action(
        message.bot,
        message.from_user,
        "Админ-панель",
        "Выдача бонуса игроку",
        f"ID игрока: {player_id}, Сумма: {format_amount(amount)}, Было: {format_amount(old_bonus)}, Стало: {format_amount(new_bonus)}"
    )
    
    # Отправляем уведомление
    notification = await message.answer(f"✅ Бонус {format_amount(amount)} успешно начислен!")
    
    # Ждем 2 секунды и удаляем уведомление
    import asyncio
    await asyncio.sleep(2)
    await notification.delete()
    
    # Получаем обновленную информацию об игроке
    user_info = db.get_user_info(player_id)
    last_bet = db.get_last_bet(player_id)
    is_blocked = db.is_user_blocked(player_id)
    
    name = user_info['first_name'] or "Без имени"
    username = f"@{user_info['username']}" if user_info['username'] else "Нет username"
    block_status = "🔒 Заблокирован" if is_blocked else "🔓 Активен"
    
    text = (
        f"<b>Информация об игроке:</b>\n\n"
        f"<b>Имя:</b> {name}\n"
        f"<b>Username:</b> {username}\n"
        f"<b>ID:</b> <code>{user_info['user_id']}</code>\n"
        f"<b>Статус:</b> {block_status}\n"
        f"<b>Баланс:</b> {format_amount(user_info['balance'])}\n"
        f"<b>Бонусный баланс:</b> {format_amount(user_info['bonus_balance'])}\n"
        f"<b>Оборот:</b> {format_amount(user_info['turnover'])}\n"
    )
    
    if last_bet:
        result_emoji = "✅" if last_bet['result'] == 'win' else "❌"
        text += (
            f"\n<b>Последняя ставка:</b>\n"
            f"{result_emoji} {last_bet['game_type']} | Ставка: {format_amount(last_bet['bet_amount'])}"
        )
        if last_bet['message_id']:
            text += f" | <a href='https://t.me/c/{str(config.WITHDRAWAL_GROUP_ID)[4:]}/{last_bet['message_id']}'>Ссылка</a>"
    
    text += f"\n\n<b>Оборот игрока:</b> {format_amount(user_info['turnover'])}"
    
    # Отправляем обновленную панель
    await message.answer(
        text=text,
        reply_markup=get_player_management_keyboard(callback_prefix, player_id, is_blocked)
    )
    
    await state.clear()
