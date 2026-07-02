"""
Простая система хранения баланса пользователей
Использует SQLite для постоянного хранения данных
"""
import sqlite3
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from config import config
import os


class Database:
    """Класс для управления балансами пользователей"""
    
    def __init__(self):
        # Путь к базе данных
        self.db_path = "casino_bot.db"
        self._init_db()
    
    def _init_db(self):
        """Инициализация базы данных"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Создаем таблицу если не существует
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                balance REAL NOT NULL DEFAULT 0,
                held_balance REAL NOT NULL DEFAULT 0,
                bonus_balance REAL NOT NULL DEFAULT 0,
                turnover REAL NOT NULL DEFAULT 0,
                last_activity TIMESTAMP,
                username TEXT,
                first_name TEXT
            )
        ''')
        
        # Миграция: добавляем колонки если их нет
        columns_to_add = [
            ("held_balance", "REAL NOT NULL DEFAULT 0"),
            ("bonus_balance", "REAL NOT NULL DEFAULT 0"),
            ("turnover", "REAL NOT NULL DEFAULT 0"),
            ("last_activity", "TIMESTAMP"),
            ("username", "TEXT"),
            ("first_name", "TEXT"),
            ("is_blocked", "INTEGER NOT NULL DEFAULT 0"),
            ("amount_to_lose", "REAL NOT NULL DEFAULT 0"),
            ("active_balance_type", "TEXT DEFAULT 'real'"),
            ("wager_required", "REAL NOT NULL DEFAULT 0"),
            ("wager_current", "REAL NOT NULL DEFAULT 0"),
            ("active_bonus_bets", "INTEGER NOT NULL DEFAULT 0"),
            ("referrer_id", "INTEGER"),
            ("ref_type", "TEXT"),
            ("ref_cpa_balance", "REAL NOT NULL DEFAULT 0"),
            ("ref_ggr_balance", "REAL NOT NULL DEFAULT 0"),
            ("last_cpa_payout", "TIMESTAMP"),
            ("last_ggr_payout", "TIMESTAMP"),
            ("dep_bonus_state", "INTEGER NOT NULL DEFAULT 0"),
            ("language", "TEXT DEFAULT 'ru'"),
            ("revshare_balance", "REAL NOT NULL DEFAULT 0"),
            ("negative_carryover", "REAL NOT NULL DEFAULT 0"),
            ("withdrawal_details", "TEXT")
        ]
        
        for column_name, column_type in columns_to_add:
            try:
                cursor.execute(f"SELECT {column_name} FROM users LIMIT 1")
            except sqlite3.OperationalError:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")
        
        # Создаем таблицу для промокодов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Таблица кликов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS affiliate_clicks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                affiliate_id INTEGER NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Дневная статистика
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS affiliate_stats_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                affiliate_id INTEGER NOT NULL,
                clicks INTEGER DEFAULT 0,
                fd_count INTEGER DEFAULT 0,
                rd_count INTEGER DEFAULT 0,
                dep_sum REAL DEFAULT 0,
                ggr REAL DEFAULT 0,
                ngr REAL DEFAULT 0,
                income REAL DEFAULT 0,
                UNIQUE(date, affiliate_id)
            )
        ''')
        
        # Создаем таблицу для истории ставок
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_type TEXT NOT NULL,
                bet_amount REAL NOT NULL,
                result TEXT NOT NULL,
                win_amount REAL NOT NULL DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_id INTEGER
            )
        ''')
        
        # Создаем таблицу для заявок на вывод
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                status TEXT NOT NULL, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def _get_connection(self):
        """Получить соединение с базой данных"""
        return sqlite3.connect(self.db_path)
    
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
        cursor.execute('SELECT balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else 0.0
    
    def set_balance(self, user_id: int, amount: float) -> None:
        """
        Установить баланс пользователя
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Новая сумма баланса
        """
        amount = round(amount, 2)  # Округляем до 2 знаков
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO users (user_id, balance) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET balance = ?
        ''', (user_id, amount, amount))
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
        new_balance = round(current + amount, 2)  # Округляем результат
        self.set_balance(user_id, new_balance)
        return new_balance
    
    def subtract_balance(self, user_id: int, amount: float) -> float:
        """
        Списать средства с баланса
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма для списания
            
        Returns:
            Новый баланс пользователя
        """
        current = self.get_balance(user_id)
        new_balance = round(current - amount, 2)  # Округляем результат
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
            referrer_id: ID рефовода
            ref_type: 'cpa' или 'ggr'
            
        Returns:
            True если пользователь был создан, False если уже существовал
        """
        if initial_balance is None:
            initial_balance = config.INITIAL_BALANCE
        
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT user_id FROM users WHERE user_id = ?', (user_id,))
        if not cursor.fetchone():
            from datetime import datetime
            cursor.execute('INSERT INTO users (user_id, balance, held_balance, referrer_id, ref_type, last_activity) VALUES (?, ?, ?, ?, ?, ?)', 
                         (user_id, initial_balance, 0, referrer_id, ref_type, datetime.now()))
            conn.commit()
            conn.close()
            return True
        conn.close()
        return False
    
    def hold_balance(self, user_id: int, amount: float) -> bool:
        """
        Удержать средства с баланса (перевести в held_balance)
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма для удержания
            
        Returns:
            True если успешно, False если недостаточно средств
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT balance, held_balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        
        if not result or result[0] < amount:
            conn.close()
            return False
        
        new_balance = result[0] - amount
        new_held = result[1] + amount
        
        cursor.execute('''
            UPDATE users SET balance = ?, held_balance = ? WHERE user_id = ?
        ''', (new_balance, new_held, user_id))
        conn.commit()
        conn.close()
        return True
    
    def release_held_balance(self, user_id: int, amount: float) -> float:
        """
        Вернуть удержанные средства на баланс
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма для возврата
            
        Returns:
            Новый баланс пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT balance, held_balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        
        if result:
            new_balance = result[0] + amount
            new_held = max(0, result[1] - amount)
            
            cursor.execute('''
                UPDATE users SET balance = ?, held_balance = ? WHERE user_id = ?
            ''', (new_balance, new_held, user_id))
            conn.commit()
            conn.close()
            return new_balance
        
        conn.close()
        return 0.0
    
    def confirm_held_balance(self, user_id: int, amount: float) -> bool:
        """
        Подтвердить вывод (списать с held_balance)
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма для списания
            
        Returns:
            True если успешно
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT held_balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        
        if result and result[0] >= amount:
            new_held = result[0] - amount
            cursor.execute('UPDATE users SET held_balance = ? WHERE user_id = ?', (new_held, user_id))
            conn.commit()
            conn.close()
            return True
        
        conn.close()
        return False
    
    def get_available_balance(self, user_id: int) -> float:
        """
        Получить доступный баланс (без удержанных средств)
        
        Args:
            user_id: ID пользователя в Telegram
            
        Returns:
            Доступный баланс
        """
        return self.get_balance(user_id)
    
    def update_user_activity(self, user_id: int, username: str = None, first_name: str = None) -> None:
        """
        Обновить время последней активности пользователя
        
        Args:
            user_id: ID пользователя в Telegram
            username: Username пользователя
            first_name: Имя пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET 
                last_activity = ?,
                username = COALESCE(?, username),
                first_name = COALESCE(?, first_name)
            WHERE user_id = ?
        ''', (datetime.now(), username, first_name, user_id))
        conn.commit()
        conn.close()
    
    def get_online_users_count(self, minutes: int = 10) -> int:
        """
        Получить количество пользователей онлайн за последние N минут
        
        Args:
            minutes: Количество минут для проверки активности
            
        Returns:
            Количество активных пользователей
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        threshold = datetime.now() - timedelta(minutes=minutes)
        cursor.execute('SELECT COUNT(*) FROM users WHERE last_activity >= ?', (threshold,))
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
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
            SELECT user_id, username, first_name, balance, turnover 
            FROM users 
            ORDER BY user_id
        ''')
        users = cursor.fetchall()
        conn.close()
        return users
    
    def get_user_info(self, user_id: int) -> Optional[Dict]:
        """
        Получить полную информацию о пользователе
        
        Args:
            user_id: ID пользователя в Telegram
            
        Returns:
            Словарь с информацией о пользователе или None
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT user_id, username, first_name, balance, bonus_balance, turnover, last_activity
            FROM users WHERE user_id = ?
        ''', (user_id,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'user_id': result[0],
                'username': result[1],
                'first_name': result[2],
                'balance': result[3],
                'bonus_balance': result[4],
                'turnover': result[5],
                'last_activity': result[6]
            }
        return None
    
    def add_turnover(self, user_id: int, amount: float) -> None:
        """
        Добавить оборот пользователю
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма оборота
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET turnover = turnover + ? WHERE user_id = ?
        ''', (amount, user_id))
        conn.commit()
        conn.close()
    
    def get_bonus_balance(self, user_id: int) -> float:
        """
        Получить бонусный баланс пользователя
        
        Args:
            user_id: ID пользователя в Telegram
            
        Returns:
            Бонусный баланс
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT bonus_balance FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else 0.0
    
    def add_bonus_balance(self, user_id: int, amount: float) -> float:
        """
        Добавить бонусный баланс пользователю
        
        Args:
            user_id: ID пользователя в Telegram
            amount: Сумма бонуса
            
        Returns:
            Новый бонусный баланс
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET bonus_balance = bonus_balance + ? WHERE user_id = ?
        ''', (amount, user_id))
        conn.commit()
        
        cursor.execute('SELECT bonus_balance FROM users WHERE user_id = ?', (user_id,))
        new_balance = cursor.fetchone()[0]
        conn.close()
        return new_balance
    
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
        cursor.execute('''
            INSERT INTO bets (user_id, game_type, bet_amount, result, win_amount, message_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_id, game_type, bet_amount, result, win_amount, message_id))
        conn.commit()
        conn.close()
        
        # Обновляем оборот
        self.add_turnover(user_id, bet_amount)

        # Синхронизация ставки в PostgreSQL
        try:
            from database.db_postgres import db_postgres
            import uuid
            
            # Сопоставим русские/оригинальные названия игр с английскими тегами для admin panel
            game_map = {
                'Кости': 'cube',
                'cube': 'cube',
                'Боулинг': 'bowling',
                'bowling': 'bowling',
                'Дартс': 'darts',
                'darts': 'darts',
                'Баскетбол': 'basketball',
                'basketball': 'basketball',
                'Футбол': 'football',
                'football': 'football',
                'Камень, ножницы, бумага': 'rps',
                'rps': 'rps',
                'Мины': 'mines',
                'mines': 'mines',
                'Паук': 'spider',
                'spider': 'spider',
            }
            mapped_game = game_map.get(game_type, game_type.lower())
            
            bet_id = str(uuid.uuid4())
            state = "won" if result == "win" else "lost"
            multiplier = round(win_amount / bet_amount, 2) if bet_amount > 0 else 0.0
            
            db_postgres.add_bot_bet(
                telegram_id=user_id,
                bet_id=bet_id,
                game_type=mapped_game,
                amount=bet_amount,
                payout=win_amount,
                multiplier=multiplier,
                state=state,
                metadata={'message_id': message_id, 'source': 'bot'}
            )
        except Exception as e:
            print(f"❌ Failed to mirror bet to Postgres: {e}")
    
    def get_last_bet(self, user_id: int) -> Optional[Dict]:
        """
        Получить последнюю ставку пользователя
        
        Args:
            user_id: ID пользователя
            
        Returns:
            Словарь с информацией о ставке или None
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT game_type, bet_amount, result, win_amount, timestamp, message_id
            FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT 1
        ''', (user_id,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                'game_type': result[0],
                'bet_amount': result[1],
                'result': result[2],
                'win_amount': result[3],
                'timestamp': result[4],
                'message_id': result[5]
            }
        return None
        return None


    def is_user_blocked(self, user_id: int) -> bool:
        """
        Проверить, заблокирован ли пользователь
        
        Args:
            user_id: ID пользователя
            
        Returns:
            True если заблокирован
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT is_blocked FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return bool(result[0]) if result else False
    
    def block_user(self, user_id: int) -> None:
        """
        Заблокировать пользователя
        
        Args:
            user_id: ID пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET is_blocked = 1 WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()
    
    def unblock_user(self, user_id: int) -> None:
        """
        Разблокировать пользователя
        
        Args:
            user_id: ID пользователя
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET is_blocked = 0 WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()

    def get_dep_bonus_state(self, user_id: int) -> int:
        """
        Получить состояние депозитного бонуса
        0 - не активирован, 1 - активирован (ожидает пополнения), 2 - использован
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT dep_bonus_state FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else 0

    def set_dep_bonus_state(self, user_id: int, state: int) -> None:
        """
        Установить состояние депозитного бонуса
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET dep_bonus_state = ? WHERE user_id = ?', (state, user_id))
        conn.commit()
        conn.close()


    # === NEW MECHANICS METHODS ===

    def get_amount_to_lose(self, user_id: int) -> float:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT amount_to_lose FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else 0.0

    def add_deposit_amount_to_lose(self, user_id: int, amount: float) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET amount_to_lose = amount_to_lose + ? WHERE user_id = ?', (amount, user_id))
        conn.commit()
        conn.close()

    def decrease_amount_to_lose(self, user_id: int, amount: float) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT amount_to_lose FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        if res:
            new_amount = max(0.0, res[0] - amount)
            cursor.execute('UPDATE users SET amount_to_lose = ? WHERE user_id = ?', (new_amount, user_id))
            conn.commit()
        conn.close()

    def get_active_balance_type(self, user_id: int) -> str:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT active_balance_type FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else 'real'

    def toggle_active_balance_type(self, user_id: int) -> str:
        current = self.get_active_balance_type(user_id)
        new_type = 'bonus' if current == 'real' else 'real'
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET active_balance_type = ? WHERE user_id = ?', (new_type, user_id))
        conn.commit()
        conn.close()
        return new_type

    def get_wager_info(self, user_id: int) -> Tuple[float, float]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT wager_current, wager_required FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return (res[0], res[1]) if res else (0.0, 0.0)

    def set_bonus_wager(self, user_id: int, bonus_amount: float) -> None:
        multiplier = 25 if bonus_amount <= 500 else 50
        wager_required = bonus_amount * multiplier
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users 
            SET bonus_balance = bonus_balance + ?, wager_required = wager_required + ? 
            WHERE user_id = ?
        ''', (bonus_amount, wager_required, user_id))
        conn.commit()
        conn.close()

    def add_wager_progress(self, user_id: int, amount: float) -> bool:
        """Returns True if wager is completed after this progress"""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT wager_current, wager_required, bonus_balance FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        if not res:
            conn.close()
            return False
            
        wager_current = round(res[0] + amount, 2)
        wager_required = res[1]
        
        if wager_current >= round(wager_required - 0.01, 2):
            cursor.execute('''
                UPDATE users 
                SET balance = balance + bonus_balance, 
                    bonus_balance = 0, 
                    wager_current = 0, 
                    wager_required = 0,
                    active_balance_type = 'real'
                WHERE user_id = ?
            ''', (user_id,))
            conn.commit()
            conn.close()
            return True
        else:
            cursor.execute('UPDATE users SET wager_current = ? WHERE user_id = ?', (wager_current, user_id))
            conn.commit()
            conn.close()
            return False

    def reset_wager_and_bonus(self, user_id: int) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users 
            SET bonus_balance = 0, wager_current = 0, wager_required = 0, active_balance_type = 'real'
            WHERE user_id = ?
        ''', (user_id,))
        conn.commit()
        conn.close()

    def get_active_bonus_bets(self, user_id: int) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT active_bonus_bets FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else 0

    def change_active_bonus_bets(self, user_id: int, delta: int) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET active_bonus_bets = max(0, active_bonus_bets + ?) WHERE user_id = ?', (delta, user_id))
        conn.commit()
        conn.close()

    # Withdrawals DB
    def create_withdrawal(self, user_id: int, amount: float, status: str) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO withdrawals (user_id, amount, status) VALUES (?, ?, ?)',
            (user_id, amount, status)
        )
        wid = cursor.lastrowid
        conn.commit()
        conn.close()
        return wid

    def update_withdrawal_status(self, withdrawal_id: int, new_status: str) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE withdrawals SET status = ? WHERE id = ?', (new_status, withdrawal_id))
        conn.commit()
        conn.close()

    def get_active_withdrawals_count(self, user_id: int) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM withdrawals WHERE user_id = ? AND status IN ("pending_admin", "pending_block")', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else 0

    def get_withdrawal(self, withdrawal_id: int) -> Optional[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, user_id, amount, status, created_at FROM withdrawals WHERE id = ?', (withdrawal_id,))
        res = cursor.fetchone()
        conn.close()
        if res:
            return {'id': res[0], 'user_id': res[1], 'amount': res[2], 'status': res[3], 'created_at': res[4]}
        return None

    def get_pending_block_withdrawals(self) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id, user_id, amount, status, created_at FROM withdrawals WHERE status = "pending_block"')
        res = cursor.fetchall()
        conn.close()
        return [{'id': r[0], 'user_id': r[1], 'amount': r[2], 'status': r[3], 'created_at': r[4]} for r in res]


    def process_bet_start(self, user_id: int, amount: float) -> Tuple[bool, str]:
        """Returns (Success, BalanceType). Deducts balance, marks active bonus bet."""
        btype = self.get_active_balance_type(user_id)
        if btype == 'real':
            if self.get_balance(user_id) >= amount:
                self.subtract_balance(user_id, amount)
                return True, 'real'
        else:
            if self.get_bonus_balance(user_id) >= amount:
                self.add_bonus_balance(user_id, -amount)
                self.change_active_bonus_bets(user_id, 1)
                return True, 'bonus'
        return False, btype

    def process_bet_result(self, user_id: int, btype: str, bet: float, win: float, multiplier: float = 1.0) -> None:
        """Awards win, updates wager or amount_to_lose, clears active bet."""
        net_loss = bet - win
        
        # Начисление 15% GGR рефоводу (только для реального баланса при проигрыше)
        if btype == 'real' and net_loss > 0:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute('SELECT referrer_id, ref_type FROM users WHERE user_id = ?', (user_id,))
            ref_data = cursor.fetchone()
            if ref_data and ref_data[0] and ref_data[1] == 'ggr':
                ggr_bonus = round(net_loss * 0.15, 2)
                cursor.execute('UPDATE users SET ref_ggr_balance = ref_ggr_balance + ? WHERE user_id = ?', (ggr_bonus, ref_data[0]))
                conn.commit()
            conn.close()

        if btype == 'real':
            if win > 0:
                self.add_balance(user_id, win)
            net_loss = bet - win
            if net_loss > 0:
                self.decrease_amount_to_lose(user_id, net_loss)
        else:
            if win > 0:
                self.add_bonus_balance(user_id, win)
            self.change_active_bonus_bets(user_id, -1)
            # Update wager progress
            self.add_wager_progress(user_id, bet * multiplier)

    # === РЕФЕРАЛЬНАЯ ПРОГРАММА ===

    def get_referral_stats(self, user_id: int) -> dict:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM users WHERE referrer_id = ?', (user_id,))
        refs_count = cursor.fetchone()[0]
        
        cursor.execute('''SELECT ref_cpa_balance, ref_ggr_balance, last_cpa_payout, last_ggr_payout 
                          FROM users WHERE user_id = ?''', (user_id,))
        bals = cursor.fetchone()
        conn.close()
        
        return {
            'count': refs_count,
            'cpa_balance': bals[0] if bals else 0.0,
            'ggr_balance': bals[1] if bals else 0.0,
            'last_cpa': bals[2] if bals else None,
            'last_ggr': bals[3] if bals else None
        }

    def add_ref_cpa_balance(self, user_id: int, amount: float) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET ref_cpa_balance = ref_cpa_balance + ? WHERE user_id = ?', (amount, user_id))
        conn.commit()
        conn.close()

    def claim_ref_balance(self, user_id: int, ref_type: str) -> bool:
        """Перевод реф баланса на основной и обновление таймера"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        col = 'ref_cpa_balance' if ref_type == 'cpa' else 'ref_ggr_balance'
        ts_col = 'last_cpa_payout' if ref_type == 'cpa' else 'last_ggr_payout'
        
        cursor.execute(f'SELECT {col} FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        if not res or res[0] <= 0:
            conn.close()
            return False
            
        amount = res[0]
        from datetime import datetime
        now_ts = datetime.now().isoformat()
        
        cursor.execute(f'''
            UPDATE users 
            SET balance = balance + ?, {col} = 0, {ts_col} = ?
            WHERE user_id = ?
        ''', (amount, now_ts, user_id))
        
        conn.commit()
        conn.close()
        return True

    def claim_all_ref_balance(self, user_id: int) -> tuple:
        """Переводит весь реф баланс на основной, возвращает сумму"""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT ref_cpa_balance, ref_ggr_balance FROM users WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        if not res or (res[0] <= 0 and res[1] <= 0):
            conn.close()
            return False, 0.0
            
        amount = res[0] + res[1]
        from datetime import datetime
        now_ts = datetime.now().isoformat()
        
        cursor.execute('''
            UPDATE users 
            SET balance = balance + ?, 
                ref_cpa_balance = 0, 
                ref_ggr_balance = 0, 
                last_cpa_payout = ?, 
                last_ggr_payout = ?
            WHERE user_id = ?
        ''', (amount, now_ts, now_ts, user_id))
        
        conn.commit()
        conn.close()
        return True, amount
        
    # --- REVSHARE & PROMO CODES ---
    
    def get_promo_code_owner(self, code: str) -> Optional[int]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT user_id FROM promo_codes WHERE code = ?', (code.lower(),))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else None
        
    def get_user_promo_code(self, user_id: int) -> Optional[str]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT code FROM promo_codes WHERE user_id = ?', (user_id,))
        res = cursor.fetchone()
        conn.close()
        return res[0] if res else None
        
    def create_promo_code(self, user_id: int, code: str) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('INSERT INTO promo_codes (user_id, code) VALUES (?, ?)', (user_id, code.lower()))
            conn.commit()
            success = True
        except sqlite3.IntegrityError:
            success = False
        finally:
            conn.close()
        return success
        
    def add_affiliate_click(self, affiliate_id: int) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('INSERT INTO affiliate_clicks (affiliate_id) VALUES (?)', (affiliate_id,))
        conn.commit()
        conn.close()
        
    def get_revshare_stats_all_time(self, affiliate_id: int) -> dict:
        conn = self._get_connection()
        cursor = conn.cursor()
        # Get clicks
        cursor.execute('SELECT COUNT(*) FROM affiliate_clicks WHERE affiliate_id = ?', (affiliate_id,))
        clicks = cursor.fetchone()[0]
        # Get FD, RD, Dep sum, Income from daily stats
        cursor.execute('''
            SELECT SUM(fd_count), SUM(rd_count), SUM(dep_sum), SUM(income)
            FROM affiliate_stats_daily WHERE affiliate_id = ?
        ''', (affiliate_id,))
        stats = cursor.fetchone()
        
        cursor.execute('SELECT revshare_balance, negative_carryover FROM users WHERE user_id = ?', (affiliate_id,))
        bal = cursor.fetchone()
        
        conn.close()
        
        return {
            'clicks': clicks,
            'fd_count': stats[0] or 0,
            'rd_count': stats[1] or 0,
            'dep_sum': stats[2] or 0.0,
            'total_income': stats[3] or 0.0,
            'revshare_balance': bal[0] if bal else 0.0,
            'negative_carryover': bal[1] if bal else 0.0
        }
        
    def claim_revshare_balance(self, affiliate_id: int) -> tuple:
        """Списывает revshare_balance и создает заявку на вывод (через payment handler) или переводит на основной счет"""
        # Пока просто возвращаем сумму. Сама логика создания заявки будет в хендлере.
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT revshare_balance FROM users WHERE user_id = ?', (affiliate_id,))
        res = cursor.fetchone()
        if not res or res[0] <= 0:
            conn.close()
            return False, 0.0
            
        amount = res[0]
        cursor.execute('UPDATE users SET revshare_balance = 0 WHERE user_id = ?', (affiliate_id,))
        conn.commit()
        conn.close()
        return True, amount

    def check_and_ban_fraud(self, affiliate_telegram_id: int, affiliate_credentials: str) -> bool:
        """
        Проверяет на твинководство: совпадение реквизитов вывода с рефералами.
        Возвращает True если обнаружен фрод (и банит).
        В SQLite нет IP и is_blocked, поэтому баним обнулением балансов.
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        fraud_found = False
        twinks_to_ban = []
        
        cursor.execute('SELECT user_id FROM users WHERE referrer_id = ?', (affiliate_telegram_id,))
        referrals = [r[0] for r in cursor.fetchall()]
        
        for ref_id in referrals:
            # Check credentials directly in users table (since we added withdrawal_details)
            cursor.execute('SELECT withdrawal_details FROM users WHERE user_id = ?', (ref_id,))
            res = cursor.fetchone()
            if res and res[0] and res[0].strip() == affiliate_credentials.strip():
                fraud_found = True
                twinks_to_ban.append(ref_id)
                
        if fraud_found:
            for t_id in twinks_to_ban:
                cursor.execute('UPDATE users SET balance = 0, revshare_balance = 0 WHERE user_id = ?', (t_id,))
            cursor.execute('UPDATE users SET balance = 0, revshare_balance = 0 WHERE user_id = ?', (affiliate_telegram_id,))
            conn.commit()
            
        conn.close()
        return fraud_found

    
    def get_user_language(self, user_id: int) -> str:
        """
        Получить язык пользователя
        
        Args:
            user_id: ID пользователя
            
        Returns:
            Код языка (ru, pl), по умолчанию 'ru'
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT language FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result and result[0] else 'ru'
    
    def get_user_language_raw(self, user_id: int) -> Optional[str]:
        """
        Получить язык пользователя без дефолтного значения
        
        Args:
            user_id: ID пользователя
            
        Returns:
            Код языка (ru, pl) или None если не установлен
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT language FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else None
    
    def set_user_language(self, user_id: int, language: str) -> None:
        """
        Установить язык пользователя
        
        Args:
            user_id: ID пользователя
            language: Код языка (ru, pl)
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET language = ? WHERE user_id = ?', (language, user_id))
        conn.commit()
        conn.close()


# Глобальный экземпляр базы данных
db = Database()


# ---------------------------------------------------------------------------
# Backend selection.
#
# Earlier handlers imported the SQLite database directly (`from database.db
# import db`) instead of going through `database/__init__.py`. That meant
# turning on `USE_POSTGRES` only switched the imports done via
# `from database import db` — every existing handler kept writing to the
# local SQLite file, which is exactly why the bot's balance and the
# mini-app's balance drifted apart.
#
# To fix this without touching every handler we re-bind the public `db`
# symbol here, after the SQLite class is fully defined, to the PostgreSQL
# adapter when the env var is set. Both adapters expose the same surface
# API used by the handlers, so they can stay agnostic about which backend
# is actually live.
# ---------------------------------------------------------------------------
import os as _os

if _os.getenv('USE_POSTGRES', 'true').lower() in ('true', '1', 'yes'):
    try:
        from .db_postgres import db_postgres as _pg_db
        db = _pg_db  # type: ignore[assignment]
        print("✅ database.db rebound to PostgreSQL adapter")
    except Exception as _err:
        print(f"⚠️  Failed to bind PostgreSQL adapter, staying on SQLite: {_err}")
