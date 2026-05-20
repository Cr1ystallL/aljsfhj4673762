"""
Game photo helper
=================

Centralised mapping from a game key to its banner image. Used by every
bot game handler so the intro / instruction message lands as a photo
with caption rather than a plain text dump. Keeps the bot's UX
consistent with the mini-app — the same artwork that backs the home
screen tiles also surfaces inside the bot.

The images live in `mini-app/apps/frontend/public/` so the same source
of truth feeds both surfaces. We resolve their paths via a lazy lookup
so missing files just fall back to text-only sends instead of crashing
the handler.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from aiogram.types import FSInputFile

# Project root — `__file__` lives in `<repo>/utils/`, so .. once.
_ROOT = Path(__file__).resolve().parent.parent
_PUBLIC = _ROOT / "mini-app" / "apps" / "frontend" / "public"

# Filenames in `public/`. Cyrillic ones come from the asset pack the
# user dropped into the repo.
GAME_PHOTOS: dict[str, str] = {
    "dice": "Кубики.png",
    "cube": "Кубики.png",
    "bowling": "Боулинг.png",
    "bowl": "Боулинг.png",
    "darts": "Дартс.png",
    "basketball": "Баскетбол.png",
    "basket": "Баскетбол.png",
    "football": "Футбол.png",
    "foot": "Футбол.png",
    "rps": "КНБ.png",
    "knb": "КНБ.png",
    "spider": "Spider.png",
}


def get_game_photo(key: str) -> Optional[FSInputFile]:
    """Return an `FSInputFile` for the given game key, or None when the
    file is missing on disk. Callers should fall back to a plain text
    send when this returns None.
    """
    filename = GAME_PHOTOS.get(key)
    if not filename:
        return None
    path = _PUBLIC / filename
    if not path.exists():
        return None
    return FSInputFile(str(path))


async def send_game_message(
    bot,
    chat_id: int,
    game_key: str,
    text: str,
    reply_markup=None,
    parse_mode: str = "HTML",
) -> None:
    """Send a message decorated with the matching game banner.

    Falls back to a plain `send_message` when the banner is unavailable
    so a missing asset can never break the gameplay flow.
    """
    photo = get_game_photo(game_key)
    if photo is None:
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        return
    # Telegram caps photo captions at 1024 chars; if the text is
    # longer we send the photo with a brief headline and follow it
    # with the full text below as a regular message.
    if len(text) <= 1024:
        await bot.send_photo(
            chat_id=chat_id,
            photo=photo,
            caption=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        return
    head = text[:900].rstrip() + "…"
    await bot.send_photo(
        chat_id=chat_id,
        photo=photo,
        caption=head,
        parse_mode=parse_mode,
    )
    await bot.send_message(
        chat_id=chat_id,
        text=text,
        reply_markup=reply_markup,
        parse_mode=parse_mode,
    )


# Used by tests / scripts to verify all assets exist at start-up.
def list_missing_assets() -> list[str]:
    """Return a list of expected files that aren't on disk."""
    missing: list[str] = []
    for key, filename in GAME_PHOTOS.items():
        path = _PUBLIC / filename
        if not path.exists():
            missing.append(f"{key} -> {path}")
    return missing


__all__ = [
    "GAME_PHOTOS",
    "get_game_photo",
    "send_game_message",
    "list_missing_assets",
]
