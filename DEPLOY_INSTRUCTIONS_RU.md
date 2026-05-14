# Инструкция по запуску на сервере

## Текущая ситуация
✅ Код успешно скачан с GitHub
✅ Backend собран успешно
✅ Frontend собран успешно
❌ pm2 не установлен на сервере

## Вариант 1: Установить pm2 (РЕКОМЕНДУЕТСЯ)

```bash
# Установить pm2 глобально
npm install -g pm2

# Создать конфигурацию pm2
cd /var/www/MACVBET
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/var/www/MACVBET/mini-app/apps/backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: '/var/log/backend-error.log',
      out_file: '/var/log/backend.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'frontend',
      cwd: '/var/www/MACVBET/mini-app/apps/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/frontend-error.log',
      out_file: '/var/log/frontend.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
EOF

# Запустить сервисы
pm2 start ecosystem.config.js

# Сохранить конфигурацию для автозапуска
pm2 save
pm2 startup
```

## Вариант 2: Запуск вручную (БЕЗ pm2)

### Шаг 1: Остановить старые процессы

```bash
# Найти и убить процессы на портах 3000 и 4000
fuser -k 4000/tcp
fuser -k 3000/tcp

# Или найти процессы вручную
lsof -ti:4000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Шаг 2: Запустить Backend

```bash
cd /var/www/MACVBET/mini-app/apps/backend

# Запустить в фоне с перенаправлением логов
nohup node dist/index.js > /var/log/backend.log 2>&1 &

# Сохранить PID процесса
echo $! > /var/run/backend.pid

# Проверить, что запустился
tail -f /var/log/backend.log
# Нажмите Ctrl+C чтобы выйти из просмотра логов
```

### Шаг 3: Запустить Frontend

```bash
cd /var/www/MACVBET/mini-app/apps/frontend

# Запустить в фоне с перенаправлением логов
nohup npm start > /var/log/frontend.log 2>&1 &

# Сохранить PID процесса
echo $! > /var/run/frontend.pid

# Проверить, что запустился
tail -f /var/log/frontend.log
# Нажмите Ctrl+C чтобы выйти из просмотра логов
```

### Шаг 4: Проверить статус

```bash
# Проверить, что процессы запущены
ps aux | grep node

# Проверить, что порты слушаются
netstat -tlnp | grep -E ':(3000|4000)'

# Или
ss -tlnp | grep -E ':(3000|4000)'

# Проверить логи
tail -n 50 /var/log/backend.log
tail -n 50 /var/log/frontend.log
```

## Вариант 3: Использовать systemd (САМЫЙ НАДЕЖНЫЙ)

### Создать systemd сервис для Backend

```bash
cat > /etc/systemd/system/macvbet-backend.service << 'EOF'
[Unit]
Description=MACVBET Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/MACVBET/mini-app/apps/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/backend.log
StandardError=append:/var/log/backend.log
Environment=NODE_ENV=production
Environment=PORT=4000

[Install]
WantedBy=multi-user.target
EOF
```

### Создать systemd сервис для Frontend

```bash
cat > /etc/systemd/system/macvbet-frontend.service << 'EOF'
[Unit]
Description=MACVBET Frontend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/MACVBET/mini-app/apps/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=append:/var/log/frontend.log
StandardError=append:/var/log/frontend.log
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
```

### Запустить systemd сервисы

```bash
# Перезагрузить systemd конфигурацию
systemctl daemon-reload

# Включить автозапуск
systemctl enable macvbet-backend
systemctl enable macvbet-frontend

# Запустить сервисы
systemctl start macvbet-backend
systemctl start macvbet-frontend

# Проверить статус
systemctl status macvbet-backend
systemctl status macvbet-frontend

# Посмотреть логи
journalctl -u macvbet-backend -f
journalctl -u macvbet-frontend -f
```

### Управление systemd сервисами

```bash
# Остановить
systemctl stop macvbet-backend
systemctl stop macvbet-frontend

# Перезапустить
systemctl restart macvbet-backend
systemctl restart macvbet-frontend

# Посмотреть статус
systemctl status macvbet-backend
systemctl status macvbet-frontend

# Посмотреть логи
tail -f /var/log/backend.log
tail -f /var/log/frontend.log
```

## Проверка работы

После запуска любым способом, проверьте:

```bash
# 1. Проверить, что сервисы отвечают
curl http://localhost:4000/health
curl http://localhost:3000

# 2. Проверить через браузер
# Откройте https://macvbet.nl в браузере

# 3. Проверить логи на ошибки
tail -n 100 /var/log/backend.log | grep -i error
tail -n 100 /var/log/frontend.log | grep -i error
```

## Что изменилось в коде

1. **Plinko стенки** - расширены по диагонали, заполняют боковые области
2. **Уведомления о выигрыше** - теперь в правом верхнем углу (toast-стиль)
3. **История ставок** - показывает 10 случайных ставок от всех игроков
4. **MAX КОЭФФ** - исправлен расчет максимального множителя

## Рекомендация

**Используйте Вариант 3 (systemd)** - это самый надежный способ:
- Автоматический перезапуск при падении
- Автозапуск при перезагрузке сервера
- Удобное управление через systemctl
- Централизованные логи

Если нужна помощь с настройкой, дайте знать!
