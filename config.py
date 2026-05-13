"""
Конфигурация бота из переменных окружения
"""
import os
from typing import List
from dotenv import load_dotenv

# Загружаем переменные из .env файла
load_dotenv()


class Config:
    """Класс конфигурации бота"""
    
    # Токен бота (обязательный)
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
    
    # Начальный баланс для новых пользователей
    INITIAL_BALANCE: float = 0
    
    # Сумма бонуса по команде /givemoney
    BONUS_AMOUNT: float = float(os.getenv("BONUS_AMOUNT", "1000"))
    
    # Множители выигрыша
    MULTIPLIER_EVEN_ODD: float = float(os.getenv("MULTIPLIER_EVEN_ODD", "1.9"))
    MULTIPLIER_MORE_LESS: float = float(os.getenv("MULTIPLIER_MORE_LESS", "1.9"))
    MULTIPLIER_EXACT: float = float(os.getenv("MULTIPLIER_EXACT", "5.4"))
    
    # Минимальная и максимальная ставка
    MIN_BET: float = float(os.getenv("MIN_BET", "1"))
    MAX_BET: float = float(os.getenv("MAX_BET", "10000"))
    
    # CryptoPay токен
    CRYPTOPAY_TOKEN: str = os.getenv("CRYPTOPAY_TOKEN", "")
    
    # Использовать ли тестовую сеть CryptoPay
    CRYPTOPAY_TESTNET: bool = os.getenv("CRYPTOPAY_TESTNET", "False").lower() in ("true", "1", "yes")
    
    # ID группы для заявок на вывод
    WITHDRAWAL_GROUP_ID: int = int(os.getenv("WITHDRAWAL_GROUP_ID", "0") or "0")
    
    # ID администраторов
    ADMIN_IDS: List[int] = [
        int(admin_id.strip()) 
        for admin_id in os.getenv("ADMIN_IDS", "").split(",") 
        if admin_id.strip()
    ]
    
    @classmethod
    def validate(cls) -> None:
        """Проверить корректность конфигурации"""
        if not cls.BOT_TOKEN:
            raise ValueError(
                "BOT_TOKEN не установлен! "
                "Создайте файл .env и добавьте BOT_TOKEN=ваш_токен"
            )
        
        if cls.INITIAL_BALANCE < 0:
            raise ValueError("INITIAL_BALANCE должен быть положительным числом")
        
        if cls.MIN_BET <= 0:
            raise ValueError("MIN_BET должен быть больше 0")
        
        if cls.MAX_BET < cls.MIN_BET:
            raise ValueError("MAX_BET должен быть больше или равен MIN_BET")


# Создаем экземпляр конфигурации
config = Config()
