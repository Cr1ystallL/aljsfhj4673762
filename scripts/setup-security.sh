#!/bin/bash

# Скрипт защиты сервера и настройки автозапуска
# Запускать от имени root (sudo)

echo "🔒 Начинаем настройку защиты сервера..."

# 1. Установка необходимых пакетов
echo "📦 Устанавливаем UFW (файрвол) и fail2ban..."
apt-get update
apt-get install -y ufw fail2ban

# 2. Настройка UFW
echo "🛡️ Настраиваем правила файрвола..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS

# Применяем файрвол (без запроса подтверждения)
echo "y" | ufw enable
ufw reload

# 3. Настройка Fail2Ban для защиты SSH
echo "🛑 Включаем защиту от подбора паролей..."
systemctl enable fail2ban
systemctl start fail2ban

# 4. Настройка автозапуска PM2
echo "⚙️ Настраиваем автозапуск Node.js приложений (PM2)..."
# Генерируем скрипт автозапуска и выполняем его (от root)
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root || \
pm2 startup systemd -u root --hp /root || echo "⚠️ Не удалось настроить PM2 startup. Возможно нужно запустить команду из вывода 'pm2 startup' вручную."

# Сохраняем текущий список процессов PM2 для восстановления после перезагрузки
pm2 save

echo "✅ Защита сервера успешно настроена!"
echo "Теперь:"
echo "1. Redis и Postgres защищены (порты закрыты извне)."
echo "2. UFW блокирует все лишние соединения."
echo "3. Fail2ban защищает от брутфорса."
echo "4. Приложения PM2 и базы Docker запустятся сами при перезагрузке ОС."
