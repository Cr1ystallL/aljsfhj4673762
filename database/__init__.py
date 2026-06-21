"""Модуль для работы с базой данных"""
import os
from dotenv import load_dotenv

# Загружаем .env файл ПЕРЕД проверкой переменных
load_dotenv()
# Fallback to backend .env for DATABASE_URL if missing
if not os.getenv('DATABASE_URL'):
    load_dotenv('/var/www/MACVBET/mini-app/apps/backend/.env', override=True)

# Выбираем базу данных в зависимости от переменной окружения
USE_POSTGRES = os.getenv('USE_POSTGRES', 'true').lower() in ('true', '1', 'yes')

if USE_POSTGRES:
    from .db_postgres import db_postgres as db
    print("✅ Using PostgreSQL database")
else:
    from .db import db
    print("✅ Using SQLite database")

__all__ = ['db']
