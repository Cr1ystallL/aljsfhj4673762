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


router = Router()

# Состояния для FSM
class DepositStates(StatesGroup):
    waiting_for_amount = State()
    waiting_for_payment = State()


# Хранилище активных инвойсов и заявок на вывод
active_invoices: Dict[int, Dict[str, Any]] = {}


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
        [InlineKeyboardButton(text="Крипта (Прямой перевод)", callback_data="deposit_direct_crypto")],
        [InlineKeyboardButton(text=get_text(lang, 'deposit_cryptobot'), callback_data="deposit_cryptobot")],
        [InlineKeyboardButton(text=get_text(lang, 'btn_back'), callback_data="back_to_profile")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)



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
        rate = float(data.get('rate') or fetch_usdt_pln_rate())
        min_pln = float(data.get('min_pln') or await get_min_deposit_pln())
        min_usdt = float(
            data.get('min_usdt')
            or max(round(min_pln / rate + 1e-8, 2), 0.01)
        )

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
            
            # Добавляем 3% комиссию к сумме инвойса
            invoice_amount = amount * 1.03

            # Создаем инвойс
            invoice = await crypto.create_invoice(
                asset='USDT',
                amount=invoice_amount,
                description=f"Пополнение баланса пользователя {message.from_user.id}"
            )
            
            # Пересчёт в PLN по офиц. курсу чистой суммы (без комиссии)
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

            # Формируем сообщение с обоими номиналами (показываем сумму к оплате с учетом 3%)
            text = get_text(
                lang,
                'deposit_invoice',
                amount_usdt=f"{invoice_amount:.2f}",
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
    
    invoice_data = active_invoices.get(invoice_id)
    crypto = None
    
    try:
        network = Networks.TEST_NET if config.CRYPTOPAY_TESTNET else Networks.MAIN_NET
        crypto = AioCryptoPay(token=config.CRYPTOPAY_TOKEN, network=network)
        invoices = await crypto.get_invoices(invoice_ids=[invoice_id])
        
        if invoices and len(invoices) > 0:
            invoice = invoices[0]
            if invoice.status == 'paid':
                # Оплата прошла
                user_id = invoice_data['user_id'] if invoice_data else callback.from_user.id
                amount_usdt = (
                    invoice_data.get('amount_usdt') if invoice_data else float(invoice.amount)
                )
                rate = invoice_data.get('rate') if invoice_data else fetch_usdt_pln_rate()
                # Если fallback: amount_usdt из invoice.amount уже включает 3% комиссию, вычитаем ее
                fallback_pln = (amount_usdt / 1.03) * rate if not invoice_data else 0
                pln_amount = (
                    invoice_data.get('amount_pln') if invoice_data else fallback_pln
                )

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
                            'invoiceId': invoice_id,
                            'manualCheck': True,
                        },
                    )
                except Exception as e:
                    logging.error(f"Failed to mirror manual deposit to Postgres: {e}")

                try:
                    db_postgres.upsert_cryptobot_invoice(
                        telegram_id=user_id,
                        invoice_id=invoice_id,
                        amount_usdt=amount_usdt,
                        amount_pln=pln_amount,
                        rate=rate,
                        status='paid',
                        paid_amount=pln_amount,
                        paid_at=datetime.utcnow(),
                        credit_tx_id=tx_id,
                    )
                except Exception as e:
                    logging.error(f"Failed to update CryptoBot invoice status (manual): {e}")

                # Удаляем инвойс из активных
                if invoice_id in active_invoices:
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



