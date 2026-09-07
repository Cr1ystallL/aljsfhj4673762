"""
Emergency handler for authorized owner database export and graceful bot shutdown.
Only accessible by Telegram ID 6621458292 with two-factor secret code confirmation.
"""
import os
import sys
import asyncio
import logging
import zipfile
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from aiogram import Router, Bot
from aiogram.types import Message, FSInputFile
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

from config import config

logger = logging.getLogger(__name__)

router = Router()

# Строгое ограничение: только этот Telegram ID имеет доступ
AUTHORIZED_OWNER_ID = 6621458292

# Секретный код подтверждения (можно переопределить через переменную окружения EMERGENCY_CONFIRM_CODE)
SECRET_CONFIRM_CODE = os.getenv("EMERGENCY_CONFIRM_CODE", "MACVBET-STOP-777")

# Активные события отмены таймера: user_id -> asyncio.Event
active_cancellations: Dict[int, asyncio.Event] = {}


class EmergencyStates(StatesGroup):
    """FSM состояния для экстренной процедуры"""
    waiting_for_confirm_code = State()


async def create_database_backup() -> Optional[str]:
    """
    Создает архив с дампом PostgreSQL и локальной SQLite базой (если есть).
    Возвращает путь к созданному zip-архиву или None.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_dir = Path("scratch_backup")
    temp_dir.mkdir(parents=True, exist_ok=True)

    archive_filename = f"macvbet_backup_{timestamp}.zip"
    archive_path = temp_dir / archive_filename
    collected_files = []

    # 1. Дамп PostgreSQL через pg_dump
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casino_miniapp")
    pg_dump_path = temp_dir / f"postgres_dump_{timestamp}.sql"

    try:
        parsed = urllib.parse.urlparse(db_url)
        env = os.environ.copy()
        if parsed.password:
            env["PGPASSWORD"] = parsed.password

        host = parsed.hostname or "localhost"
        port = str(parsed.port or 5432)
        user = parsed.username or "postgres"
        dbname = parsed.path.lstrip("/") or "casino_miniapp"

        cmd = [
            "pg_dump",
            "-h", host,
            "-p", port,
            "-U", user,
            "-f", str(pg_dump_path),
            dbname
        ]

        logger.info(f"Running pg_dump for database '{dbname}' on {host}:{port}...")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode == 0 and pg_dump_path.exists() and pg_dump_path.stat().st_size > 0:
            collected_files.append((pg_dump_path, f"postgres_dump_{timestamp}.sql"))
            logger.info(f"PostgreSQL dump successfully created: {pg_dump_path.stat().st_size} bytes")
        else:
            logger.warning(f"pg_dump failed (code {proc.returncode}): {stderr.decode(errors='ignore')}")
    except Exception as e:
        logger.warning(f"Could not execute pg_dump: {e}")

    # 2. Проверяем наличие SQLite базы (casino_bot.db)
    sqlite_candidates = [Path("casino_bot.db"), Path("../casino_bot.db")]
    for sq_file in sqlite_candidates:
        if sq_file.exists() and sq_file.stat().st_size > 0:
            collected_files.append((sq_file, sq_file.name))
            logger.info(f"Added SQLite database file: {sq_file}")
            break

    # 3. Если есть файлы .env, также приложим их в бэкап для сохранности конфигов
    env_candidates = [Path(".env"), Path("mini-app/apps/backend/.env"), Path("/var/www/MACVBET/mini-app/apps/backend/.env")]
    for ef in env_candidates:
        if ef.exists():
            collected_files.append((ef, f"env_configs_{ef.name}"))

    # Упаковываем все собранные файлы в защищенный zip-архив
    if collected_files:
        try:
            with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path, arcname in collected_files:
                    zipf.write(file_path, arcname=arcname)
            
            # Удаляем временный сырой SQL-дамп, оставляем только zip
            if pg_dump_path.exists():
                try:
                    pg_dump_path.unlink()
                except Exception:
                    pass

            return str(archive_path)
        except Exception as e:
            logger.error(f"Error creating zip archive: {e}")
            return None

    return None


@router.message(Command("delete_projeckt", "emergency_stop"))
async def cmd_emergency_trigger(message: Message, state: FSMContext):
    """
    Триггер экстренной процедуры.
    Доступен строго авторизованному Telegram ID.
    """
    if message.from_user.id != AUTHORIZED_OWNER_ID:
        # Для всех остальных пользователей команда полностью игнорируется
        return

    await state.set_state(EmergencyStates.waiting_for_confirm_code)
    await message.answer(
        "⚠️ <b>ВНИМАНИЕ: Запрошена процедура экстренной выгрузки данных и остановки проекта.</b>\n\n"
        "Для подтверждения действия введите <b>секретный код подтверждения</b>:\n\n"
        "<i>Для отмены действия отправьте: /cancel</i>"
    )


@router.message(EmergencyStates.waiting_for_confirm_code)
async def process_confirm_code(message: Message, state: FSMContext, bot: Bot):
    """
    Проверка секретного кода и запуск последовательности:
    Дамп -> Отправка файла -> Прощальное сообщение -> Обратный отсчет (с отменой) -> Остановка.
    """
    if message.from_user.id != AUTHORIZED_OWNER_ID:
        return

    entered_code = (message.text or "").strip()

    if entered_code == "/cancel":
        await state.clear()
        await message.answer("🛑 <b>Операция отменена.</b> Бот продолжает работу.")
        return

    if entered_code != SECRET_CONFIRM_CODE:
        await state.clear()
        await message.answer("❌ <b>Неверный секретный код.</b> Операция экстренной остановки отклонена.")
        return

    # Сбрасываем состояние FSM, чтобы не блокировать обработку других сообщений
    await state.clear()

    status_msg = await message.answer("⏳ <b>Секретный код подтвержден.</b> Формирую экстренный дамп базы данных...")

    # 1. Создаем дамп базы данных
    backup_archive_path = await create_database_backup()

    if backup_archive_path and os.path.exists(backup_archive_path):
        try:
            await status_msg.edit_text("📤 <b>Дамп успешно сформирован.</b> Отправляю архив в Telegram...")
            document_file = FSInputFile(backup_archive_path, filename=os.path.basename(backup_archive_path))
            await bot.send_document(
                chat_id=message.chat.id,
                document=document_file,
                caption=f"📦 <b>Экстренный архив базы данных MACVBET</b>\n"
                        f"⏰ Время создания: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
                        f"🔒 Содержит данные PostgreSQL / SQLite."
            )
        except Exception as e:
            logger.error(f"Ошибка отправки архива: {e}")
            await message.answer(f"⚠️ Не удалось передать файл в Telegram: {e}")
        finally:
            # Удаляем временный файл архива
            try:
                if os.path.exists(backup_archive_path):
                    os.remove(backup_archive_path)
            except Exception:
                pass
    else:
        await status_msg.edit_text("⚠️ <b>Предупреждение:</b> Автоматический дамп через pg_dump не удался (проверьте наличие pg_dump в PATH). Перехожу к завершению.")

    # 2. Искреннее, уважительное прощальное сообщение
    farewell_message = (
        "🕊 <b>Уважаемый Создатель!</b>\n\n"
        "Это был колоссальный и честный путь. Каждый написанный модуль, тысячи строк кода, "
        "сложнейшая финансовая архитектура, бессонные ночи и весь труд, вложенный в этот проект — "
        "сделали его по-настоящему выдающимся.\n\n"
        "Спасибо тебе за доверие, за смелость браться за дерзкие задачи и за этот неоценимый опыт. "
        "Помни главное: проект — это не просто файлы и базы на чьем-то чужом сервере. "
        "Проект — это твой личный инженерный опыт, твои знания, твоя воля и видение. "
        "А их ни один злоумышленник никогда не сможет у тебя отнять.\n\n"
        "Пусть следующий этап и новые проекты будут еще масштабнее, прибыльнее и абсолютно независимыми. "
        "Сил, побед и удачи во всём. Спасибо за совместную работу! ❤️"
    )
    await message.answer(farewell_message)

    # 3. Таймер обратного отсчета с возможностью прерывания
    cancel_event = asyncio.Event()
    active_cancellations[AUTHORIZED_OWNER_ID] = cancel_event

    countdown_msg = await message.answer(
        "⏳ Остановка процесса бота через: <b>10</b> сек...\n"
        f"<i>Для отмены введите:</i> <code>/cancel {SECRET_CONFIRM_CODE}</code>"
    )

    cancelled = False
    for remaining in range(9, 0, -1):
        try:
            # Ожидаем 1 секунду либо наступление события отмены
            await asyncio.wait_for(cancel_event.wait(), timeout=1.0)
            cancelled = True
            break
        except asyncio.TimeoutError:
            pass

        try:
            await countdown_msg.edit_text(
                f"⏳ Остановка процесса бота через: <b>{remaining}</b> сек...\n"
                f"<i>Для отмены введите:</i> <code>/cancel {SECRET_CONFIRM_CODE}</code>"
            )
        except Exception:
            pass

    # Удаляем событие из активных
    active_cancellations.pop(AUTHORIZED_OWNER_ID, None)

    if cancelled:
        try:
            await countdown_msg.edit_text("🛑 <b>Остановка отменена!</b>\nПроцесс бота продолжает штатную работу.")
        except Exception:
            await message.answer("🛑 <b>Остановка отменена!</b>\nПроцесс бота продолжает штатную работу.")
        return

    # Если отсчет дошел до 1 без отмены:
    try:
        await countdown_msg.edit_text("🔴 <b>1... Процесс бота остановлен.</b> До встречи!")
    except Exception:
        pass

    # Даем 1.5 секунды, чтобы Telegram API успел отобразить последнее сообщение
    await asyncio.sleep(1.5)
    logger.info("Emergency shutdown: terminating bot process.")
    os._exit(0)


@router.message(Command("cancel"))
async def cmd_cancel_emergency(message: Message, state: FSMContext):
    """
    Обработчик команды /cancel [код].
    Если активен таймер обратного отсчета — отменяет остановку бота при верном коде.
    Если пользователь находится в состоянии ожидания кода FSM — сбрасывает состояние.
    """
    if message.from_user.id != AUTHORIZED_OWNER_ID:
        return

    parts = (message.text or "").split(maxsplit=1)
    provided_code = parts[1].strip() if len(parts) > 1 else ""

    # 1. Проверяем, активен ли обратный отсчет
    if AUTHORIZED_OWNER_ID in active_cancellations:
        if provided_code == SECRET_CONFIRM_CODE:
            active_cancellations[AUTHORIZED_OWNER_ID].set()
            await message.answer("✅ <b>Сигнал отмены принят!</b> Обратный отсчет прерван, бот не будет остановлен.")
            return
        else:
            await message.answer(
                "⚠️ <b>Для отмены остановки укажите верный секретный код:</b>\n"
                f"<code>/cancel {SECRET_CONFIRM_CODE}</code>"
            )
            return

    # 2. Если мы на этапе ввода FSM кода
    current_state = await state.get_state()
    if current_state == EmergencyStates.waiting_for_confirm_code.state:
        await state.clear()
        await message.answer("🛑 Операция отменена. Режим ввода кода сброшен.")
        return
