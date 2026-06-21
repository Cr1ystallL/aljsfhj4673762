"""
MacvBet Telegram Bot - Точка входа
Бот для игры в кубики с использованием aiogram 3.x
"""
import asyncio
import logging
import sys
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage

from handlers import basic, dice, bowling, darts, basketball, football, mines, rps, spider, payment, admin, referral
from config import config
from middleware import UserActivityMiddleware

# Make `scripts/` importable so the broadcast worker can be loaded.
sys.path.append(str(Path(__file__).resolve().parent / "scripts"))

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Главная функция запуска бота"""
    try:
        # Проверяем конфигурацию
        config.validate()
    except ValueError as e:
        logger.error(f"Ошибка конфигурации: {e}")
        return
    
    # Инициализация бота и диспетчера
    bot = Bot(
        token=config.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    storage = MemoryStorage()
    dp = Dispatcher(storage=storage)
    
    # Регистрация middleware
    dp.message.middleware(UserActivityMiddleware())
    dp.callback_query.middleware(UserActivityMiddleware())
    
    # Регистрация роутеров
    dp.include_router(admin.router)
    dp.include_router(payment.router)
    dp.include_router(dice.router)
    dp.include_router(bowling.router)
    dp.include_router(darts.router)
    dp.include_router(basketball.router)
    dp.include_router(football.router)
    dp.include_router(mines.router)
    dp.include_router(rps.router)
    dp.include_router(spider.router)
    dp.include_router(referral.router)
    from handlers import wheel
    dp.include_router(wheel.router)
    dp.include_router(basic.router)
    
    logger.info("Бот запущен")
    logger.info(f"Начальный баланс: {config.INITIAL_BALANCE}")
    logger.info(f"Диапазон ставок: {config.MIN_BET} - {config.MAX_BET}")
    
    # Восстановление таймеров вывода
    await payment.restore_pending_withdrawals(bot)

    # Запуск broadcast-воркера фоном — раз в 10 секунд проверяет
    # таблицу `broadcasts` на запланированные рассылки.
    try:
        from broadcast_worker import broadcast_worker_loop
        asyncio.create_task(broadcast_worker_loop(bot))
        logger.info("Broadcast worker scheduled")
    except Exception as e:
        logger.warning(f"Broadcast worker did not start: {e}")

    # Запуск polling
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
