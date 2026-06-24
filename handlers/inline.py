import os
import io
import aiohttp
import uuid
import logging
from PIL import Image, ImageDraw, ImageFont, ImageOps
from aiogram import Router, F, Bot
from aiogram.types import InlineQuery, InlineQueryResultPhoto

from database.db import db

router = Router()
logger = logging.getLogger(__name__)

# Constants for image generation
TEMPLATE_PATH = '/var/www/MACVBET/mini-app/apps/frontend/public/profile_inline.jpg'
LOCAL_TEMPLATE_PATH = 'mini-app/apps/frontend/public/profile_inline.jpg'

async def upload_image(image_bytes: bytes) -> str:
    """Uploads an image to telegra.ph, with a fallback to catbox.moe"""
    # 1. Try Telegraph
    try:
        async with aiohttp.ClientSession() as session:
            data = aiohttp.FormData()
            data.add_field('file', image_bytes, filename='profile.jpg', content_type='image/jpeg')
            async with session.post('https://telegra.ph/upload', data=data, timeout=5) as resp:
                if resp.status == 200:
                    res = await resp.json()
                    if isinstance(res, list) and len(res) > 0 and 'src' in res[0]:
                        return "https://telegra.ph" + res[0]['src']
    except Exception as e:
        logger.error(f"Telegraph upload failed: {e}")

    # 2. Try Catbox.moe as fallback
    try:
        async with aiohttp.ClientSession() as session:
            data = aiohttp.FormData()
            data.add_field('reqtype', 'fileupload')
            data.add_field('fileToUpload', image_bytes, filename='profile.jpg', content_type='image/jpeg')
            async with session.post('https://catbox.moe/user/api.php', data=data, timeout=10) as resp:
                if resp.status == 200:
                    url = await resp.text()
                    if url.startswith("http"):
                        return url.strip()
    except Exception as e:
        logger.error(f"Catbox upload failed: {e}")
        
    return ""


@router.inline_query(F.query.lower().in_(["профиль", "profile", ""]))
async def inline_profile_handler(inline_query: InlineQuery, bot: Bot):
    user_id = inline_query.from_user.id
    username = inline_query.from_user.username or inline_query.from_user.first_name
    
    # Fetch stats
    try:
        stats = db.get_profile_stats(user_id)
    except Exception as e:
        logger.error(f"Failed to fetch stats for inline profile: {e}")
        return

    # Fetch avatar
    avatar_bytes = None
    try:
        user_profile_photos = await bot.get_user_profile_photos(user_id, limit=1)
        if user_profile_photos.total_count > 0:
            photo = user_profile_photos.photos[0][-1] # best resolution
            file = await bot.get_file(photo.file_id)
            avatar_io = await bot.download_file(file.file_path)
            avatar_bytes = avatar_io.read()
    except Exception as e:
        logger.error(f"Failed to fetch user avatar: {e}")

    # Generate image
    try:
        img_bytes = create_profile_image(avatar_bytes, stats)
    except Exception as e:
        logger.error(f"Failed to create profile image: {e}")
        return
    
    # Upload to host
    photo_url = await upload_image(img_bytes)

    caption = (
        f"<tg-emoji emoji-id=\"5309901482890382924\">👤</tg-emoji> Пользователь {username}!\n\n"
        f"<tg-emoji emoji-id=\"5303213613220121573\">📈</tg-emoji> Статистика:\n"
        f"Оборот - {stats['turnover']} zl\n"
        f"Баланс - {stats['balance']} zl\n"
        f"Макс Х - {stats['max_x']}\n"
        f"Кол-во Игр - {stats['games_count']}\n\n"
        f"<tg-emoji emoji-id=\"5283080528818360566\">🚀</tg-emoji> Играйте только тут (http://t.me/macvbet_bot)."
    )

    if photo_url:
        result = InlineQueryResultPhoto(
            id=str(uuid.uuid4()),
            photo_url=photo_url,
            thumbnail_url=photo_url,
            title="Ваш Профиль",
            description="Отправить карточку профиля",
            caption=caption,
            parse_mode="HTML"
        )
    else:
        from aiogram.types import InlineQueryResultArticle, InputTextMessageContent
        logger.error("Failed to upload image. Using text-only fallback.")
        result = InlineQueryResultArticle(
            id=str(uuid.uuid4()),
            title="Ваш Профиль (Текст)",
            description="Отправить текстовую карточку",
            input_message_content=InputTextMessageContent(
                message_text=caption,
                parse_mode="HTML"
            )
        )

    try:
        await inline_query.answer([result], cache_time=5, is_personal=True)
    except Exception as e:
        logger.error(f"Failed to answer inline query: {e}")
