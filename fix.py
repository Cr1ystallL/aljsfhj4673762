import io
import re

with open('handlers/inline.py', 'r', encoding='utf-8') as f:
    code = f.read()

def_start = code.find('def create_profile_image')
def_end = code.find('@router.inline_query', def_start)

new_func = '''def create_profile_image(avatar_bytes: bytes, username: str, user_id: int, stats: dict) -> bytes:
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

    # Load font for Name (try common Linux fonts)
    font_paths = [
        "arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
    ]
    font_name = None
    for path in font_paths:
        try:
            font_name = ImageFont.truetype(path, size=60)
            break
        except IOError:
            continue
            
    if font_name is None:
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

'''

new_code = code[:def_start] + new_func + code[def_end:]
with open('handlers/inline.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
