# Команды для деплоя на сервере

## 1. Подключитесь к серверу по SSH

```bash
ssh user@your-server.com
```

## 2. Перейдите в директорию проекта

```bash
cd /path/to/your/project
```

## 3. Получите последние изменения из Git

```bash
git pull origin main
```

## 4. Перейдите в директорию backend

```bash
cd mini-app/apps/backend
```

## 5. Установите новые зависимости

```bash
npm install
# или если используете pnpm
pnpm install
```

## 6. Сгенерируйте Prisma Client (если нужно)

```bash
npm run db:generate
# или
pnpm db:generate
```

## 7. Пересоберите проект

```bash
npm run build
# или
pnpm build
```

## 8. Перезапустите backend сервис

### Если используете PM2:
```bash
pm2 restart backend
# или
pm2 restart all
```

### Если используете systemd:
```bash
sudo systemctl restart backend
```

### Если используете Docker:
```bash
cd ../../  # вернитесь в корень mini-app
docker-compose down
docker-compose up -d --build
```

## 9. Проверьте логи

### PM2:
```bash
pm2 logs backend
```

### systemd:
```bash
sudo journalctl -u backend -f
```

### Docker:
```bash
docker-compose logs -f backend
```

## 10. Проверьте работу API

```bash
curl https://macvbet.nl/api/games/plinko/history
```

---

## Что было исправлено:

1. ✅ Добавлен новый API endpoint: `GET /api/games/plinko/history`
2. ✅ Создан общий Prisma Client singleton (`src/lib/prisma.ts`)
3. ✅ Prisma интегрирован как Fastify plugin
4. ✅ Добавлена зависимость `fastify-plugin`
5. ✅ Endpoint поддерживает пагинацию (limit, offset)
6. ✅ Возвращает историю игр пользователя с деталями ставок

## Параметры API:

**Endpoint:** `GET /api/games/plinko/history`

**Query параметры:**
- `limit` (опционально, по умолчанию 20, максимум 100)
- `offset` (опционально, по умолчанию 0)

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bet_id",
      "amount": "10.00",
      "payout": "25.50",
      "multiplier": "2.55",
      "state": "won",
      "metadata": { "riskLevel": "medium" },
      "placedAt": "2026-05-14T10:30:00Z",
      "resolvedAt": "2026-05-14T10:30:01Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```
