"""
PostgreSQL адаптер для Python бота
Использует ту же базу данных что и Mini-app backend
"""
import json
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
            print(f"DEBUG: Connecting to {self.database_url.replace('postg', '***')}")
            conn = self._get_connection()
            conn.close()
            print("✅ PostgreSQL connection successful")
        except Exception as e:
            print(f"❌ PostgreSQL connection failed: {e}")
            raise
    
    def _get_connection(self):
        """Получить соединение с базой данных"""
        return psycopg2.connect(self.database_url)

    def _ensure_user_uuid(self, telegram_id: int) -> Optional[str]:
        """Вернуть UUID пользователя, создавая запись при отсутствии."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE telegram_id = %s', (telegram_id,))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row[0]
        # Создаём пользователя и баланс
        cursor.execute(
            '''
            INSERT INTO users (id, telegram_id, created_at, updated_at)
            VALUES (gen_random_uuid(), %s, NOW(), NOW())
            RETURNING id
            ''',
            (telegram_id,)
        )
        user_uuid = cursor.fetchone()[0]
        cursor.execute(
            '''
            INSERT INTO balances (id, user_id, amount, currency, demo_mode, created_at, updated_at)
            VALUES (gen_random_uuid(), %s, %s, 'PLN', false, NOW(), NOW())
            ''',
            (user_uuid, self.get_initial_balance())
        )
        conn.commit()
        conn.close()
        return user_uuid

    def add_withdrawal(
        self,
        telegram_id: int,
        amount: float,
        balance_before: float,
        balance_after: float,
        metadata: Optional[dict] = None,
    ) -> None:
        """Записать вывод в transactions (type=withdrawal, source=bot)."""
        meta = {'source': 'bot', **(metadata or {})}
        self.add_transaction(
            telegram_id=telegram_id,
            tx_type='withdrawal',
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            game_type=None,
            metadata=meta,
        )

    def add_bot_bet(
        self,
        telegram_id: int,
        bet_id: str,
        game_type: str,
        amount: float,
        payout: float,
        multiplier: float,
        state: str,
        round_id: Optional[str] = None,
        placed_at: Optional[datetime] = None,
        resolved_at: Optional[datetime] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Записать ставку бота в bets + транзакции (bet и win/refund) с source=bot.
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        user_uuid = self._ensure_user_uuid(telegram_id)
        if not user_uuid:
            conn.close()
            return

        try:
            cursor.execute(
                '''
                INSERT INTO bets (
                  id, user_id, round_id, game_type, amount, state,
                  payout, multiplier, metadata, placed_at, resolved_at
                ) VALUES (
                  %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s
                )
                ON CONFLICT (id) DO NOTHING
                ''',
                (
                    bet_id,
                    user_uuid,
                    round_id,
                    game_type,
                    round(amount, 2),
                    state,
                    round(payout, 2) if payout is not None else None,
                    multiplier,
                    psycopg2.extras.Json({'source': 'bot', **(metadata or {})}),
                    placed_at or datetime.utcnow(),
                    resolved_at or datetime.utcnow(),
                ),
            )

            # Транзакция списания ставки
            cursor.execute(
                '''
                INSERT INTO transactions (
                  id, user_id, type, amount, balance_before, balance_after,
                  game_type, game_round_id, created_at, metadata
                ) VALUES (
                  gen_random_uuid(), %s, 'bet', %s, 0, 0,
                  %s, %s, NOW(), %s
                )
                ''',
                (
                    user_uuid,
                    round(amount, 2),
                    game_type,
                    round_id,
                    psycopg2.extras.Json({'betId': bet_id, 'source': 'bot', **(metadata or {})}),
                ),
            )

            # Если есть выплата — транзакция выигрыша
            if payout and payout > 0:
                cursor.execute(
                    '''
                    INSERT INTO transactions (
                      id, user_id, type, amount, balance_before, balance_after,
                      game_type, game_round_id, created_at, metadata
                    ) VALUES (
                      gen_random_uuid(), %s, 'win', %s, 0, 0,
                      %s, %s, NOW(), %s
                    )
                    ''',
                    (
                        user_uuid,
                        round(payout, 2),
                        game_type,
                        round_id,
                        psycopg2.extras.Json({'betId': bet_id, 'source': 'bot', **(metadata or {})}),
                    ),
                )

            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"❌ Failed to write bot bet to Postgres: {e}")
        finally:
            conn.close()
        return user_uuid

    def get_initial_balance(self) -> float:
        return config.INITIAL_BALANCE if config.INITIAL_BALANCE is not None else 0
    
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
        
        # Находим пользователя по telegram_id (Prisma @map)
        cursor.execute('''
            SELECT b.amount 
            FROM balances b
            JOIN users u ON b.user_id = u.id
            WHERE u.telegram_id = %s AND b.demo_mode = false
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
        
        # Обновляем баланс через telegram_id
        cursor.execute('''
            UPDATE balances 
            SET amount = %s, updated_at = NOW()
            WHERE user_id = (
                SELECT id FROM users WHERE telegram_id = %s
            ) AND demo_mode = false
        ''', (amount, user_id))
        
        # Если баланс не существует, создаем его
        if cursor.rowcount == 0:
            cursor.execute('''
                INSERT INTO balances (id, user_id, amount, currency, demo_mode, created_at, updated_at)
                SELECT gen_random_uuid(), id, %s, 'PLN', false, NOW(), NOW()
                FROM users WHERE telegram_id = %s
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

    def add_transaction(
        self,
        telegram_id: int,
        tx_type: str,
        amount: float,
        balance_before: float,
        balance_after: float,
        game_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Optional[str]:
        """Записать транзакцию в общую таблицу transactions."""
        conn = self._get_connection()
        cursor = conn.cursor()
        user_uuid = self._ensure_user_uuid(telegram_id)
        if not user_uuid:
            conn.close()
            return None
        cursor.execute(
            '''
            INSERT INTO transactions (
              id, user_id, type, amount, balance_before, balance_after,
              game_type, created_at, metadata
            ) VALUES (
              gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW(), %s
            )
            RETURNING id
            ''',
            (
                user_uuid,
                tx_type,
                round(amount, 2),
                round(balance_before, 2),
                round(balance_after, 2),
                game_type,
                psycopg2.extras.Json(metadata or {}),
            ),
        )
        tx_id_row = cursor.fetchone()
        conn.commit()
        conn.close()
        return str(tx_id_row[0]) if tx_id_row and tx_id_row[0] is not None else None

    def upsert_cryptobot_invoice(
        self,
        telegram_id: int,
        invoice_id: int,
        amount_usdt: float,
        amount_pln: float,
        rate: float,
        status: str,
        expires_at: Optional[datetime] = None,
        paid_amount: Optional[float] = None,
        paid_at: Optional[datetime] = None,
        credit_tx_id: Optional[str] = None,
    ) -> None:
        """Сохранить или обновить заявку CryptoBot в macvpay_orders."""
        user_uuid = self._ensure_user_uuid(telegram_id)
        if not user_uuid:
            return

        conn = self._get_connection()
        cursor = conn.cursor()
        order_id = f"cryptobot_{invoice_id}"
        expires = expires_at or datetime.utcnow() + timedelta(minutes=30)
        details_payload = json.dumps(
            {
                'source': 'cryptobot',
                'rate': round(rate, 6),
                'amountPln': round(amount_pln, 2),
                'amountUsdt': round(amount_usdt, 2),
                'localCurrency': 'PLN',
            }
        )

        cursor.execute(
            '''
            INSERT INTO macvpay_orders (
              id, user_id, external_id, requested_amount, unique_amount,
              currency, payment_type, status, details, expires_at,
              paid_amount, paid_at, credit_tx_id, created_at, updated_at
            ) VALUES (
              %s, %s, %s, %s, %s,
              %s, 'cryptobot', %s, %s, %s,
              %s, %s, %s, NOW(), NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              requested_amount = EXCLUDED.requested_amount,
              unique_amount = EXCLUDED.unique_amount,
              currency = EXCLUDED.currency,
              status = EXCLUDED.status,
              details = COALESCE(EXCLUDED.details, macvpay_orders.details),
              expires_at = EXCLUDED.expires_at,
              paid_amount = COALESCE(EXCLUDED.paid_amount, macvpay_orders.paid_amount),
              paid_at = COALESCE(EXCLUDED.paid_at, macvpay_orders.paid_at),
              credit_tx_id = COALESCE(EXCLUDED.credit_tx_id, macvpay_orders.credit_tx_id),
              updated_at = NOW()
            ''',
            (
                order_id,
                user_uuid,
                order_id,
                round(amount_usdt, 2),
                round(amount_pln, 2),
                'USDT',
                status,
                details_payload,
                expires,
                None if paid_amount is None else round(paid_amount, 2),
                paid_at,
                credit_tx_id,
            ),
        )
        conn.commit()
        conn.close()
    
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
        cursor.execute('SELECT id FROM users WHERE telegram_id = %s', (user_id,))
        
        if not cursor.fetchone():
            # Создаем пользователя
            cursor.execute('''
                INSERT INTO users (id, telegram_id, created_at, updated_at)
                VALUES (gen_random_uuid(), %s, NOW(), NOW())
                RETURNING id
            ''', (user_id,))
            
            user_uuid = cursor.fetchone()[0]
            
            # Создаем баланс
            cursor.execute('''
                INSERT INTO balances (id, user_id, amount, currency, demo_mode, created_at, updated_at)
                VALUES (gen_random_uuid(), %s, %s, 'PLN', false, NOW(), NOW())
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
        
        update_fields = ['updated_at = NOW()']
        params = []
        
        if username is not None:
            update_fields.append('username = %s')
            params.append(username)
        
        if first_name is not None:
            update_fields.append('first_name = %s')
            params.append(first_name)
        
        params.append(user_id)
        
        cursor.execute(f'''
            UPDATE users 
            SET {', '.join(update_fields)}
            WHERE telegram_id = %s
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
                u.telegram_id as user_id,
                u.username,
                u.first_name,
                COALESCE(b.amount, 0) as balance,
                u.created_at as last_activity
            FROM users u
            LEFT JOIN balances b ON b.user_id = u.id AND b.demo_mode = false
            WHERE u.telegram_id = %s
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
        cursor.execute('SELECT id FROM users WHERE telegram_id = %s', (user_id,))
        user_result = cursor.fetchone()
        
        if user_result:
            user_uuid = user_result[0]
            
            # Получаем текущий баланс для balance_before
            cursor.execute('SELECT amount FROM balances WHERE user_id = %s AND demo_mode = false', (user_uuid,))
            balance_result = cursor.fetchone()
            current_balance = float(balance_result[0]) if balance_result else 0.0
            
            # Создаем транзакцию для ставки
            cursor.execute('''
                INSERT INTO transactions (
                    id, user_id, type, amount, balance_before, balance_after, game_type, created_at
                )
                VALUES (
                    gen_random_uuid(), %s, 'bet', %s, %s, %s, %s, NOW()
                )
            ''', (user_uuid, bet_amount, current_balance, current_balance - bet_amount, game_type))
            
            # Если есть выигрыш, создаем транзакцию выигрыша
            if win_amount > 0:
                new_balance = current_balance - bet_amount + win_amount
                cursor.execute('''
                    INSERT INTO transactions (
                        id, user_id, type, amount, balance_before, balance_after, game_type, created_at
                    )
                    VALUES (
                        gen_random_uuid(), %s, 'win', %s, %s, %s, %s, NOW()
                    )
                ''', (user_uuid, win_amount, current_balance - bet_amount, new_balance, game_type))
        
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
                u.telegram_id,
                u.username,
                u.first_name,
                COALESCE(b.amount, 0),
                0 as turnover
            FROM users u
            LEFT JOIN balances b ON b.user_id = u.id AND b.demo_mode = false
            ORDER BY u.telegram_id
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
        """Получить язык пользователя — дефолт 'ru' если не установлен."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'SELECT bot_language FROM users WHERE telegram_id = %s',
                (user_id,)
            )
            result = cursor.fetchone()
            conn.close()
            if result and result[0]:
                return result[0]
        except Exception:
            # If the column doesn't exist yet (pre-migration) we silently
            # fall through to the default — the language picker will still
            # work, the user just won't have it persisted until the next
            # `set_user_language` call (which auto-creates the column).
            pass
        return 'ru'

    def get_user_language_raw(self, user_id: int) -> Optional[str]:
        """Получить язык пользователя без дефолта — нужен для определения нового пользователя."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'SELECT bot_language FROM users WHERE telegram_id = %s',
                (user_id,)
            )
            result = cursor.fetchone()
            conn.close()
            if result:
                return result[0]
        except Exception:
            pass
        return None

    def set_user_language(self, user_id: int, language: str) -> None:
        """Сохранить выбранный язык пользователя.

        Создаёт колонку `bot_language` лениво — это позволяет работать с
        существующей Prisma-схемой, не требуя переката миграций. DDL
        запускается с autocommit, чтобы не зависеть от состояния
        транзакции и гарантированно отрабатывать на каждом вызове.
        """
        conn = self._get_connection()
        try:
            conn.autocommit = True
            cursor = conn.cursor()
            cursor.execute(
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_language TEXT'
            )
            cursor.execute(
                'UPDATE users SET bot_language = %s WHERE telegram_id = %s',
                (language, user_id)
            )
        finally:
            conn.close()


# Глобальный экземпляр базы данных PostgreSQL
db_postgres = DatabasePostgres()
