"""
Обработчики пополнения баланса через CryptoPay
"""
from aiogram import Router, F
from aiogram.types import CallbackQuery, Message, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
import asyncio
import logging
import json
import time
import urllib.request
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

import redis.asyncio as redis_asyncio
from aiocryptopay import AioCryptoPay, Networks
from config import config
from database.db import db
from database.db_postgres import db_postgres
from locales.translations import get_text, format_amount

_wallet_config_cache: Dict[str, Any] = {'value': None, 'expires': 0.0}
_wallet_cache_lock = asyncio.Lock()
_redis_client: Optional[redis_asyncio.Redis] = None


async def get_redis_client() -> Optional[redis_asyncio.Redis]:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        _redis_client = redis_asyncio.from_url(
            config.REDIS_URL,
            encoding='utf-8',
            decode_responses=True,
        )
    except Exception as e:
        logging.error(f"Failed to init Redis client: {e}")
        _redis_client = None
    return _redis_client


async def get_min_deposit_pln() -> float:
    now = time.time()
    cached = _wallet_config_cache.get('value')
    expires = _wallet_config_cache.get('expires', 0.0)
    if cached is not None and expires > now:
        try:
            return float(cached)
        except (TypeError, ValueError):
            pass

    async with _wallet_cache_lock:
        cached = _wallet_config_cache.get('value')
        expires = _wallet_config_cache.get('expires', 0.0)
        if cached is not None and expires > time.time():
            try:
                return float(cached)
            except (TypeError, ValueError):
                pass

        min_deposit = 10.0
        client = await get_redis_client()
        if client is not None:
            try:
                raw = await client.get('wallet_config')
                if raw:
                    data = json.loads(raw)
                    value = data.get('minDeposit')
                    if isinstance(value, (int, float)):
                        min_deposit = float(value)
                    elif isinstance(value, str):
                        parsed = float(value.replace(',', '.'))
                        if parsed > 0:
                            min_deposit = parsed
            except Exception as e:
                logging.error(f"Failed to fetch wallet config: {e}")

        _wallet_config_cache['value'] = min_deposit
        _wallet_config_cache['expires'] = time.time() + 30
        return min_deposit


async def lock_withdrawal(user_id: int, withdrawal_id: int, amount_usdt: float, amount_rub: float, bot):
    await asyncio.sleep(300) # 5 минут холд
    wid_data = db.get_withdrawal(withdrawal_id)
    if wid_data and wid_data['status'] == 'pending_block':
        db.update_withdrawal_status(withdrawal_id, 'cancelled')
        db.confirm_held_balance(user_id, amount_rub) # списываем холд безвозвратно
        try:
            current_bal = db.get_balance(user_id)
            db_postgres.add_withdrawal(
                telegram_id=user_id,
                amount=amount_rub,
                balance_before=current_bal + amount_rub,
                balance_after=current_bal,
                metadata={'withdrawal_id': withdrawal_id, 'usdt': amount_usdt, 'status': 'blocked_forfeit'}
            )
        except Exception as e:
            logging.error(f"Failed to record blocked withdrawal in Postgres: {e}")
        try:
            lang = db.get_user_language(user_id)
            kbd = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=get_text(lang, 'btn_support'), url="https://t.me/macvbet_support")]
            ])
            await bot.send_message(user_id, get_text(lang, 'withdraw_blocked'), reply_markup=kbd)
        except:
            pass
        if withdrawal_id in active_withdrawals:
            del active_withdrawals[withdrawal_id]

async def restore_pending_withdrawals(bot):
    """Восстанавливает блокировки вывода после перезапуска бота"""
    try:
        from database.db import db
        pending = db.get_pending_block_withdrawals()
        for item in pending:
            wid = item['id']
            user_id = item['user_id']
            amount_usdt = item['amount']
            rate = fetch_usdt_pln_rate()
            amount_rub = amount_usdt * rate
            # Перезапускаем таймер на 5 минут
            asyncio.create_task(lock_withdrawal(user_id, wid, amount_usdt, amount_rub, bot))
    except Exception as e:
        logging.error(f"Error restoring withdrawals: {e}")

router = Router()

# Состояния для FSM
class DepositStates(StatesGroup):
    waiting_for_amount = State()
    waiting_for_payment = State()

class WithdrawalStates(StatesGroup):
    waiting_for_amount = State()
    waiting_for_check = State()

# Хранилище активных инвойсов и заявок на вывод
active_invoices: Dict[int, Dict[str, Any]] = {}
active_withdrawals: Dict[int, Dict[str, Any]] = {}  # {withdrawal_id: {user_id, amount_usdt, amount_rub, method}}


def fetch_usdt_pln_rate() -> float:
    """Получить курс USDT→PLN с exchangerate.host; fallback 3.9"""
    try:
        with urllib.request.urlopen("https://api.exchangerate.host/latest?base=USD&symbols=PLN", timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            rate = float(data.get("rates", {}).get("PLN") or 0)
            if rate > 0:
                return rate
    except Exception:
        pass
    return 3.9


def get_deposit_methods_keyboard(lang: str) -> InlineKeyboardMarkup:
    """Клавиатура выбора способа пополнения"""
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'deposit_cryptobot'), callback_data="deposit_cryptobot")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_profile")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_withdrawal_methods_keyboard(lang: str) -> InlineKeyboardMarkup:
    """Клавиатура выбора способа вывода"""
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'withdraw_cryptobot'), callback_data="withdraw_cryptobot")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_profile")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_withdraw_amount_cancel_keyboard(lang: str) -> InlineKeyboardMarkup:
    """Отмена ввода суммы вывода"""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=get_text(lang, 'btn_withdraw_cancel'), callback_data="cancel_withdraw_input")]
        ]
    )


def get_invoice_keyboard(lang: str, pay_url: str, invoice_id: int) -> InlineKeyboardMarkup:
    """Клавиатура для оплаты инвойса"""
    keyboard = [
        [InlineKeyboardButton(text=get_text(lang, 'btn_open_invoice'), url=pay_url)],
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_check_payment'), callback_data=f"check_payment:{invoice_id}"),
            InlineKeyboardButton(text=get_text(lang, 'btn_cancel_payment'), callback_data=f"cancel_payment:{invoice_id}")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


@router.callback_query(F.data == "deposit_balance")
async def deposit_balance(callback: CallbackQuery):
    """Показать способы пополнения"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    text = get_text(lang, 'deposit_title')
    
    await callback.message.edit_text(text, reply_markup=get_deposit_methods_keyboard(lang))
    await callback.answer()


@router.callback_query(F.data == "back_to_profile")
async def back_to_profile(callback: CallbackQuery):
    """Вернуться к профилю"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    balance = db.get_balance(user_id)
    
    profile_text = get_text(lang, 'profile_balance', balance=format_amount(balance))
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text=get_text(lang, 'btn_deposit'), callback_data="deposit_balance"),
            InlineKeyboardButton(text=get_text(lang, 'btn_withdraw'), callback_data="withdraw_balance")
        ]
    ])
    
    await callback.message.edit_text(profile_text, reply_markup=keyboard)
    await callback.answer()


@router.callback_query(F.data == "deposit_cryptobot")
async def deposit_cryptobot(callback: CallbackQuery, state: FSMContext):
    """Начать процесс пополнения через CryptoBot"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    
    rate = fetch_usdt_pln_rate()
    min_pln = await get_min_deposit_pln()
    min_usdt = max(round(min_pln / rate + 1e-8, 2), 0.01)

    text = get_text(
        lang,
        'deposit_enter_amount',
        min_amount=f"{min_usdt:.2f}",
        min_pln=f"{min_pln:.2f}",
    )
    msg = await callback.message.edit_text(text)
    await state.update_data(
        prompt_message_id=msg.message_id,
        min_usdt=min_usdt,
        min_pln=min_pln,
        rate=rate,
    )
    await state.set_state(DepositStates.waiting_for_amount)
    await callback.answer()


@router.message(DepositStates.waiting_for_amount)
async def process_deposit_amount(message: Message, state: FSMContext):
    """Обработка введенной суммы"""
    user_id = message.from_user.id
    lang = db.get_user_language(user_id)
    
    try:
        amount = float(message.text)
        
        # Проверяем минимальный депозит из состояния
        data = await state.get_data()
        min_usdt = float(data.get('min_usdt', 3.61))
        min_pln = float(data.get('min_pln', min_usdt * fetch_usdt_pln_rate()))
        rate = float(data.get('rate', fetch_usdt_pln_rate()))

        if amount < min_usdt:
            await message.answer(
                get_text(
                    lang,
                    'deposit_min_amount',
                    min_amount=f"{min_usdt:.2f}",
                    min_pln=f"{min_pln:.2f}",
                )
            )
            return
        
        # Получаем ID сообщения с запросом суммы
        data = await state.get_data()
        prompt_message_id = data.get('prompt_message_id')
        
        # Удаляем сообщение пользователя с суммой
        try:
            await message.delete()
        except:
            pass
        
        # Удаляем сообщение с запросом суммы
        try:
            if prompt_message_id:
                await message.bot.delete_message(message.chat.id, prompt_message_id)
        except:
            pass
        
        # Отправляем эмодзи часов
        clock_msg = await message.answer(get_text(lang, 'deposit_creating'))
        
        # Используем курс из состояния или общий, чтобы совпадала конвертация
        rate = float(data.get('rate', fetch_usdt_pln_rate()))

        # Создаем инвойс через CryptoPay
        if not config.CRYPTOPAY_TOKEN:
            await clock_msg.edit_text(get_text(lang, 'deposit_not_configured'))
            await state.clear()
            return
        
        crypto = None
        try:
            network = Networks.TEST_NET if config.CRYPTOPAY_TESTNET else Networks.MAIN_NET
            crypto = AioCryptoPay(token=config.CRYPTOPAY_TOKEN, network=network)
            
            # Создаем инвойс
            invoice = await crypto.create_invoice(
                asset='USDT',
                amount=amount,
                description=f"Пополнение баланса пользователя {message.from_user.id}"
            )
            
            # Пересчёт в PLN по офиц. курсу
            pln_amount = amount * rate
            
            # Сохраняем инвойс
            active_invoices[invoice.invoice_id] = {
                'user_id': message.from_user.id,
                'amount_usdt': amount,
                'amount_pln': pln_amount,
                'rate': rate,
                'min_usdt': min_usdt,
                'min_pln': min_pln,
                'created_at': datetime.utcnow(),
                'invoice': invoice,
            }

            try:
                db_postgres.upsert_cryptobot_invoice(
                    telegram_id=message.from_user.id,
                    invoice_id=invoice.invoice_id,
                    amount_usdt=amount,
                    amount_pln=pln_amount,
                    rate=rate,
                    status='pending',
                    expires_at=datetime.utcnow() + timedelta(minutes=30),
                )
            except Exception as e:
                logging.error(f"Failed to upsert pending CryptoBot invoice: {e}")

            # Формируем сообщение с обоими номиналами
            text = get_text(
                lang,
                'deposit_invoice',
                amount_usdt=f"{amount:.2f}",
                amount_pln=f"{pln_amount:.2f}",
            )
            
            await clock_msg.edit_text(
                text,
                reply_markup=get_invoice_keyboard(lang, invoice.bot_invoice_url, invoice.invoice_id)
            )
            
            # Сохраняем данные в состояние
            await state.update_data(invoice_id=invoice.invoice_id, message_id=clock_msg.message_id)
            await state.set_state(DepositStates.waiting_for_payment)
            
            # Запускаем автопроверку каждые 10 секунд
            asyncio.create_task(auto_check_payment(message.from_user.id, invoice.invoice_id, clock_msg))
            
        except Exception as e:
            logging.error(f"CryptoPay create_invoice error: {e}")
            error_msg = str(e)
            if "401" in error_msg or "UNAUTHORIZED" in error_msg.upper():
                error_msg += "\n\n⚠️ Скорее всего, указан недействительный токен, либо он от другой сети (Testnet/Mainnet)."
            await clock_msg.edit_text(f"❌ Ошибка создания инвойса: {error_msg}")
            await state.clear()
        finally:
            if crypto:
                await crypto.close()
            
    except ValueError:
        await message.answer(get_text(lang, 'deposit_invalid_amount'))


async def auto_check_payment(user_id: int, invoice_id: int, message: Message):
    """Автоматическая проверка оплаты каждые 10 секунд"""
    lang = db.get_user_language(user_id)
    
    for _ in range(180):  # 30 минут = 180 проверок по 10 секунд
        await asyncio.sleep(10)
        
        if invoice_id not in active_invoices:
            break
        
        invoice_data = active_invoices[invoice_id]
        crypto = None
        
        try:
            network = Networks.TEST_NET if config.CRYPTOPAY_TESTNET else Networks.MAIN_NET
            crypto = AioCryptoPay(token=config.CRYPTOPAY_TOKEN, network=network)
            invoices = await crypto.get_invoices(invoice_ids=[invoice_id])
            
            if invoices and len(invoices) > 0:
                invoice = invoices[0]
                if invoice.status == 'paid':
                    # Оплата прошла
                    pln_amount = invoice_data['amount_pln']
                    amount_usdt = invoice_data['amount_usdt']
                    rate = invoice_data['rate']
                    
                    # Начисляем баланс (ботовая SQLite) + синхроним в Postgres
                    new_balance = db.add_balance(user_id, pln_amount)
                    db.add_deposit_amount_to_lose(user_id, pln_amount)
                    tx_id = None
                    try:
                        before = new_balance - pln_amount
                        tx_id = db_postgres.add_transaction(
                            telegram_id=user_id,
                            tx_type='deposit',
                            amount=amount_usdt,
                            balance_before=before,
                            balance_after=new_balance,
                            game_type=None,
                            metadata={
                                'provider': 'cryptobot',
                                'source': 'bot',
                                'currency': 'USDT',
                                'amountLocal': round(pln_amount, 2),
                                'fxRate': rate,
                                'invoiceId': invoice.invoice_id,
                            },
                        )
                    except Exception as e:
                        logging.error(f"Failed to mirror deposit to Postgres: {e}")

                    try:
                        db_postgres.upsert_cryptobot_invoice(
                            telegram_id=user_id,
                            invoice_id=invoice.invoice_id,
                            amount_usdt=amount_usdt,
                            amount_pln=pln_amount,
                            rate=rate,
                            status='paid',
                            paid_amount=pln_amount,
                            paid_at=datetime.utcnow(),
                            credit_tx_id=tx_id,
                        )
                    except Exception as e:
                        logging.error(f"Failed to update CryptoBot invoice status: {e}")
                    
                    # Проверяем бонус на депозит
                    if db.get_dep_bonus_state(user_id) == 1:
                        db.set_dep_bonus_state(user_id, 2)
                        db.set_bonus_wager(user_id, pln_amount)
                        try:
                            await message.bot.send_message(
                                chat_id=user_id,
                                text=get_text(lang, 'deposit_bonus_activated', amount=f"{amount_usdt:.2f}")
                            )
                        except:
                            pass
                    
                    balance_pln = new_balance
                    balance_usdt = balance_pln / rate if rate else amount_usdt
                    await message.edit_text(
                        get_text(
                            lang,
                            'deposit_success',
                            amount_usdt=f"{amount_usdt:.2f}",
                            amount_pln=f"{pln_amount:.2f}",
                            balance_usdt=f"{balance_usdt:.2f}",
                            balance_pln=f"{balance_pln:.2f}",
                        )
                    )
                    
                    # Удаляем инвойс из активных
                    del active_invoices[invoice_id]
                    break
                
        except Exception as e:
            logging.error(f"CryptoPay auto_check error: {e}")
            pass
        finally:
            if crypto:
                await crypto.close()


@router.callback_query(F.data.startswith("check_payment:"))
async def check_payment(callback: CallbackQuery):
    """Ручная проверка оплаты"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    invoice_id = int(callback.data.split(":")[1])
    
    if invoice_id not in active_invoices:
        await callback.answer("❌ Инвойс не найден", show_alert=True)
        return
    
    invoice_data = active_invoices[invoice_id]
    crypto = None
    
    try:
        network = Networks.TEST_NET if config.CRYPTOPAY_TESTNET else Networks.MAIN_NET
        crypto = AioCryptoPay(token=config.CRYPTOPAY_TOKEN, network=network)
        invoices = await crypto.get_invoices(invoice_ids=[invoice_id])
        
        if invoices and len(invoices) > 0:
            invoice = invoices[0]
            if invoice.status == 'paid':
                # Оплата прошла
                user_id = invoice_data['user_id']
                pln_amount = invoice_data.get('amount_pln', 0)
                amount_usdt = invoice_data.get('amount_usdt', 0)
                rate = invoice_data.get('rate') or fetch_usdt_pln_rate()

                # Начисляем баланс
                new_balance = db.add_balance(user_id, pln_amount)
                db.add_deposit_amount_to_lose(user_id, pln_amount)
                
                # Проверяем бонус на депозит
                if db.get_dep_bonus_state(user_id) == 1:
                    db.set_dep_bonus_state(user_id, 2)
                    db.set_bonus_wager(user_id, pln_amount)
                    try:
                        await callback.bot.send_message(
                            chat_id=user_id,
                            text=get_text(lang, 'deposit_bonus_activated', amount=f"{amount_usdt:.2f}")
                        )
                    except:
                        pass
                
                balance_pln = new_balance
                balance_usdt = balance_pln / rate if rate else amount_usdt
                await callback.message.edit_text(
                    get_text(
                        lang,
                        'deposit_success',
                        amount_usdt=f"{amount_usdt:.2f}",
                        amount_pln=f"{pln_amount:.2f}",
                        balance_usdt=f"{balance_usdt:.2f}",
                        balance_pln=f"{balance_pln:.2f}",
                    )
                )

                try:
                    before = new_balance - pln_amount
                    db_postgres.add_transaction(
                        telegram_id=user_id,
                        tx_type='deposit',
                        amount=amount_usdt,
                        balance_before=before,
                        balance_after=new_balance,
                        game_type=None,
                        metadata={
                            'provider': 'cryptobot',
                            'source': 'bot',
                            'currency': 'USDT',
                            'amountLocal': round(pln_amount, 2),
                            'fxRate': rate,
                            'invoiceId': invoice_id,
                            'manualCheck': True,
                        },
                    )
                except Exception as e:
                    logging.error(f"Failed to mirror manual deposit to Postgres: {e}")

                # Удаляем инвойс из активных
                del active_invoices[invoice_id]
                await callback.answer("✅ Оплата подтверждена!")
            else:
                await callback.answer(get_text(lang, 'deposit_pending'), show_alert=True)
        else:
            await callback.answer("❌ Инвойс не найден", show_alert=True)
            
    except Exception as e:
        logging.error(f"CryptoPay check_payment error: {e}")
        await callback.answer(f"❌ Ошибка проверки: {str(e)}", show_alert=True)
    finally:
        if crypto:
            await crypto.close()


@router.callback_query(F.data.startswith("cancel_payment:"))
async def cancel_payment(callback: CallbackQuery, state: FSMContext):
    """Отмена оплаты"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    invoice_id = int(callback.data.split(":")[1])
    
    if invoice_id in active_invoices:
        info = active_invoices.pop(invoice_id)
        try:
            db_postgres.upsert_cryptobot_invoice(
                telegram_id=user_id,
                invoice_id=invoice_id,
                amount_usdt=info.get('amount_usdt', 0.0),
                amount_pln=info.get('amount_pln', 0.0),
                rate=info.get('rate', fetch_usdt_pln_rate()),
                status='cancelled',
            )
        except Exception as e:
            logging.error(f"Failed to mark CryptoBot invoice cancelled: {e}")
    
    await callback.message.edit_text(get_text(lang, 'deposit_cancelled'))
    await state.clear()
    await callback.answer()



# ============= ВЫВОД СРЕДСТВ =============

@router.callback_query(F.data == "withdraw_balance")
async def withdraw_balance(callback: CallbackQuery):
    """Показать способы вывода"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    text = get_text(lang, 'withdraw_title')
    
    await callback.message.edit_text(text, reply_markup=get_withdrawal_methods_keyboard(lang))
    await callback.answer()


@router.callback_query(F.data == "withdraw_cryptobot")
async def withdraw_cryptobot(callback: CallbackQuery, state: FSMContext):
    """Начать процесс вывода через CryptoBot"""
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    balance_rub = db.get_available_balance(user_id)
    
    # Получаем актуальный курс USDT→PLN
    usdt_rate = fetch_usdt_pln_rate()
    balance_usdt = balance_rub / usdt_rate
    
    text = get_text(lang, 'withdraw_enter_amount', available=f"{balance_usdt:.2f}")

    msg = await callback.message.edit_text(text, reply_markup=get_withdraw_amount_cancel_keyboard(lang))
    await state.update_data(
        prompt_message_id=msg.message_id,
        available_usdt=balance_usdt,
        usdt_rate=usdt_rate
    )
    await state.set_state(WithdrawalStates.waiting_for_amount)
    await callback.answer()


@router.callback_query(F.data == "cancel_withdraw_input")
async def cancel_withdraw_input(callback: CallbackQuery, state: FSMContext):
    """Отмена ввода суммы вывода (кнопка)"""
    await state.clear()
    user_id = callback.from_user.id
    lang = db.get_user_language(user_id)
    balance = db.get_balance(user_id)
    profile_text = get_text(lang, 'profile_balance', balance=format_amount(balance))
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=get_text(lang, 'btn_deposit'), callback_data="deposit_balance"),
                InlineKeyboardButton(text=get_text(lang, 'btn_withdraw'), callback_data="withdraw_balance"),
            ]
        ]
    )
    await callback.message.edit_text(profile_text, reply_markup=keyboard)
    await callback.answer()


@router.message(WithdrawalStates.waiting_for_amount)
async def process_withdrawal_amount(message: Message, state: FSMContext):
    """Обработка введенной суммы для вывода"""
    user_id = message.from_user.id
    lang = db.get_user_language(user_id)
    
    try:
        amount_usdt = float(message.text)
        
        # Получаем данные
        data = await state.get_data()
        available_usdt = data.get('available_usdt', 0)
        usdt_rate = data.get('usdt_rate', 83.23)
        prompt_message_id = data.get('prompt_message_id')
        
        # Минимум 5 USDT
        if amount_usdt < 5:
            error_msg = await message.answer(get_text(lang, 'withdraw_min_amount'))
            try:
                await message.delete()
            except:
                pass
            await asyncio.sleep(3)
            try:
                await error_msg.delete()
            except:
                pass
            return
        
        # Проверка достаточности средств
        if amount_usdt > available_usdt:
            error_msg = await message.answer(get_text(lang, 'withdraw_insufficient', available=f"{available_usdt:.2f}"))
            try:
                await message.delete()
            except:
                pass
            await asyncio.sleep(3)
            try:
                await error_msg.delete()
            except:
                pass
            return
        
        # Новые проверки!
        if db.get_active_withdrawals_count(user_id) > 0:
            error_msg = await message.answer(get_text(lang, 'withdraw_active_exists'))
            try: await message.delete()
            except: pass
            await asyncio.sleep(3)
            try: await error_msg.delete()
            except: pass
            return
            
        if db.get_active_bonus_bets(user_id) > 0:
            error_msg = await message.answer(get_text(lang, 'withdraw_active_bonus'))
            try: await message.delete()
            except: pass
            await asyncio.sleep(3)
            try: await error_msg.delete()
            except: pass
            return

        amount_rub = amount_usdt * usdt_rate
        
        if not db.hold_balance(user_id, amount_rub):
            error_msg = await message.answer(get_text(lang, 'withdraw_hold_error'))
            try: await message.delete()
            except: pass
            await asyncio.sleep(3)
            try: await error_msg.delete()
            except: pass
            return
        
        try: await message.delete()
        except: pass
        try:
            if prompt_message_id:
                await message.bot.delete_message(message.chat.id, prompt_message_id)
        except: pass
        
        amount_to_lose = db.get_amount_to_lose(user_id)
        is_blocked = amount_to_lose > 0
        
        # Создаем заявку в БД
        status = 'pending_block' if is_blocked else 'pending_admin'
        wid = db.create_withdrawal(user_id, amount_usdt, status)
        
        active_withdrawals[wid] = {
            'user_id': user_id,
            'amount_usdt': amount_usdt,
            'amount_rub': amount_rub,
            'method': 'CryptoBot',
            'username': message.from_user.username or 'Без username',
            'first_name': message.from_user.first_name or 'Пользователь'
        }
        
        if not is_blocked:
            db.reset_wager_and_bonus(user_id)

        if config.WITHDRAWAL_GROUP_ID:
            group_text = (
                f"💸 <b>Новая заявка на вывод {wid}</b>\n\n"
                f"👤 Пользователь: {message.from_user.first_name}\n"
                f"🆔 ID: <code>{user_id}</code>\n"
                f"📱 Username: @{message.from_user.username or 'нет'}\n\n"
                f"💰 Сумма: {amount_usdt} USDT (≈ {amount_rub:.2f} RUB)\n"
                f"🌐 Метод: CryptoBot (@send)\n\n"
            )
            
            if is_blocked:
                group_text += f"\n⚠️ <b>ВНИМАНИЕ: Пользователь не отыграл депозит!</b> Осталось: {amount_to_lose:.2f} RUB\n"
                group_text += "Вывод будет автоматически заблокирован через 5 минут.\n"
                keyboard = None
                asyncio.create_task(lock_withdrawal(user_id, wid, amount_usdt, amount_rub, message.bot))
            else:
                group_text += f"<i>Ответьте на это сообщение ссылкой с чеком для подтверждения</i>"
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="❌ Отклонить", callback_data=f"reject_withdrawal:{wid}")]
                ])
            
            try:
                group_msg = await message.bot.send_message(
                    config.WITHDRAWAL_GROUP_ID,
                    group_text,
                    reply_markup=keyboard
                )
                active_withdrawals[wid]['group_message_id'] = group_msg.message_id
            except Exception as e:
                db.release_held_balance(user_id, amount_rub)
                db.update_withdrawal_status(wid, 'cancelled')
                del active_withdrawals[wid]
                await message.answer(f"❌ Ошибка отправки заявки: {str(e)}")
                await state.clear()
                return
        
        user_text = get_text(lang, 'withdraw_created', amount=amount_usdt)
        
        await message.answer(user_text)
        await state.clear()
        
    except ValueError:
        await message.answer(get_text(lang, 'deposit_invalid_amount'))


@router.callback_query(F.data.startswith("reject_withdrawal:"))
async def reject_withdrawal(callback: CallbackQuery):
    """Отклонить заявку на вывод"""
    withdrawal_id = int(callback.data.split(":")[1])
    
    if withdrawal_id not in active_withdrawals:
        await callback.answer("❌ Заявка не найдена", show_alert=True)
        return
    
    withdrawal_data = active_withdrawals[withdrawal_id]
    user_id = withdrawal_data['user_id']
    lang = db.get_user_language(user_id)
    amount_rub = withdrawal_data['amount_rub']
    amount_usdt = withdrawal_data['amount_usdt']
    
    # Возвращаем средства и ставим статус отменен
    db.release_held_balance(user_id, amount_rub)
    db.update_withdrawal_status(withdrawal_id, 'cancelled')
    
    # Уведомляем пользователя
    try:
        await callback.bot.send_message(
            user_id,
            get_text(lang, 'withdraw_rejected', amount=amount_usdt)
        )
    except:
        pass
    
    # Обновляем сообщение в группе
    await callback.message.edit_text(
        callback.message.text + "\n\n❌ <b>ОТКЛОНЕНО</b>",
        reply_markup=None
    )
    
    # Удаляем заявку
    del active_withdrawals[withdrawal_id]
    
    await callback.answer("✅ Заявка отклонена, средства возвращены")


@router.message(F.reply_to_message)
async def confirm_withdrawal_with_check(message: Message):
    """Подтверждение вывода ссылкой на чек"""
    # Проверяем, что это ответ на сообщение о выводе
    if not message.reply_to_message:
        return
    
    reply_text = message.reply_to_message.text or message.reply_to_message.caption or ""
    
    if "Новая заявка на вывод" not in reply_text:
        return
    
    # Проверяем что в сообщении есть ссылка
    if "t.me/" not in message.text and "https://" not in message.text:
        await message.answer("❌ Отправьте ссылку на чек")
        return
    
    # Извлекаем ID заявки из текста сообщения
    try:
        # Ищем ID пользователя в сообщении
        import re
        user_id_match = re.search(r'ID: <code>(\d+)</code>', reply_text)
        if not user_id_match:
            await message.answer("❌ Не удалось найти ID пользователя в заявке")
            return
        
        user_id = int(user_id_match.group(1))
        lang = db.get_user_language(user_id)
        
        # Ищем заявку этого пользователя
        withdrawal_id = None
        withdrawal_data = None
        for wid, wdata in active_withdrawals.items():
            if wdata['user_id'] == user_id:
                withdrawal_id = wid
                withdrawal_data = wdata
                break
        
        if not withdrawal_id or not withdrawal_data:
            await message.answer("❌ Заявка не найдена или уже обработана")
            return
        
        amount_rub = withdrawal_data['amount_rub']
        amount_usdt = withdrawal_data['amount_usdt']
        check_url = message.text.strip()
        
        # Подтверждаем вывод (списываем с held_balance)
        db.confirm_held_balance(user_id, amount_rub)
        db.update_withdrawal_status(withdrawal_id, 'completed')
        
        # Записываем в Postgres
        try:
            current_bal = db.get_balance(user_id)
            db_postgres.add_withdrawal(
                telegram_id=user_id,
                amount=amount_rub,
                balance_before=current_bal + amount_rub,
                balance_after=current_bal,
                metadata={'withdrawal_id': withdrawal_id, 'usdt': amount_usdt, 'status': 'completed', 'check_url': check_url}
            )
        except Exception as e:
            logging.error(f"Failed to record withdrawal in Postgres: {e}")
        
        # Отправляем чек пользователю
        user_text = get_text(lang, 'withdraw_approved', amount=amount_usdt)
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=get_text(lang, 'btn_get_funds'), url=check_url)]
        ])
        
        try:
            await message.bot.send_message(
                user_id,
                user_text,
                reply_markup=keyboard
            )
        except Exception as e:
            await message.answer(f"❌ Ошибка отправки пользователю: {str(e)}")
            # Возвращаем средства если не удалось отправить
            db.release_held_balance(user_id, amount_rub)
            return
        
        # Обновляем сообщение в группе
        try:
            await message.reply_to_message.edit_text(
                reply_text + "\n\n✅ <b>ПОДТВЕРЖДЕНО</b>",
                reply_markup=None
            )
        except:
            pass
        
        # Удаляем заявку
        del active_withdrawals[withdrawal_id]
        
        await message.answer("✅ Вывод подтвержден, чек отправлен пользователю")
        
    except Exception as e:
        await message.answer(f"❌ Ошибка обработки: {str(e)}")
