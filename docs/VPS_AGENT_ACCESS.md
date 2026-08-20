# Как дать ИИ-агенту доступ к VPS

По умолчанию агент к серверу не подключается: он готовит команды, а вы выполняете их сами по SSH
(правило из `AI_RULES.md`). Этот документ описывает, как выдать агенту прямой доступ, если вы
хотите, чтобы он сам читал логи, диагностировал прод и деплоил.

## Что уже проверено

Облачный агент запускается на отдельной Linux-VM без ограничений исходящего трафика. С неё
`163.5.41.97` доступен по портам 22, 80 и 443, `ssh` клиент установлен. То есть технических
препятствий нет — вопрос только в выдаче учётных данных.

Важное ограничение: **IP облачной VM не фиксирован**. Он меняется от запуска к запуску, поэтому
привязать доступ к конкретному адресу в `ufw` не получится. Защита строится на ключе и на
ограничении прав пользователя, а не на белом списке адресов.

## Три варианта, от безопасного к удобному

| Вариант | Что может агент | Риск | Кому подойдёт |
| --- | --- | --- | --- |
| **A. Отдельный пользователь + узкий sudo через обёртку** | Смотреть логи и статус, делать `git pull`, пересобирать и перезапускать процессы — и больше ничего | Низкий: набор операций зафиксирован скриптом на сервере | Рекомендуемый по умолчанию |
| **B. Отдельный пользователь + полный NOPASSWD sudo** | Всё, что может root | Высокий: ошибка агента = ошибка на проде с правами root | Только если нужна свободная диагностика и вы готовы контролировать каждый шаг |
| **C. Деплой через GitHub Actions** | Ничего напрямую; сервер сам забирает смёрдженный код | Минимальный: ключ живёт в GitHub, а не у агента | Если нужен только автодеплой, без диагностики |

Ниже расписан вариант **A**. Он же ставит фундамент для B — достаточно расширить строку в sudoers.

## Шаг 1. Выполните скрипт на VPS

Скрипт создаёт пользователя `cursoragent`, генерирует ему SSH-ключ, кладёт публичную часть в
`authorized_keys`, ставит обёртку `/usr/local/bin/macvbet-agent` с разрешённым набором операций и
разрешает вызывать её через sudo без пароля. В конце он печатает приватный ключ в base64 — его
нужно скопировать.

Готовый блок команд — в конце документа, в разделе «Скрипт для сервера».

> ⚠️ Приватный ключ печатается в терминал один раз. Скопируйте его сразу и не оставляйте в истории
> буфера обмена дольше, чем нужно.

## Шаг 2. Добавьте секреты в Cursor

Откройте [Cursor Dashboard](https://cursor.com/dashboard) → **Cloud Agents** → **Secrets** и заведите:

| Имя | Значение |
| --- | --- |
| `VPS_HOST` | `163.5.41.97` |
| `VPS_USER` | `cursoragent` |
| `VPS_PORT` | `22` (или ваш нестандартный порт) |
| `VPS_SSH_KEY` | приватный ключ в base64 — то, что напечатал скрипт |
| `VPS_HOST_KEY` | строка из `ssh-keyscan`, которую тоже напечатал скрипт (защита от MITM) |

Секреты хранятся между запусками и прокидываются в новые VM агента как переменные окружения.
Их можно задать на уровне пользователя или команды; пользовательские перекрывают командные.

> Для **публичных** репозиториев подстановка секретов может быть отключена по умолчанию —
> в настройках нужно явно разрешить её для этого репозитория. Репозиторий `aljsfhj4673762`
> сейчас приватный, так что это не проблема.

## Шаг 3. Проверьте

Попросите агента в новой задаче выполнить:

```bash
./scripts/agent_vps.sh check
```

Он подключится, покажет hostname, аптайм, свободное место и `pm2 status`. Дальше доступны:

```bash
./scripts/agent_vps.sh run 'pm2 status'
./scripts/agent_vps.sh logs macvbet-backend 200
./scripts/agent_vps.sh run 'sudo /usr/local/bin/macvbet-agent deploy'
```

Как агент должен себя вести с этим доступом (что можно читать без спроса, что требует явного
подтверждения, чего нельзя делать никогда) — описано в скилле `.cursor/skills/vps-access/SKILL.md`,
он подхватывается автоматически.

## Как отозвать доступ

Удалите ключ из `/home/cursoragent/.ssh/authorized_keys` (или пользователя целиком) и сотрите
секреты в Cursor Dashboard. Ключ живёт только в двух местах — на сервере и в секретах Cursor.

## Что стоит сделать до выдачи доступа

Независимо от варианта, эти вещи касаются безопасности сервера в целом:

1. **`.env` с боевыми секретами закоммичен в git** (`BOT_TOKEN`, `DATABASE_URL`, `DB_OPS_PASSWORD`,
   `CRYPTOPAY_TOKEN`, ID админов). Учитывая историю с заражением сервера через RCE в Next.js,
   токены имеет смысл перевыпустить, а файл убрать из индекса.
2. **Отключите вход по паролю для SSH** (`PasswordAuthentication no`) и оставьте только ключи —
   иначе узкий доступ агенту ничего не даёт на фоне открытого пароля.
3. **Поставьте fail2ban**, если его ещё нет: IP агента непредсказуем, поэтому фильтрация по адресам
   не вариант, а перебор по 22 порту идёт постоянно.

## Скрипт для сервера

```bash
clear

# ============================================================
# Выдача ИИ-агенту ограниченного доступа к MACVBET VPS
# Выполнять от root (или через sudo)
# ============================================================

set -e

AGENT_USER="cursoragent"
APP_DIR="/var/www/MACVBET/mini-app"

# --- 1. Пользователь для агента, без пароля, вход только по ключу ---
id -u "$AGENT_USER" >/dev/null 2>&1 || /usr/sbin/useradd -m -s /bin/bash "$AGENT_USER"
/usr/bin/passwd -l "$AGENT_USER"

# --- 2. SSH-ключ специально для агента (ed25519, без парольной фразы) ---
/bin/mkdir -p "/home/$AGENT_USER/.ssh"
/bin/chmod 700 "/home/$AGENT_USER/.ssh"
if [ ! -f "/home/$AGENT_USER/.ssh/agent_key" ]; then
  /usr/bin/ssh-keygen -t ed25519 -N "" -C "cursor-cloud-agent" -f "/home/$AGENT_USER/.ssh/agent_key"
fi
/bin/cat "/home/$AGENT_USER/.ssh/agent_key.pub" >> "/home/$AGENT_USER/.ssh/authorized_keys"
/usr/bin/sort -u -o "/home/$AGENT_USER/.ssh/authorized_keys" "/home/$AGENT_USER/.ssh/authorized_keys"
/bin/chmod 600 "/home/$AGENT_USER/.ssh/authorized_keys"
/bin/chown -R "$AGENT_USER:$AGENT_USER" "/home/$AGENT_USER/.ssh"

# --- 3. Обёртка с разрешённым набором операций ---
#     Агент сможет вызывать только её и ничего больше через sudo.
/bin/cat > /usr/local/bin/macvbet-agent <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/var/www/MACVBET/mini-app"
# sudo подрезает PATH, а pnpm/pm2 часто стоят в /usr/local/bin или в nvm
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

case "${1:-}" in
  status)  pm2 status ;;
  logs)
    if [ -n "${2:-}" ]; then
      pm2 logs "$2" --lines "${3:-100}" --nostream
    else
      pm2 logs --lines "${3:-100}" --nostream
    fi
    ;;
  restart) pm2 restart "${2:-all}" && pm2 save ;;
  gitlog)  git -C "$APP_DIR" log --oneline -20 ;;
  deploy)
    cd "$APP_DIR"
    git pull
    pnpm install
    # Prisma-клиент обязателен до сборки, иначе бэкенд упадёт на старте
    (cd apps/backend && npx prisma generate)
    pnpm build
    pm2 restart all
    pm2 save
    ;;
  *)
    echo "Разрешено: status | logs <процесс> <строк> | restart <процесс> | gitlog | deploy" >&2
    exit 1
    ;;
esac
WRAPPER
/bin/chmod 755 /usr/local/bin/macvbet-agent

# --- 4. sudo без пароля только на эту обёртку ---
echo "$AGENT_USER ALL=(root) NOPASSWD: /usr/local/bin/macvbet-agent" > /etc/sudoers.d/90-cursoragent
/bin/chmod 440 /etc/sudoers.d/90-cursoragent
/usr/sbin/visudo -c -f /etc/sudoers.d/90-cursoragent

# --- 5. Право читать каталог приложения ---
/bin/chmod o+rx "$APP_DIR" 2>/dev/null || true

# --- 6. Вывод значений для секретов Cursor ---
echo
echo "==================== VPS_SSH_KEY ===================="
/usr/bin/base64 -w 0 "/home/$AGENT_USER/.ssh/agent_key"
echo
echo "==================== VPS_HOST_KEY ===================="
/usr/bin/ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null | /usr/bin/sed "s/^127.0.0.1/$(/usr/bin/curl -s ifconfig.me)/"
echo
echo "======================================================"
echo "VPS_USER = $AGENT_USER"
echo "Скопируйте оба значения в Cursor Dashboard -> Cloud Agents -> Secrets"
echo "После копирования приватный ключ с сервера можно удалить:"
echo "  rm /home/$AGENT_USER/.ssh/agent_key"
```
