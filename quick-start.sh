#!/bin/bash

# Quick Start Script for MACVBET
# Запускает backend и frontend без pm2

echo "🚀 Запуск MACVBET сервисов..."

# Остановить старые процессы
echo "⏹️  Остановка старых процессов..."
fuser -k 4000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 2

# Создать директорию для логов если не существует
mkdir -p /var/log

# Запустить Backend
echo "🔧 Запуск Backend на порту 4000..."
cd /var/www/MACVBET/mini-app/apps/backend
nohup node dist/index.js > /var/log/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /var/run/backend.pid
echo "✅ Backend запущен (PID: $BACKEND_PID)"

# Подождать 3 секунды
sleep 3

# Запустить Frontend
echo "🎨 Запуск Frontend на порту 3000..."
cd /var/www/MACVBET/mini-app/apps/frontend
nohup npm start > /var/log/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /var/run/frontend.pid
echo "✅ Frontend запущен (PID: $FRONTEND_PID)"

# Подождать 3 секунды
sleep 3

# Проверить статус
echo ""
echo "📊 Проверка статусов..."
echo ""

if ps -p $BACKEND_PID > /dev/null; then
   echo "✅ Backend работает (PID: $BACKEND_PID)"
else
   echo "❌ Backend не запустился! Проверьте логи: tail -f /var/log/backend.log"
fi

if ps -p $FRONTEND_PID > /dev/null; then
   echo "✅ Frontend работает (PID: $FRONTEND_PID)"
else
   echo "❌ Frontend не запустился! Проверьте логи: tail -f /var/log/frontend.log"
fi

echo ""
echo "📝 Логи:"
echo "   Backend:  tail -f /var/log/backend.log"
echo "   Frontend: tail -f /var/log/frontend.log"
echo ""
echo "🌐 Сайт доступен по адресу: https://macvbet.nl"
echo ""
echo "🛑 Для остановки используйте: ./stop.sh"
