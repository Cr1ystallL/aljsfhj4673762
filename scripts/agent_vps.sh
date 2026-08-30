#!/usr/bin/env bash
# Мост между ИИ-агентом и боевым VPS.
#
# Ключ и адрес берутся из переменных окружения, которые задаются в
# Cursor Dashboard → Cloud Agents → Secrets (см. docs/VPS_AGENT_ACCESS.md):
#
#   VPS_HOST          IP или домен сервера
#   VPS_USER          пользователь SSH
#   VPS_SSH_KEY       приватный ключ, base64 в одну строку
#   VPS_PORT          порт SSH, по умолчанию 22
#   VPS_HOST_KEY      (желательно) строка known_hosts сервера, чтобы не отключать
#                     проверку подлинности хоста
#
# Использование:
#   ./scripts/agent_vps.sh check                  проверить, что доступ есть
#   ./scripts/agent_vps.sh run 'pm2 status'       выполнить команду на сервере
#   ./scripts/agent_vps.sh logs macvbet-backend   последние 100 строк логов процесса
#   ./scripts/agent_vps.sh pull-file <remote> <local>
set -euo pipefail

KEY_PATH="${VPS_KEY_PATH:-$HOME/.ssh/agent_vps_key}"
KNOWN_HOSTS="$HOME/.ssh/agent_vps_known_hosts"
PORT="${VPS_PORT:-22}"

die() { echo "ОШИБКА: $*" >&2; exit 1; }

require_env() {
  [[ -n "${VPS_HOST:-}" ]] || die "не задан VPS_HOST. См. docs/VPS_AGENT_ACCESS.md"
  [[ -n "${VPS_USER:-}" ]] || die "не задан VPS_USER. См. docs/VPS_AGENT_ACCESS.md"
  [[ -n "${VPS_SSH_KEY:-}" ]] || die "не задан VPS_SSH_KEY. См. docs/VPS_AGENT_ACCESS.md"
}

prepare_key() {
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  if [[ ! -s "$KEY_PATH" ]]; then
    printf '%s' "$VPS_SSH_KEY" | base64 -d > "$KEY_PATH" 2>/dev/null \
      || die "VPS_SSH_KEY не декодируется из base64"
    chmod 600 "$KEY_PATH"
  fi

  ssh-keygen -y -f "$KEY_PATH" >/dev/null 2>&1 \
    || die "VPS_SSH_KEY не похож на приватный SSH-ключ (или защищён паролем)"

  if [[ -n "${VPS_HOST_KEY:-}" && ! -s "$KNOWN_HOSTS" ]]; then
    printf '%s\n' "$VPS_HOST_KEY" > "$KNOWN_HOSTS"
    chmod 600 "$KNOWN_HOSTS"
  fi
}

# Общие опции без порта: ssh ждёт -p, а scp -P, поэтому порт добавляет вызывающий.
common_opts() {
  local opts=(-i "$KEY_PATH" -o BatchMode=yes -o ConnectTimeout=15)
  if [[ -s "$KNOWN_HOSTS" ]]; then
    opts+=(-o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=yes)
  else
    # Первое подключение: запоминаем ключ хоста, дальше он фиксирован.
    opts+=(-o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=accept-new)
  fi
  printf '%s\n' "${opts[@]}"
}

vps_ssh() {
  local opts=(); mapfile -t opts < <(common_opts)
  ssh "${opts[@]}" -p "$PORT" "$VPS_USER@$VPS_HOST" "$@"
}

cmd_check() {
  require_env
  prepare_key
  echo "Подключаюсь: $VPS_USER@$VPS_HOST:$PORT"
  vps_ssh 'echo "хост: $(hostname)"; echo "аптайм:$(uptime -p 2>/dev/null || uptime)"; \
           echo "свободно на диске:"; df -h / | tail -1; \
           command -v pm2 >/dev/null && pm2 status || echo "pm2 не найден в PATH"'
}

cmd_run() {
  require_env
  prepare_key
  [[ $# -gt 0 ]] || die "нужна команда: agent_vps.sh run '<команда>'"
  vps_ssh "$@"
}

cmd_logs() {
  require_env
  prepare_key
  local proc="${1:-}"
  local lines="${2:-100}"
  if [[ -n "$proc" ]]; then
    vps_ssh "pm2 logs '$proc' --lines '$lines' --nostream"
  else
    vps_ssh "pm2 logs --lines '$lines' --nostream"
  fi
}

cmd_pull_file() {
  require_env
  prepare_key
  local remote="${1:?нужен путь на сервере}"
  local local_path="${2:?нужен локальный путь}"
  local opts=(); mapfile -t opts < <(common_opts)
  scp "${opts[@]}" -P "$PORT" "$VPS_USER@$VPS_HOST:$remote" "$local_path"
}

case "${1:-}" in
  check)     shift; cmd_check "$@" ;;
  run)       shift; cmd_run "$@" ;;
  logs)      shift; cmd_logs "$@" ;;
  pull-file) shift; cmd_pull_file "$@" ;;
  *)
    awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
    exit 1
    ;;
esac
