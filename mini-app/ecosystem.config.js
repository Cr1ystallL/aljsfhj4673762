/**
 * PM2 Ecosystem — MACVBET
 *
 * Три процесса:
 *   1. backend  — Fastify API + WebSocket (Node.js)
 *   2. frontend — Next.js production server
 *   3. bot      — Python Telegram-бот (aiogram)
 *
 * Запуск:   pm2 start ecosystem.config.js
 * Сохранить: pm2 save
 * Автозапуск: pm2 startup  (выполни команду которую он выведет)
 */

module.exports = {
  apps: [
    /* ------------------------------------------------------------------ */
    /* 1. Node.js Backend (Fastify + WebSocket)                            */
    /* ------------------------------------------------------------------ */
    {
      name: 'macvbet-backend',
      cwd: '/var/www/MACVBET/mini-app/apps/backend',
      script: 'dist/index.js',
      interpreter: 'node',

      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 3000,   // 3s between restarts
      min_uptime: '10s',     // must stay up 10s to count as "started"

      // Environment
      env: {
        NODE_ENV: 'production',
      },

      // Logging
      out_file: '/var/log/macvbet-backend.log',
      error_file: '/var/log/macvbet-backend-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    /* ------------------------------------------------------------------ */
    /* 2. Next.js Frontend                                                 */
    /* ------------------------------------------------------------------ */
    {
      name: 'macvbet-frontend',
      cwd: '/var/www/MACVBET/mini-app/apps/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      interpreter: 'node',

      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 3000,
      min_uptime: '15s',

      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },

      out_file: '/var/log/macvbet-frontend.log',
      error_file: '/var/log/macvbet-frontend-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    /* ------------------------------------------------------------------ */
    /* 3. Python Telegram Bot (aiogram)                                    */
    /* ------------------------------------------------------------------ */
    {
      name: 'macvbet-bot',
      cwd: '/var/www/MACVBET',
      script: 'main.py',
      interpreter: 'python3',

      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      min_uptime: '10s',

      out_file: '/var/log/macvbet-bot.log',
      error_file: '/var/log/macvbet-bot-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
