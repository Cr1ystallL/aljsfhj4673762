"""
PostgreSQL адаптер для Python бота
Использует ту же базу данных что и Mini-app backend
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from config import config
import os


class DatabasePostgres:
    """Класс для управления балансами пользователей в PostgreSQL"""
    
    def __init__(self):
        # Получаем DATABASE_URL из переменных окружения
        self.database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/casino_miniapp')
        self._init_db()
    
    def _init_db(self):
        """Инициализация базы данных - таблицы уже созданы через Prisma"""
        # Проверяем подключение
        try:
            conn = self._get_connection()
            conn.close()
            print("✅ PostgreSQL connection successful")
        except Exception as e:
            print(f"❌ PostgreSQL connection failed: {e}")
            raise
    
    def _get_connection(self):
        """Получить соединение с базой данных"""
        return psycopg2.connect(self.database_url)
    
    def get_balance(self, user_id: int) -> float:
        """
        Получить баланс пользователя
        
        Args:
            user_id: ID пользователя в Telegram
            
        Returns:
            Текущий баланс пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Находим пользователя по telegramId
        cursor.execute('''
            SELECT b.amount 
            FROM balances b
            JOIN users u ON b."userId" = u.id
            WHERE u."telegramId" = %s AND b."demoMode" = false
        ''', (user_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            # Prisma хранит Decimal, конвертируем в float
            return float(result[0])
        return 0.0
    
    def set_balance(self, user_id: int, amount: float) -> None:
        """
        Установить баланс пользователя
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Новая сумма баланса
        """
        amount = round(amount, 2)
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Обновляем баланс через telegramId
        cursor.execute('''
            UPDATE balances 
            SET amount = %s, "updatedAt" = NOW()
            WHERE "userId" = (
                SELECT id FROM users WHERE "telegramId" = %s
            ) AND "demoMode" = false
        ''', (amount, user_id))
        
        # Если баланс не существует, создаем его
        if cursor.rowcount == 0:
            cursor.execute('''
                INSERT INTO balances (id, "userId", amount, currency, "demoMode", "createdAt", "updatedAt")
                SELECT gen_random_uuid(), id, %s, 'USD', false, NOW(), NOW()
                FROM users WHERE "telegramId" = %s
            ''', (amount, user_id))
        
        conn.commit()
        conn.close()
    
    def add_balance(self, user_id: int, amount: float) -> float:
        """
        Добавить средства на баланс
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма для добавления
            
        Returns:
            Новый баланс пользователя
        """
        current = self.get_balance(user_id)
        new_balance = round(current + amount, 2)
        self.set_balance(user_id, new_balance)
        return new_balance
    
    def subtract_balance(self, user_id: int, amount: float) -> float:
        """
        Списать средства с баланса
        
        Args:
            user_id: ID пользователя in Telegram
            amount: Сумма для списания
            
        Returns:
            Новый баланс пользователя
        """
        current = self.get_balance(user_id)
        new_balance = round(current - amount, 2)
        self.set_balance(user_id, new_balance)
        return new_balance
    
    def has_sufficient_balance(self, user_id: int, amount: float) -> bool:
        """
        Проверить, достаточно ли средств на балансе
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Требуемая сумма
            
        Returns:
            True если средств достаточно, иначе False
        """
        return self.get_balance(user_id) >= amount
    
    def create_user(self, user_id: int, initial_balance: float = None, referrer_id: int = None, ref_type: str = None) -> bool:
        """
        Создать нового пользователя с начальным балансом
        
        Args:
            user_id: ID пользователя в Telegram
            initial_balance: Начальный баланс (если None, берется из конфигурации)
            referrer_id: ID реферера
            ref_type: 'cpa' или 'ggr'
            
        Returns:
            True если пользователь был создан, False если уже существовал
        """
        if initial_balance is None:
            initial_balance = config.INITIAL_BALANCE
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Проверяем существование пользователя
        cursor.execute('SELECT id FROM users WHERE "telegramId" = %s', (user_id,))
        
        if not cursor.fetchone():
            # Создаем пользователя
            cursor.execute('''
                INSERT INTO users (id, "telegramId", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), %s, NOW(), NOW())
                RETURNING id
            ''', (user_id,))
            
            user_uuid = cursor.fetchone()[0]
            
            # Создаем баланс
            cursor.execute('''
                INSERT INTO balances (id, "userId", amount, currency, "demoMode", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), %s, %s, 'USD', false, NOW(), NOW())
            ''', (user_uuid, initial_balance))
            
            conn.commit()
            conn.close()
            return True
        
        conn.close()
        return False
    
    def update_user_activity(self, user_id: int, username: str = None, first_name: str = None) -> None:
        """
        Обновить информацию о пользователе
        
        Args:
            user_id: ID пользователя в Telegram
            username: Username пользователя
            first_name: Имя пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        update_fields = ['"updatedAt" = NOW()']
        params = []
        
        if username is not None:
            update_fields.append('username = %s')
            params.append(username)
        
        if first_name is not None:
            update_fields.append('"firstName" = %s')
            params.append(first_name)
        
        params.append(user_id)
        
        cursor.execute(f'''
            UPDATE users 
            SET {', '.join(update_fields)}
            WHERE "telegramId" = %s
        ''', params)
        
        conn.commit()
        conn.close()
    
    def get_user_info(self, user_id: int) -> Optional[Dict]:
        """
        Получить полную информацию о пользователе
        
        Args:
            user_id: ID пользователя в Telegram
            
        Returns:
            Словарь с информацией о пользователе или None
        """
        conn = self._get_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute('''
            SELECT 
                u."telegramId" as user_id,
                u.username,
                u."firstName" as first_name,
                COALESCE(b.amount, 0) as balance,
                u."createdAt" as last_activity
            FROM users u
            LEFT JOIN balances b ON b."userId" = u.id AND b."demoMode" = false
            WHERE u."telegramId" = %s
        ''', (user_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'user_id': result['user_id'],
                'username': result['username'],
                'first_name': result['first_name'],
                'balance': float(result['balance']) if result['balance'] else 0.0,
                'bonus_balance': 0.0,  # Пока не используем
                'turnover': 0.0,  # Пока не используем
                'last_activity': result['last_activity']
            }
        return None
    
    def save_bet(self, user_id: int, game_type: str, bet_amount: float, 
                 result: str, win_amount: float = 0, message_id: int = None) -> None:
        """
        Сохранить ставку в историю
        
        Args:
            user_id: ID пользователя
            game_type: Тип игры
            bet_amount: Сумма ставки
            result: Результат (win/loss)
            win_amount: Сумма выигрыша
            message_id: ID сообщения со ставкой
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Получаем UUID пользователя
        cursor.execute('SELECT id FROM users WHERE "telegramId" = %s', (user_id,))
        user_result = cursor.fetchone()
        
        if user_result:
            user_uuid = user_result[0]
            
            # Создаем транзакцию для ставки
            cursor.execute('''
                INSERT INTO transactions (
                    id, "userId", type, amount, "balanceAfter", description, "createdAt"
                )
                VALUES (
                    gen_random_uuid(), %s, 'bet', %s, 
                    (SELECT amount FROM balances WHERE "userId" = %s AND "demoMode" = false),
                    %s, NOW()
                )
            ''', (user_uuid, -bet_amount, user_uuid, f'{game_type} bet'))
            
            # Если есть выигрыш, создаем транзакцию выигрыша
            if win_amount > 0:
                cursor.execute('''
                    INSERT INTO transactions (
                        id, "userId", type, amount, "balanceAfter", description, "createdAt"
                    )
                    VALUES (
                        gen_random_uuid(), %s, 'win', %s,
                        (SELECT amount FROM balances WHERE "userId" = %s AND "demoMode" = false),
                        %s, NOW()
                    )
                ''', (user_uuid, win_amount, user_uuid, f'{game_type} win'))
        
        conn.commit()
        conn.close()
    
    def get_total_users_count(self) -> int:
        """
        Получить общее количество пользователей
        
        Returns:
            Количество пользователей
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM users')
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
    def get_all_users(self) -> List[Tuple[int, str, str, float, float]]:
        """
        Получить список всех пользователей
        
        Returns:
            Список кортежей (user_id, username, first_name, balance, turnover)
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                u."telegramId",
                u.username,
                u."firstName",
                COALESCE(b.amount, 0),
                0 as turnover
            FROM users u
            LEFT JOIN balances b ON b."userId" = u.id AND b."demoMode" = false
            ORDER BY u."telegramId"
        ''')
        
        users = cursor.fetchall()
        conn.close()
        
        # Конвертируем Decimal в float
        return [(u[0], u[1], u[2], float(u[3]), float(u[4])) for u in users]
    
    # Заглушки для методов которые пока не используются в mini-app
    def hold_balance(self, user_id: int, amount: float) -> bool:
        return True
    
    def release_held_balance(self, user_id: int, amount: float) -> float:
        return self.add_balance(user_id, amount)
    
    def confirm_held_balance(self, user_id: int, amount: float) -> bool:
        return True
    
    def get_available_balance(self, user_id: int) -> float:
        return self.get_balance(user_id)
    
    def get_online_users_count(self, minutes: int = 10) -> int:
        return 0  # Пока не отслеживаем
    
    def get_last_bet(self, user_id: int) -> Optional[Dict]:
        return None  # Пока не используем
    
    def add_turnover(self, user_id: int, amount: float) -> None:
        pass  # Пока не используем
    
    def get_bonus_balance(self, user_id: int) -> float:
        return 0.0  # Пока не используем
    
    def add_bonus_balance(self, user_id: int, amount: float) -> float:
        return 0.0  # Пока не используем
    
    def is_user_blocked(self, user_id: int) -> bool:
        return False  # Пока не используем
    
    def block_user(self, user_id: int) -> None:
        pass
    
    def unblock_user(self, user_id: int) -> None:
        pass
    
    def get_dep_bonus_state(self, user_id: int) -> int:
        return 0
    
    def set_dep_bonus_state(self, user_id: int, state: int) -> None:
        pass
    
    def get_amount_to_lose(self, user_id: int) -> float:
        return 0.0
    
    def add_deposit_amount_to_lose(self, user_id: int, amount: float) -> None:
        pass
    
    def decrease_amount_to_lose(self, user_id: int, amount: float) -> None:
        pass
    
    def get_active_balance_type(self, user_id: int) -> str:
        return 'real'
    
    def toggle_active_balance_type(self, user_id: int) -> str:
        return 'real'
    
    def get_wager_info(self, user_id: int) -> Tuple[float, float]:
        return (0.0, 0.0)
    
    def set_bonus_wager(self, user_id: int, bonus_amount: float) -> None:
        pass
    
    def add_wager_progress(self, user_id: int, amount: float) -> bool:
        return False
    
    def reset_wager_and_bonus(self, user_id: int) -> None:
        pass
    
    def get_active_bonus_bets(self, user_id: int) -> int:
        return 0
    
    def change_active_bonus_bets(self, user_id: int, delta: int) -> None:
        pass
    
    def create_withdrawal(self, user_id: int, amount: float, status: str) -> int:
        return 0
    
    def update_withdrawal_status(self, withdrawal_id: int, new_status: str) -> None:
        pass
    
    def get_active_withdrawals_count(self, user_id: int) -> int:
        return 0
    
    def get_withdrawal(self, withdrawal_id: int) -> Optional[Dict]:
        return None
    
    def get_pending_block_withdrawals(self) -> List[Dict]:
        return []
    
    def process_bet_start(self, user_id: int, amount: float) -> Tuple[bool, str]:
        if self.has_sufficient_balance(user_id, amount):
            self.subtract_balance(user_id, amount)
            return True, 'real'
        return False, 'real'
    
    def process_bet_result(self, user_id: int, btype: str, bet: float, win: float, multiplier: float = 1.0) -> None:
        if win > 0:
            self.add_balance(user_id, win)
    
    def get_referral_stats(self, user_id: int) -> dict:
        return {
            'count': 0,
            'cpa_balance': 0.0,
            'ggr_balance': 0.0,
            'last_cpa': None,
            'last_ggr': None
        }
    
    def add_ref_cpa_balance(self, user_id: int, amount: float) -> None:
        pass
    
    def claim_ref_balance(self, user_id: int, ref_type: str) -> bool:
        return False
    
    def claim_all_ref_balance(self, user_id: int) -> tuple:
        return False, 0.0
    
    def get_user_language(self, user_id: int) -> str:
        return 'ru'
    
    def get_user_language_raw(self, user_id: int) -> Optional[str]:
        return None
    
    def set_user_language(self, user_id: int, language: str) -> None:
        pass


# Глобальный экземпляр базы данных PostgreSQL
db_postgres = DatabasePostgres()
