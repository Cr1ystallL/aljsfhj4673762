"""
Логика расчета выигрышей и проверки ставок
"""
from enum import Enum
from typing import Optional
from config import config


class BetType(Enum):
    """Типы ставок в игре"""
    EVEN = "even"  # Четное
    ODD = "odd"  # Нечетное
    MORE = "more"  # Больше 3.5
    LESS = "less"  # Меньше 3.5
    EXACT = "exact"  # Точное число


def get_multipliers() -> dict:
    """Получить множители выигрыша из конфигурации"""
    return {
        BetType.EVEN: config.MULTIPLIER_EVEN_ODD,
        BetType.ODD: config.MULTIPLIER_EVEN_ODD,
        BetType.MORE: config.MULTIPLIER_MORE_LESS,
        BetType.LESS: config.MULTIPLIER_MORE_LESS,
        BetType.EXACT: config.MULTIPLIER_EXACT
    }


def check_win(bet_type: BetType, dice_value: int, exact_number: Optional[int] = None) -> bool:
    """
    Проверить, выиграла ли ставка
    
    Args:
        bet_type: Тип ставки
        dice_value: Значение выпавшего кубика (1-6)
        exact_number: Точное число для ставки типа EXACT
        
    Returns:
        True если ставка выиграла, иначе False
    """
    if bet_type == BetType.EVEN:
        return dice_value % 2 == 0
    
    elif bet_type == BetType.ODD:
        return dice_value % 2 == 1
    
    elif bet_type == BetType.MORE:
        return dice_value > 3
    
    elif bet_type == BetType.LESS:
        return dice_value <= 3
    
    elif bet_type == BetType.EXACT:
        if exact_number is None:
            return False
        return dice_value == exact_number
    
    return False


def calculate_win(bet_amount: float, bet_type: BetType) -> float:
    """
    Рассчитать сумму выигрыша
    
    Args:
        bet_amount: Размер ставки
        bet_type: Тип ставки
        
    Returns:
        Сумма выигрыша (ставка * множитель)
    """
    multipliers = get_multipliers()
    multiplier = multipliers.get(bet_type, 0)
    return round(bet_amount * multiplier, 2)


def parse_cube_command(args: list) -> tuple:
    """
    Разобрать аргументы команды /cube
    
    Args:
        args: Список аргументов команды
        
    Returns:
        Кортеж (сумма, тип_ставки, точное_число)
        
    Raises:
        ValueError: Если формат команды неверный
    """
    if len(args) < 2:
        raise ValueError("Недостаточно аргументов. Формат: /cube [сумма] [тип_ставки] [значение]")
    
    # Парсинг суммы ставки
    try:
        bet_amount = float(args[0])
        if bet_amount <= 0:
            raise ValueError("Сумма ставки должна быть больше 0")
        if bet_amount < config.MIN_BET:
            raise ValueError(f"Минимальная ставка: {config.MIN_BET} монет")
        if bet_amount > config.MAX_BET:
            raise ValueError(f"Максимальная ставка: {config.MAX_BET} монет")
    except ValueError as e:
        if "could not convert" in str(e):
            raise ValueError("Неверный формат суммы ставки")
        raise
    
    # Парсинг типа ставки
    bet_type_str = args[1].lower()
    exact_number = None
    
    if bet_type_str in ["четное", "even", "чет"]:
        bet_type = BetType.EVEN
    elif bet_type_str in ["нечетное", "odd", "нечет"]:
        bet_type = BetType.ODD
    elif bet_type_str in ["больше", "more", ">", "б"]:
        bet_type = BetType.MORE
    elif bet_type_str in ["меньше", "less", "<", "м"]:
        bet_type = BetType.LESS
    elif bet_type_str in ["точное", "exact", "=", "число"]:
        bet_type = BetType.EXACT
        # Для точной ставки нужно третье значение
        if len(args) < 3:
            raise ValueError("Для точной ставки укажите число от 1 до 6")
        try:
            exact_number = int(args[2])
            if exact_number < 1 or exact_number > 6:
                raise ValueError("Число должно быть от 1 до 6")
        except ValueError:
            raise ValueError("Неверный формат числа")
    # Проверяем, может быть это просто число (1-6) для точной ставки
    elif bet_type_str.isdigit():
        exact_number = int(bet_type_str)
        if 1 <= exact_number <= 6:
            bet_type = BetType.EXACT
        else:
            raise ValueError("Число должно быть от 1 до 6")
    else:
        raise ValueError(
            "Неверный тип ставки. Доступные: чет, нечет, б, м, 1-6"
        )
    
    return bet_amount, bet_type, exact_number


def parse_bet_command(args: list) -> tuple:
    """
    Разобрать аргументы команды /bet
    
    Args:
        args: Список аргументов команды
        
    Returns:
        Кортеж (сумма, тип_ставки, точное_число)
        
    Raises:
        ValueError: Если формат команды неверный
    """
    if len(args) < 2:
        raise ValueError("Недостаточно аргументов. Формат: /bet [сумма] [тип_ставки] [значение]")
    
    # Парсинг суммы ставки
    try:
        bet_amount = float(args[0])
        if bet_amount <= 0:
            raise ValueError("Сумма ставки должна быть больше 0")
        if bet_amount < config.MIN_BET:
            raise ValueError(f"Минимальная ставка: {config.MIN_BET} монет")
        if bet_amount > config.MAX_BET:
            raise ValueError(f"Максимальная ставка: {config.MAX_BET} монет")
    except ValueError as e:
        if "could not convert" in str(e):
            raise ValueError("Неверный формат суммы ставки")
        raise
    
    # Парсинг типа ставки
    bet_type_str = args[1].lower()
    exact_number = None
    
    if bet_type_str in ["четное", "even", "чет"]:
        bet_type = BetType.EVEN
    elif bet_type_str in ["нечетное", "odd", "нечет"]:
        bet_type = BetType.ODD
    elif bet_type_str in ["больше", "more", ">", "б"]:
        bet_type = BetType.MORE
    elif bet_type_str in ["меньше", "less", "<", "м"]:
        bet_type = BetType.LESS
    elif bet_type_str in ["точное", "exact", "="]:
        bet_type = BetType.EXACT
        # Для точной ставки нужно третье значение
        if len(args) < 3:
            raise ValueError("Для точной ставки укажите число от 1 до 6")
        try:
            exact_number = int(args[2])
            if exact_number < 1 or exact_number > 6:
                raise ValueError("Число должно быть от 1 до 6")
        except ValueError:
            raise ValueError("Неверный формат числа")
    else:
        raise ValueError(
            "Неверный тип ставки. Доступные: четное, нечетное, больше, меньше, точное"
        )
    
    return bet_amount, bet_type, exact_number
