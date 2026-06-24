import os
import io
import aiohttp
import uuid
import logging
from PIL import Image, ImageDraw, ImageFont, ImageOps
from aiogram import Router, F, Bot
from aiogram.types import InlineQuery, InlineQueryResultPhoto, InlineQueryResultArticle, InputTextMessageContent

from database.db import db

router = Router()
logger = logging.getLogger(__name__)

# Constants for image generation
TEMPLATE_PATH = '/var/www/MACVBET/mini-app/apps/frontend/public/profile_inline.jpg'
LOCAL_TEMPLATE_PATH = 'mini-app/apps/frontend/public/profile_inline.jpg'

async def upload_image(image_bytes: bytes) -> str:
    """Uploads an image to telegra.ph with fallback to catbox.moe"""
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
        logger.error(f"Error uploading to telegraph: {e}")

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

def create_profile_image(avatar_bytes: bytes, stats: dict) -> bytes:
    """Generates the profile image with user stats and avatar"""
    # 1. Load the template
    template = TEMPLATE_PATH
    if not os.path.exists(template):
        template = LOCAL_TEMPLATE_PATH
    
    if os.path.exists(template):
        base = Image.open(template).convert('RGB')
    else:
        # Fallback to a solid black image if template is completely missing
        logger.warning(f"Template not found at {TEMPLATE_PATH}. Using fallback.")
        base = Image.new('RGB', (800, 450), color=(15, 15, 15))
        draw = ImageDraw.Draw(base)
        draw.text((400, 20), "MACVBET PROFILE", fill=(255, 255, 255))

    draw = ImageDraw.Draw(base)
    width, height = base.size

    # 2. Draw Avatar
    if avatar_bytes:
        try:
            avatar = Image.open(io.BytesIO(avatar_bytes)).convert('RGBA')
            AVATAR_SIZE = int(height * 0.58)  # Approx 58% of height
            AVATAR_X = int(width * 0.15)
            AVATAR_Y = int(height * 0.15)

            avatar = avatar.resize((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
            
            # Create a circular mask
            mask = Image.new('L', (AVATAR_SIZE, AVATAR_SIZE), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse((0, 0, AVATAR_SIZE, AVATAR_SIZE), fill=255)
            
            base.paste(avatar, (AVATAR_X, AVATAR_Y), mask)
        except Exception as e:
            logger.error(f"Failed to draw avatar: {e}")

    # 3. Draw Stats
    try:
        font = ImageFont.truetype("arial.ttf", size=24)
    except IOError:
        font = ImageFont.load_default()

    TEXT_X = int(width * 0.85)
    START_Y = int(height * 0.15)
    Y_STEP = int(height * 0.17)
    
    stats_list = [
        (f"{stats['turnover']} zl", START_Y),
        (f"{stats['balance']} zl", START_Y + Y_STEP * 1),
        (f"{stats['max_x']}x", START_Y + Y_STEP * 2),
        (f"{stats['games_count']}", START_Y + Y_STEP * 3)
    ]

    for text, y in stats_list:
        box_width, box_height = 80, 40
        draw.rectangle([TEXT_X - box_width, y - 5, TEXT_X + 20, y + box_height], fill=(0, 0, 0))
        
        if hasattr(font, 'getbbox'):
            bbox = font.getbbox(text)
            text_width = bbox[2] - bbox[0]
        else:
            text_width = font.getsize(text)[0]
            
        draw.text((TEXT_X - text_width, y), text, fill=(255, 255, 255), font=font)

    output = io.BytesIO()
    base.save(output, format='JPEG', quality=95)
    return output.getvalue()


@router.inline_query(F.query.lower().in_(["профиль", "profile", ""]))
async def inline_profile_handler(inline_query: InlineQuery, bot: Bot):
    user_id = inline_query.from_user.id
    username = inline_query.from_user.username or inline_query.from_user.first_name
    
    try:
        stats = db.get_profile_stats(user_id)
    except Exception as e:
        logger.error(f"Failed to fetch stats for inline profile: {e}")
        return

    avatar_bytes = None
    try:
        user_profile_photos = await bot.get_user_profile_photos(user_id, limit=1)
        if user_profile_photos.total_count > 0:
            photo = user_profile_photos.photos[0][-1] 
            file = await bot.get_file(photo.file_id)
            avatar_io = await bot.download_file(file.file_path)
            avatar_bytes = avatar_io.read()
    except Exception as e:
        logger.error(f"Failed to fetch user avatar: {e}")

    try:
        img_bytes = create_profile_image(avatar_bytes, stats)
    except Exception as e:
        logger.error(f"Failed to create profile image: {e}")
        return
    
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
