# 📚 Скиллы ИИ-агента (Agent Skills)

Cursor подхватывает скиллы автоматически из `.cursor/skills/<имя>/SKILL.md`. Всё, что лежит
там, закоммичено в репозиторий — значит доступно и локальному агенту, и облачному (Cloud Agent),
и любому другому агенту, который понимает формат `SKILL.md` (Claude Code, Codex, Windsurf, Cline).

Папка `SKILLS/` — это каталог источников и точка синхронизации апстримов, а не место, откуда
агент читает скиллы.

> **Что было раньше.** Подпапки `SKILLS/` были записаны в git как gitlink'и (mode `160000`)
> без файла `.gitmodules`. Гит хранил только SHA чужих коммитов, но не URL репозиториев, поэтому
> после клонирования папки оставались пустыми, и ни один агент эти скиллы не видел. Ссылки
> восстановлены и закреплены в `SKILLS/sync.sh`, реальные скиллы распакованы в `.cursor/skills/`.

---

## ✅ Установлено в `.cursor/skills/`

Агент сам решает, когда применить скилл, по полю `description`. Явно вызвать можно через
`/имя-скилла`.

### Дизайн интерфейсов

| Скилл | Когда срабатывает | Источник |
| --- | --- | --- |
| `design-taste-frontend` | Лендинги, промо-страницы, редизайн. Читает бриф, выводит дизайн-направление, гоняет по анти-slop бан-листу (запрет mesh-градиентов, AI-фиолетового, повторяющихся секций) и строгому pre-flight чек-листу. Ровно то, что нужно для «дорогой кинематографичной» подачи из `PROMT.MD`. | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` |
| `redesign-existing-projects` | Улучшение уже написанного UI. Сначала аудит текущего кода, потом точечная модернизация без слома функциональности — подходит для `mini-app/apps/frontend`. | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/redesign-skill` |
| `apple-design` | Жестовые интерфейсы, пружинные анимации, drag/swipe/шторки, прерываемые переходы, translucent-материалы, типографика. Дистилляция докладов Apple WWDC под веб. Ключевое для Telegram Mini App. | Был единственным непустым файлом в `SKILLS/`, перенесён как есть |
| `ui-ux-pro-max` | Поиск по локальной базе: 79 стилей, 192 палитры, 74 шрифтовые пары, 119 UX-правил, 25 типов графиков, 22 стека. Работает через `python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "запрос" -d style`. | [nordeim/ui-ux-pro-max-skill](https://github.com/nordeim/ui-ux-pro-max-skill), поставлен через `npx ui-ux-pro-max-cli init --ai cursor` |
| `ui-styling` | Вёрстка на shadcn/ui + Radix + Tailwind, доступные компоненты, адаптивные раскладки. | то же |
| `design-system` | Трёхслойные токены (primitive → semantic → component), CSS-переменные, шкалы отступов и типографики, спеки компонентов. | то же |
| `brand`, `banner-design`, `slides`, `design` | Айдентика, баннеры и креативы под соцсети/рекламу, HTML-презентации. Прямо к казино не относятся, но приехали одним пакетом с CLI. | то же |

### Прочее

| Скилл | Когда срабатывает | Источник |
| --- | --- | --- |
| `caveman` | Сжатый режим ответов (~65% экономии выходных токенов). **Только по явному вызову `/caveman`** — в frontmatter выставлен `disable-model-invocation: true`, чтобы скилл не перехватывал обычные ответы автоматически. | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) `skills/caveman` |
| `vps-access` | Как агенту подключиться к боевому VPS по SSH, если в окружении заданы соответствующие секреты. Подробности — в `docs/VPS_AGENT_ACCESS.md`. | Написан под этот проект |

---

## 📦 Внешние инструменты (в `.cursor/skills/` не ставятся)

Это не скиллы формата `SKILL.md`, а отдельные программы. Часть из них устроена под Claude Code
CLI и на агента Cursor не влияет; часть требует своей инфраструктуры. Ссылки и закреплённые
коммиты сохранены в `SKILLS/sync.sh` — склонировать локально можно командой `./SKILLS/sync.sh`.

| Инструмент | Что это на самом деле | Почему не установлен |
| --- | --- | --- |
| [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | Библиотека 100+ описаний субагентов-экспертов в формате Claude Code | У Cursor свои субагенты (`explore`, `generalPurpose`, `bugbot`, `security-review`). Полезно как источник промптов, но 100+ файлов в контексте только зашумят выбор скилла. Отдельные роли можно перенести точечно. |
| [SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) | Фреймворк слэш-команд и когнитивных ролей для Claude Code | Ставится в `~/.claude/`, завязан на рантайм Claude Code. |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | GSD — spec-driven разработка, команды `/gsd:*`, каталог `.planning/` | Репозиторий заархивирован, разработка переехала в [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core). Плюс фазовый процесс у проекта уже описан в `PROMT.MD`. |
| [zilliztech/claude-context](https://github.com/zilliztech/claude-context) | MCP-сервер семантического поиска по коду | Нужны векторная база (Zilliz/Milvus) и ключ эмбеддингов. У Cursor уже есть встроенный семантический поиск по кодовой базе. |
| [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) | CLI-отчёты по расходу токенов Claude Code | Читает логи Claude Code, к Cursor неприменим. |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) | Go/TUI-менеджер параллельных агентов на tmux + git worktrees | Запускается на вашей машине, а не внутри агента. Аналог в Cursor — параллельные субагенты и `best-of-n-runner`. |
| [ruvnet/ruflo](https://github.com/ruvnet/ruflo) | Оркестрация «роя» агентов (бывший claude-flow) | То же: внешний рантайм поверх Claude Code. |

---

## ➕ Как добавить новый скилл

```bash
mkdir -p .cursor/skills/имя-скилла
```

Дальше `.cursor/skills/имя-скилла/SKILL.md`:

```markdown
---
name: имя-скилла
description: Что делает и в каких ситуациях применять. По этому тексту агент решает, брать скилл или нет.
---

# Заголовок

Инструкции агенту.
```

Требования к формату:

- `name` — только строчные латинские буквы, цифры и дефисы, **обязан совпадать с именем папки**.
- `description` — самое важное поле: описания всех скиллов грузятся в контекст сразу, а тело
  `SKILL.md` читается только когда скилл выбран. Пишите конкретно, с ключевыми словами.
- Тело держите компактным (ориентир — до 500 строк), детали выносите в подпапки
  `references/`, `scripts/`, `assets/` и ссылайтесь относительными путями.
- Необязательные поля: `paths` (ограничить скилл по glob'ам файлов),
  `disable-model-invocation: true` (только по явному `/вызову`), `icon`, `color`, `metadata`.
- Чтобы скилл увидел облачный агент, его нужно закоммитить в репозиторий.

Документация: [cursor.com/docs/skills](https://cursor.com/docs/skills).
