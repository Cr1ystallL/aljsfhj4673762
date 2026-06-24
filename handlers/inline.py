import os
import io
import aiohttp
import uuid
import logging
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter, ImageEnhance
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

def create_profile_image(avatar_bytes: bytes, username: str, user_id: int, stats: dict) -> bytes:
    """Generates the profile image with blurred avatar background, circular avatar, and large nickname (16:9)"""
    width, height = 1280, 720
    
    # 1. Base / Background
    base = Image.new('RGB', (width, height), color=(10, 10, 12))
    
    avatar = None
    if avatar_bytes:
        try:
            avatar = Image.open(io.BytesIO(avatar_bytes)).convert('RGBA')
        except Exception as e:
            logger.error(f"Failed to open avatar: {e}")
            
    if avatar:
        # Create blurred background
        bg = avatar.copy().resize((width, height), Image.Resampling.LANCZOS)
        bg = bg.filter(ImageFilter.GaussianBlur(36))
        # Darken the background
        enhancer = ImageEnhance.Brightness(bg)
        bg = enhancer.enhance(0.4)
        base.paste(bg, (0, 0))
    else:
        # Fallback dark gradient
        draw = ImageDraw.Draw(base)
        for y in range(height):
            r = int(10 + (20 * y / height))
            g = int(10 + (25 * y / height))
            b = int(12 + (30 * y / height))
            draw.line([(0, y), (width, y)], fill=(r, g, b))

    draw = ImageDraw.Draw(base, "RGBA")

    # Load font for Name
    try:
        font_name = ImageFont.truetype("arial.ttf", size=200)
    except IOError:
        font_name = ImageFont.load_default()

    # 2. Draw Avatar (Circle)
    AVATAR_SIZE = 320
    avatar_x = (width - AVATAR_SIZE) // 2
    # Move avatar a bit up from center to leave room for text
    avatar_y = (height - AVATAR_SIZE) // 2 - 40

    if avatar:
        avatar_small = avatar.resize((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
        mask = Image.new('L', (AVATAR_SIZE, AVATAR_SIZE), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse((0, 0, AVATAR_SIZE, AVATAR_SIZE), fill=255)
        base.paste(avatar_small, (avatar_x, avatar_y), mask)
        # Draw border
        draw.ellipse((avatar_x, avatar_y, avatar_x + AVATAR_SIZE, avatar_y + AVATAR_SIZE), outline=(255, 255, 255, 60), width=4)
    else:
        # Placeholder initials
        draw.ellipse((avatar_x, avatar_y, avatar_x + AVATAR_SIZE, avatar_y + AVATAR_SIZE), fill=(255, 255, 255, 15), outline=(255, 255, 255, 40), width=4)
        initials = (username[0].upper() if username else "U")
        if hasattr(font_name, 'getbbox'):
            bbox = font_name.getbbox(initials)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
        else:
            tw, th = font_name.getsize(initials)
        draw.text((avatar_x + (AVATAR_SIZE - tw) // 2, avatar_y + (AVATAR_SIZE - th) // 2 - 15), initials, fill=(255, 255, 255), font=font_name)

    # 3. Draw Username (Gradient)
    if hasattr(font_name, 'getbbox'):
        bbox = font_name.getbbox(username)
        tw = bbox[2] - bbox[0]
    else:
        tw = font_name.getsize(username)[0]
    
    name_y = avatar_y + AVATAR_SIZE + 40
    text_x = (width - tw) // 2
    
    # Create mask for text
    text_mask = Image.new('L', (width, height), 0)
    mask_draw = ImageDraw.Draw(text_mask)
    mask_draw.text((text_x, name_y), username, fill=255, font=font_name)
    
    # Create gradient layer
    gradient = Image.new('RGB', (width, height))
    grad_draw = ImageDraw.Draw(gradient)
    
    for x in range(tw):
        progress = x / max(1, tw - 1)
        if progress < 0.5:
            p = progress * 2
            r = int(160 + (255 - 160) * p)
            g = int(224 + (172 - 224) * p)
            b = int(171 + (46 - 171) * p)
        else:
            p = (progress - 0.5) * 2
            r = int(255 + (165 - 255) * p)
            g = int(172 + (45 - 172) * p)
            b = int(46 + (37 - 46) * p)
        grad_draw.line([(text_x + x, 0), (text_x + x, height)], fill=(r, g, b))
        
    # Paste gradient onto base using text_mask
    base.paste(gradient, (0, 0), text_mask)

    output = io.BytesIO()
    base.convert('RGB').save(output, format='JPEG', quality=95)
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
        img_bytes = create_profile_image(avatar_bytes, username, user_id, stats)
    except Exception as e:
        logger.error(f"Failed to create profile image: {e}")
        return
    
    photo_url = await upload_image(img_bytes)

    caption = (
        f"<tg-emoji emoji-id=\"5309901482890382924\">👤</tg-emoji> <b><i>Пользователь</i></b> <b>{username}</b>!\n\n"
        f"<tg-emoji emoji-id=\"5310300184704471216\">📈</tg-emoji> <b>Статистика:</b>\n"
        f"<blockquote><b><i>Оборот</i></b> - <b><u>{stats['turnover']} zl</u></b>\n"
        f"<b><i>Баланс</i></b> - <b><u>{stats['balance']} zl</u></b>\n"
        f"<b><i>Макс Х</i></b> - <b><u>{stats['max_x']}x</u></b>\n"
        f"<b><i>Кол-во Игр</i></b> - <b><u>{stats['games_count']}</u></b></blockquote>\n"
        f"<tg-emoji emoji-id=\"5283080528818360566\">🚀</tg-emoji> <b>Играйте только <a href=\"http://t.me/macvbet_bot\">тут</a></b>."
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
        await inline_query.answer([result], is_personal=True, cache_time=0)
    except Exception as e:
        logger.error(f"Error handling inline query: {e}")
