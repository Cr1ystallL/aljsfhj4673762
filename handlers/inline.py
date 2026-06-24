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

def create_profile_image(stats: dict) -> bytes:
    """Generates the profile image with user stats"""
    # 1. Load the template
    template = TEMPLATE_PATH
    if not os.path.exists(template):
        template = LOCAL_TEMPLATE_PATH
    
    if os.path.exists(template):
        base = Image.open(template).convert('RGB')
    else:
        # Fallback to a solid black image if template is completely missing
        logger.warning(f"Template not found at {TEMPLATE_PATH}. Using fallback.")
        base = Image.new('RGB', (1280, 720), color=(15, 15, 15))
        draw = ImageDraw.Draw(base)
        draw.text((640, 20), "MACVBET PROFILE", fill=(255, 255, 255))

    draw = ImageDraw.Draw(base)
    width, height = base.size

    # 2. Draw Stats
    font_size = int(height * 0.045)  # Make text much larger and readable
    try:
        font = ImageFont.truetype("arial.ttf", size=font_size)
    except IOError:
        font = ImageFont.load_default()

    TEXT_X = int(width * 0.86)
    START_Y = int(height * 0.16)
    Y_STEP = int(height * 0.20)
    
    stats_list = [
        (f"{stats['turnover']} zl", START_Y),
        (f"{stats['balance']} zl", START_Y + Y_STEP * 1),
        (f"{stats['max_x']}x", START_Y + Y_STEP * 2),
        (f"{stats['games_count']}", START_Y + Y_STEP * 3)
    ]

    for text, y in stats_list:
        # Draw a black box to erase the existing dash "-"
        box_x1 = TEXT_X - int(width * 0.15)
        box_y1 = y - int(height * 0.02)
        box_x2 = TEXT_X + int(width * 0.05)
        box_y2 = y + font_size + int(height * 0.02)
        draw.rectangle([box_x1, box_y1, box_x2, box_y2], fill=(0, 0, 0))
        
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

    try:
        img_bytes = create_profile_image(stats)
    except Exception as e:
        logger.error(f"Failed to create profile image: {e}")
        return
    
    photo_url = await upload_image(img_bytes)

    caption = (
        f"👤 <b><i>Пользователь</i></b> <b>{username}</b>!\n\n"
        f"📈 <b>Статистика:</b>\n"
        f"<blockquote>\n"
        f"<b><i>Оборот</i></b> - <b><u>{stats['turnover']} zl</u></b>\n"
        f"<b><i>Баланс</i></b> - <b>{stats['balance']} zl</b>\n"
        f"<b><i>Макс Х</i></b> - <b><u>{stats['max_x']}x</u></b>\n"
        f"<b><i>Кол-во Игр</i></b> - <b><u>{stats['games_count']}</u></b>\n"
        f"</blockquote>\n"
        f"🚀 <b>Играйте только <a href=\"http://t.me/macvbet_bot\">тут</a></b>."
    )

    if photo_url:
        result = InlineQueryResultPhoto(
            id=str(uuid.uuid4()),
            photo_url=photo_url,
            thumbnail_url=photo_url,
            title="MacvBet - Ваш профиль",
            description="Показывает статистику вашего профиля",
            caption=caption,
            parse_mode="HTML"
        )
    else:
        result = InlineQueryResultArticle(
            id=str(uuid.uuid4()),
            title="MacvBet - Ваш профиль",
            description="Показывает статистику вашего профиля",
            input_message_content=InputTextMessageContent(
                message_text=caption,
                parse_mode="HTML"
            )
        )

    try:
        await inline_query.answer([result], cache_time=5, is_personal=True)
    except Exception as e:
        logger.error(f"Failed to answer inline query: {e}")
