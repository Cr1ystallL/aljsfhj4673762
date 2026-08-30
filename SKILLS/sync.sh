#!/usr/bin/env bash
# Клонирует апстримы скиллов в SKILLS/<категория>/<имя>/ для локального изучения.
# Клоны попадают в .gitignore и в репозиторий не коммитятся — рабочие копии
# скиллов лежат в .cursor/skills/ (см. SKILLS/AVAILABLE_SKILLS.md).
#
#   ./SKILLS/sync.sh          — склонировать всё
#   ./SKILLS/sync.sh caveman  — склонировать один скилл по имени папки
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# категория|папка|git-url|закреплённый коммит
REPOS=(
  "Визуальная часть (Фронтенд)|taste-skill|https://github.com/Leonxlnx/taste-skill|7c397f22d3af6f2b3f1925eb147d8e8801086151"
  "Визуальная часть (Фронтенд)|ui-ux-pro-max-skill|https://github.com/nordeim/ui-ux-pro-max-skill|b484e8338c25b9cea3a25981a992d2817188971a"
  "Оркестрация агентов|awesome-claude-code-subagents|https://github.com/VoltAgent/awesome-claude-code-subagents|947b44ca0c58d606b084e9cb1a2389335b49278b"
  "Оркестрация агентов|claude-squad|https://github.com/smtg-ai/claude-squad|5a604f76fc943d29fbc1ee76ec33b4ebd03178e3"
  "Оркестрация агентов|ruflo|https://github.com/ruvnet/ruflo|12ede21767a6dd669df1b79392a5d27d9154f237"
  "Оптимизация контекста|SuperClaude_Framework|https://github.com/SuperClaude-Org/SuperClaude_Framework|226c45cc93b865108843a669c6545d421784b68c"
  "Оптимизация контекста|caveman|https://github.com/JuliusBrussee/caveman|0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0"
  "Оптимизация контекста|ccusage|https://github.com/ryoppippi/ccusage|4985a8a41d0fdac06b9db19c7dce8a00e7c6c5cb"
  "Оптимизация контекста|claude-context|https://github.com/zilliztech/claude-context|6fc318b4e3ce58e2898b00a9c3538ead9e24dee5"
  "Управление воркфлоу|get-shit-done|https://github.com/gsd-build/get-shit-done|bdcaab2c752d9a33a1a1ca9acf3a3c81fb991815"
)

FILTER="${1:-}"

for row in "${REPOS[@]}"; do
  IFS='|' read -r category name url sha <<< "$row"
  [[ -n "$FILTER" && "$FILTER" != "$name" ]] && continue

  dest="$ROOT/$category/$name"
  echo "==> $name ($url @ ${sha:0:8})"

  if [[ -d "$dest/.git" ]]; then
    git -C "$dest" fetch --quiet origin "$sha" || git -C "$dest" fetch --quiet origin
  else
    mkdir -p "$(dirname "$dest")"
    git clone --quiet "$url" "$dest"
    git -C "$dest" fetch --quiet origin "$sha" || true
  fi

  git -C "$dest" checkout --quiet "$sha"
  echo "    -> $dest"
done

echo "Готово."
