"""
РџРµСЂРµРІРѕРґС‹ РґР»СЏ РІСЃРµС… СЏР·С‹РєРѕРІ
"""

TRANSLATIONS = {
    'ru': {
        # РћСЃРЅРѕРІРЅС‹Рµ РєРЅРѕРїРєРё
        'btn_slots': 'рџЋ° РЎР»РѕС‚С‹',  # legacy вЂ” Р±РѕР»СЊС€Рµ РЅРµ РѕС‚РѕР±СЂР°Р¶Р°РµС‚СЃСЏ, РѕСЃС‚Р°РІР»РµРЅ РґР»СЏ СЃС‚Р°СЂС‹С… С…СЌРЅРґР»РµСЂРѕРІ
        'btn_miniapp': 'рџЋ° Mini-App',
        'btn_games': 'рџЋІ РРіСЂС‹ TG',
        'btn_profile': 'рџ‘¤ РџСЂРѕС„РёР»СЊ',
        'btn_info': 'вќ” РРЅС„РѕСЂРјР°С†РёСЏ',
        'btn_back': 'вЂ№ РќР°Р·Р°Рґ',
        'miniapp_intro': 'рџЋ° <b>MacvBet Mini-App</b>\n\nРќР°Р¶РјРёС‚Рµ РєРЅРѕРїРєСѓ РЅРёР¶Рµ, С‡С‚РѕР±С‹ РѕС‚РєСЂС‹С‚СЊ РєР°Р·РёРЅРѕ РІРЅСѓС‚СЂРё Telegram.',
        'btn_open_miniapp': 'рџЋ® РћС‚РєСЂС‹С‚СЊ Mini-App',
        
        # РџСЂРёРІРµС‚СЃС‚РІРёРµ
        'welcome': 'рџ‘‹ Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ, {name}!',
        'choose_language': 'рџЊђ Р’С‹Р±РµСЂРёС‚Рµ СЏР·С‹Рє / Wybierz jД™zyk:',
        'language_set': 'вњ… РЇР·С‹Рє СѓСЃС‚Р°РЅРѕРІР»РµРЅ: Р СѓСЃСЃРєРёР№',
        
        # РџСЂРѕС„РёР»СЊ
        'profile_balance': 'рџ’° <b>Р‘Р°Р»Р°РЅСЃ:</b> {balance}',
        'profile_bonus': 'рџЋЃ <b>Р‘РѕРЅСѓСЃРЅС‹Р№ Р±Р°Р»Р°РЅСЃ:</b> {bonus}',
        'profile_active': 'рџЋЇ <b>РђРєС‚РёРІРЅС‹Р№ СЃС‡РµС‚:</b> {type}',
        'profile_wager': 'рџ“Љ <b>РћС‚С‹РіСЂС‹С€ Р±РѕРЅСѓСЃР°:</b> {current} / {required} ({percent}%)',
        'profile_to_lose': 'вљ пёЏ <b>РћСЃС‚Р°Р»РѕСЃСЊ РѕС‚С‹РіСЂР°С‚СЊ РґРµРїРѕР·РёС‚:</b> {amount}',
        'balance_real': 'Р РµР°Р»СЊРЅС‹Р№ рџ’°',
        'balance_bonus': 'Р‘РѕРЅСѓСЃРЅС‹Р№ рџЋЃ',
        'btn_deposit': 'РџРѕРїРѕР»РЅРёС‚СЊ',
        'btn_withdraw': 'Р’С‹РІРµСЃС‚Рё',
        'btn_withdraw_cancel': 'вќЊ РћС‚РјРµРЅР°',
        'btn_referral': 'рџ‘Ґ Р РµС„РµСЂР°Р»СЊРЅР°СЏ РїСЂРѕРіСЂР°РјРјР°',
        'btn_switch_balance': 'рџ”„ РЎРјРµРЅРёС‚СЊ СЃС‡РµС‚',
        'btn_change_language': 'рџЊђ РЎРјРµРЅРёС‚СЊ СЏР·С‹Рє',
        'balance_switched': 'РђРєС‚РёРІРЅС‹Р№ СЃС‡РµС‚ РёР·РјРµРЅРµРЅ!',
        
        # РџРѕРїРѕР»РЅРµРЅРёРµ
        'deposit_title': 'рџ’і <b>Р’С‹Р±РµСЂРёС‚Рµ СЃРїРѕСЃРѕР± РїРѕРїРѕР»РЅРµРЅРёСЏ:</b>',
        'deposit_cryptobot': 'CryptoBot',
        'deposit_enter_amount': 'рџ–Љ <b>Р’РІРµРґРёС‚Рµ СЃСѓРјРјСѓ РґР»СЏ РїРѕРїРѕР»РЅРµРЅРёСЏ</b>\n\nРјРёРЅ. {min_amount} USDT (в‰€ {min_pln} zЕ‚)\n\nрџЊђ РњРµС‚РѕРґ: CryptoBot (@send)\n\n<i>РџРѕРґРіРѕС‚РѕРІРєР° СЂРµРєРІРёР·РёС‚РѕРІ РјРѕР¶РµС‚ Р·Р°РЅСЏС‚СЊ РЅРµРєРѕС‚РѕСЂРѕРµ РІСЂРµРјСЏ...</i>',
        'deposit_min_amount': 'вќЊ РњРёРЅРёРјР°Р»СЊРЅР°СЏ СЃСѓРјРјР° РїРѕРїРѕР»РЅРµРЅРёСЏ: {min_amount} USDT (в‰€ {min_pln} zЕ‚)',
        'deposit_invalid_amount': 'вќЊ Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅСѓСЋ СЃСѓРјРјСѓ (С‡РёСЃР»Рѕ)',
        'deposit_creating': 'вЏі',
        'deposit_not_configured': 'вќЊ CryptoPay РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РћР±СЂР°С‚РёС‚РµСЃСЊ Рє Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.',
        'deposit_invoice': 'рџ’і <b>РћРїР»Р°С‚РёС‚Рµ СЃС‡С‘С‚ РґР»СЏ РїРѕРїРѕР»РЅРµРЅРёСЏ:</b>\n\nрџЊђ РњРµС‚РѕРґ: CryptoBot (@send)\n\nвЂў РЎСѓРјРјР°: {amount_usdt} USDT (в‰€ {amount_pln} zЕ‚)\n\nРЎС‡С‘С‚ РґРµР№СЃС‚РІРёС‚РµР»РµРЅ 30 РјРёРЅСѓС‚',
        'deposit_success': 'вњ… <b>РћРїР»Р°С‚Р° СѓСЃРїРµС€РЅРѕ РїРѕР»СѓС‡РµРЅР°!</b>\n\nРќР°С‡РёСЃР»РµРЅРѕ: {amount_usdt} USDT (в‰€ {amount_pln} zЕ‚)\nРќРѕРІС‹Р№ Р±Р°Р»Р°РЅСЃ: {balance_usdt} USDT (в‰€ {balance_pln} zЕ‚)',
        'deposit_pending': 'вЏі РћРїР»Р°С‚Р° РµС‰Рµ РЅРµ РїРѕР»СѓС‡РµРЅР°',
        'deposit_cancelled': 'вќЊ РћРїР»Р°С‚Р° РѕС‚РјРµРЅРµРЅР°',
        'deposit_bonus_activated': 'рџЋ‰ <b>Р‘РѕРЅСѓСЃ РЅР° 100% Рє РґРµРїРѕР·РёС‚Сѓ СѓСЃРїРµС€РЅРѕ РЅР°С‡РёСЃР»РµРЅ!</b>\n\nР’С‹ РїРѕР»СѓС‡РёР»Рё РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ <b>{amount}</b> РЅР° РІР°С€ Р±РѕРЅСѓСЃРЅС‹Р№ СЃС‡РµС‚.',
        'btn_open_invoice': 'РћС‚РєСЂС‹С‚СЊ',
        'btn_check_payment': 'РџСЂРѕРІРµСЂРёС‚СЊ',
        'btn_cancel_payment': 'РћС‚РјРµРЅРёС‚СЊ',
        
        # Р’С‹РІРѕРґ
        'withdraw_title': 'рџ’ё <b>Р’С‹Р±РµСЂРёС‚Рµ СЃРїРѕСЃРѕР± РІС‹РІРѕРґР°:</b>',
        'withdraw_cryptobot': 'CryptoBot',
        'withdraw_enter_amount': 'рџ–Љ <b>Р’РІРµРґРёС‚Рµ СЃСѓРјРјСѓ РґР»СЏ РІС‹РІРѕРґР° РѕС‚ 5 USDT:</b>\n\nРњРµС‚РѕРґ: рџЊђ CryptoBot (@send)\n\nвЂў Р”РѕСЃС‚СѓРїРЅРѕ: рџ”№ {available} USDT',
        'withdraw_min_amount': 'вќЊ РњРёРЅРёРјР°Р»СЊРЅР°СЏ СЃСѓРјРјР° РІС‹РІРѕРґР°: 5 USDT',
        'withdraw_insufficient': 'вќЊ РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґРѕСЃС‚СѓРїРЅС‹С… СЃСЂРµРґСЃС‚РІ. Р”РѕСЃС‚СѓРїРЅРѕ: {available} USDT',
        'withdraw_active_exists': 'вќЊ РЈ РІР°СЃ СѓР¶Рµ РµСЃС‚СЊ Р°РєС‚РёРІРЅР°СЏ Р·Р°СЏРІРєР° РЅР° РІС‹РІРѕРґ!',
        'withdraw_active_bonus': 'вќЊ РЈ РІР°СЃ РµСЃС‚СЊ РЅРµР·Р°РІРµСЂС€РµРЅРЅС‹Рµ Р±РѕРЅСѓСЃРЅС‹Рµ РёРіСЂС‹. Р”РѕР¶РґРёС‚РµСЃСЊ РёС… РѕРєРѕРЅС‡Р°РЅРёСЏ!',
        'withdraw_hold_error': 'вќЊ РћС€РёР±РєР° СѓРґРµСЂР¶Р°РЅРёСЏ СЃСЂРµРґСЃС‚РІ',
        'withdraw_created': 'вњ… <b>Р—Р°СЏРІРєР° РЅР° РІС‹РІРѕРґ СЃРѕР·РґР°РЅР°</b>\n\nрџ’° РЎСѓРјРјР°: {amount} USDT\nрџЊђ РњРµС‚РѕРґ: CryptoBot\n\nвЏі РћР¶РёРґР°Р№С‚Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°',
        'withdraw_blocked': 'Р’С‹РІРѕРґ Р—Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ.',
        'withdraw_rejected': 'вќЊ <b>Р—Р°СЏРІРєР° РЅР° РІС‹РІРѕРґ РѕС‚РєР»РѕРЅРµРЅР°</b>\n\nрџ’° РЎСѓРјРјР°: {amount} USDT\n\nРЎСЂРµРґСЃС‚РІР° РІРѕР·РІСЂР°С‰РµРЅС‹ РЅР° Р±Р°Р»Р°РЅСЃ',
        'withdraw_approved': 'вњ… <b>Р’С‹РІРѕРґ РѕРґРѕР±СЂРµРЅ!</b>\n\nрџ’° РЎСѓРјРјР°: {amount} USDT\nрџЊђ РњРµС‚РѕРґ: CryptoBot\n\nР§С‚РѕР±С‹ РїРѕР»СѓС‡РёС‚СЊ СЃСЂРµРґСЃС‚РІР°, РЅР°Р¶РјРёС‚Рµ РЅР° РєРЅРѕРїРєСѓ РЅРёР¶Рµ:',
        'btn_get_funds': 'рџ’Ћ РџРѕР»СѓС‡РёС‚СЊ СЃСЂРµРґСЃС‚РІР°',
        
        # РРіСЂС‹
        'games_title': 'рџЋ® <b>Р’С‹Р±РµСЂРёС‚Рµ РёРіСЂСѓ РёР· СЃРїРёСЃРєР° РЅРёР¶Рµ:</b>',
        'slots_title': 'рџЊђ <b>Р’С‹Р±РµСЂРёС‚Рµ СЂРµРіРёРѕРЅ РґРѕСЃС‚СѓРїР°...</b>',
        'slots_global': 'вЂў | РћР±С‰РёР№ РґРѕСЃС‚СѓРї рџЊЌ',
        'slots_russia': 'вЂў | Р РѕСЃСЃРёСЏ рџ‡·рџ‡є',
        'game_in_dev': 'Р Р°Р·РґРµР» РЅР°С…РѕРґРёС‚СЃСЏ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ рџљ§',
        
        # РљРЅРѕРїРєРё РёРіСЂ
        'btn_dice': 'рџЋІ РљРѕСЃС‚Рё',
        'btn_mines': 'рџ’Ј РњРёРЅС‹',
        'btn_bowling': 'рџЋі Р‘РѕСѓР»РёРЅРі',
        'btn_football': 'вљЅ Р¤СѓС‚Р±РѕР»',
        'btn_basketball': 'рџЏЂ Р‘Р°СЃРєРµС‚Р±РѕР»',
        'btn_rps': 'вњЉ РљРќР‘',
        'btn_darts': 'рџЋЇ Р”Р°СЂС‚СЃ',
        'btn_spider': 'рџЋ° РџР°СѓС‡РѕРє',
        
        # РРЅС„РѕСЂРјР°С†РёСЏ
        'info_title': 'в„№пёЏ <b>РРЅС„РѕСЂРјР°С†РёСЏ Рѕ MacvBet</b>\n\nР’С‹Р±РµСЂРёС‚Рµ СЂР°Р·РґРµР»:',
        'btn_agreement': 'рџ“„ РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРµ СЃРѕРіР»Р°С€РµРЅРёРµ',
        'btn_support': 'рџ’¬ РџРѕРґРґРµСЂР¶РєР°',
        
        # РћС€РёР±РєРё
        'error_insufficient_balance': 'вќЊ <b>РќРµ С…РІР°С‚Р°РµС‚ Р±Р°Р»Р°РЅСЃР°</b>\n\n<i>Р’Р°С€ Р±Р°Р»Р°РЅСЃ:</i> {balance}\n<i>РўСЂРµР±СѓРµС‚СЃСЏ:</i> {required}',
        'error_invalid_bet': 'вќЊ <b>РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ РєРѕРјР°РЅРґС‹</b>',
        'error_bet_range': 'вќЊ РЎС‚Р°РІРєР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РѕС‚ {min} РґРѕ {max}',
        
        # РћР±С‰РёРµ
        'main_menu': 'Р“Р»Р°РІРЅРѕРµ РјРµРЅСЋ:',
        'bet_confirmed': 'вњ… РџРѕРґС‚РІРµСЂРґРёС‚СЊ',
        'bet_rejected': 'вќЊ РћС‚РєР»РѕРЅРёС‚СЊ',
        'bet_cancelled': 'вќЊ <b>РЎС‚Р°РІРєР° РѕС‚РєР»РѕРЅРµРЅР°</b>',
        'win': 'рџЋ‰ <b>Р’Р«РР“Р Р«РЁ</b>',
        'loss': 'рџ” <b>РџСЂРѕРёРіСЂС‹С€</b>',
        
        # РљРѕСЃС‚Рё
        'dice_menu': 'вљ™пёЏ <b>Р’РёРґС‹ СЃС‚Р°РІРѕРє:</b>\n<blockquote>- С‡РµС‚|РЅРµС‡РµС‚ - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x1.9</blockquote>\n<blockquote>- Рј|Р± - РњРµРЅСЊС€Рµ(1-3) Р‘РѕР»СЊС€Рµ(4-6) РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x1.9</blockquote>\n<blockquote>- 1|2|3|4|5|6 - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x5.4</blockquote>\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'dice_make_bet': 'рџЋІ РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'dice_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ РІРёРґ СЃС‚Р°РІРєРё Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ РґР»СЏ Р·Р°РїСѓСЃРєР° РёРіСЂС‹.\n\n<blockquote>РљРѕРјР°РЅРґР°: /cube {{РЎСѓРјРјР° СЃС‚Р°РІРєРё}} {{Р’РёРґ СЃС‚Р°РІРєРё}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/cube 10 С‡РµС‚</code>\n<code>/cube 50 Р±</code>\n<code>/cube 20 5</code>',
        
        # Р‘РѕСѓР»РёРЅРі
        'bowling_make_bet': 'рџЋі РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'bowling_menu': 'рџЋі <b>Р‘РћРЈР›РРќР“</b>\n\n<b>Р’РёРґС‹ СЃС‚Р°РІРѕРє:</b>\n<blockquote>- СЃС‚СЂР°Р№Рє (6) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x5.0</blockquote>\n<blockquote>- 4-5 РєРµРіР»РµР№ - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x2.5</blockquote>\n<blockquote>- 1-3 РєРµРіР»Рё - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x1.5</blockquote>\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'bowling_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ РІРёРґ СЃС‚Р°РІРєРё Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ РґР»СЏ Р·Р°РїСѓСЃРєР° РёРіСЂС‹.\n\n<blockquote>РљРѕРјР°РЅРґР°: /bowl {{РЎСѓРјРјР° СЃС‚Р°РІРєРё}} {{Р’РёРґ СЃС‚Р°РІРєРё}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/bowl 100 СЃС‚СЂР°Р№Рє</code>\n<code>/bowl 50 4-5</code>\n<code>/bowl 20 1-3</code>',
        
        # Р”Р°СЂС‚СЃ
        'darts_make_bet': 'рџЋЇ РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'darts_menu': 'рџЋЇ <b>Р”РђР РўРЎ</b>\n\n<b>Р’РёРґС‹ СЃС‚Р°РІРѕРє:</b>\n<blockquote>- СЏР±Р»РѕС‡РєРѕ (6) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x5.0</blockquote>\n<blockquote>- 4-5 РѕС‡РєРѕРІ - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x2.5</blockquote>\n<blockquote>- 1-3 РѕС‡РєР° - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x1.5</blockquote>\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'darts_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ РІРёРґ СЃС‚Р°РІРєРё Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ РґР»СЏ Р·Р°РїСѓСЃРєР° РёРіСЂС‹.\n\n<blockquote>РљРѕРјР°РЅРґР°: /darts {{РЎСѓРјРјР° СЃС‚Р°РІРєРё}} {{Р’РёРґ СЃС‚Р°РІРєРё}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/darts 100 СЏР±Р»РѕС‡РєРѕ</code>\n<code>/darts 50 4-5</code>\n<code>/darts 20 1-3</code>',
        
        # Р‘Р°СЃРєРµС‚Р±РѕР»
        'basketball_make_bet': 'рџЏЂ РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'basketball_menu': 'рџЏЂ <b>Р‘РђРЎРљР•РўР‘РћР›</b>\n\n<b>Р’РёРґС‹ СЃС‚Р°РІРѕРє:</b>\n<blockquote>- РїРѕРїР°РґР°РЅРёРµ (4-5) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x2.0</blockquote>\n<blockquote>- РїСЂРѕРјР°С… (1-3) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x1.8</blockquote>\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'basketball_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ РІРёРґ СЃС‚Р°РІРєРё Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ РґР»СЏ Р·Р°РїСѓСЃРєР° РёРіСЂС‹.\n\n<blockquote>РљРѕРјР°РЅРґР°: /basket {{РЎСѓРјРјР° СЃС‚Р°РІРєРё}} {{Р’РёРґ СЃС‚Р°РІРєРё}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/basket 100 РїРѕРїР°РґР°РЅРёРµ</code>\n<code>/basket 50 РїСЂРѕРјР°С…</code>',
        
        # Р¤СѓС‚Р±РѕР»
        'football_make_bet': 'вљЅ РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'football_menu': 'вљЅ <b>Р¤РЈРўР‘РћР›</b>\n\n<b>Р’РёРґС‹ СЃС‚Р°РІРѕРє:</b>\n<blockquote>- РіРѕР» (3-5) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x2.0</blockquote>\n<blockquote>- РјРёРјРѕ (1-2) - РџСЂРё СѓРіР°РґС‹РІР°РЅРёРё РѕРїР»Р°С‡РёРІР°РµС‚СЃСЏ x2.5</blockquote>\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'football_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ РІРёРґ СЃС‚Р°РІРєРё Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ РґР»СЏ Р·Р°РїСѓСЃРєР° РёРіСЂС‹.\n\n<blockquote>РљРѕРјР°РЅРґР°: /foot {{РЎСѓРјРјР° СЃС‚Р°РІРєРё}} {{Р’РёРґ СЃС‚Р°РІРєРё}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/foot 100 РіРѕР»</code>\n<code>/foot 50 РјРёРјРѕ</code>',
        
        # РњРёРЅС‹
        'mines_make_bet': 'рџ’Ј РќР°С‡Р°С‚СЊ РёРіСЂСѓ',
        'mines_menu': 'рџ’Ј <b>РњРРќР«</b>\n\n<b>РџСЂР°РІРёР»Р°:</b>\n<blockquote>РџРѕР»Рµ 5x5. РћС‚РєСЂС‹РІР°Р№С‚Рµ Р±РµР·РѕРїР°СЃРЅС‹Рµ РєР»РµС‚РєРё!</blockquote>\n\nвЂў РњРёРЅС‹: 3-10\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'mines_instruction': '<blockquote>РљРѕРјР°РЅРґР°: /mines {{РЎСѓРјРјР°}} {{РљРѕР»-РІРѕ РјРёРЅ}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/mines 100 3</code>\n<code>/mines 50 5</code>',
        
        # РљРќР‘
        'rps_make_bet': 'вњЉ РЎРґРµР»Р°С‚СЊ СЃС‚Р°РІРєСѓ',
        'rps_menu': 'вњЉ <b>РљРђРњР•РќР¬-РќРћР–РќРР¦Р«-Р‘РЈРњРђР“Рђ</b>\n\n<b>РџСЂР°РІРёР»Р°:</b>\n<blockquote>РљР°РјРµРЅСЊ Р±СЊРµС‚ РЅРѕР¶РЅРёС†С‹\nРќРѕР¶РЅРёС†С‹ СЂРµР¶СѓС‚ Р±СѓРјР°РіСѓ\nР‘СѓРјР°РіР° РЅР°РєСЂС‹РІР°РµС‚ РєР°РјРµРЅСЊ</blockquote>\n\n<b>РљРѕСЌС„С„РёС†РёРµРЅС‚ РїСЂРё РїРѕР±РµРґРµ:</b> x2.0\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'rps_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ СЃРІРѕР№ С…РѕРґ Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ.\n\n<blockquote>РљРѕРјР°РЅРґР°: /knb {{РЎСѓРјРјР°}} {{Рє|РЅ|Р±}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/knb 100 Рє</code> - РєР°РјРµРЅСЊ\n<code>/knb 50 РЅ</code> - РЅРѕР¶РЅРёС†С‹\n<code>/knb 75 Р±</code> - Р±СѓРјР°РіР°',
        
        # РџР°СѓС‡РѕРє
        'spider_make_bet': 'рџЋ° РќР°С‡Р°С‚СЊ РёРіСЂСѓ',
        'spider_menu': 'рџЋ° <b>РџРђРЈР§РћРљ</b>\n\n<b>РџСЂР°РІРёР»Р°:</b>\n<blockquote>5 СЂСЏРґРѕРІ РїРѕ 3 РєР»РµС‚РєРё. РР·Р±РµРіР°Р№С‚Рµ РїР°СѓРєРѕРІ!</blockquote>\n\n<b>РЈСЂРѕРІРЅРё СЃР»РѕР¶РЅРѕСЃС‚Рё:</b>\nвЂў <b>Р›РµРіРєРёР№ (e)</b> - РїР°СѓРє РјРѕР¶РµС‚ РѕС‚СЃСѓС‚СЃС‚РІРѕРІР°С‚СЊ, x1.2 + 0.25/СЂСЏРґ\nвЂў <b>РЎСЂРµРґРЅРёР№ (m)</b> - 1 РїР°СѓРє РІ СЂСЏРґСѓ, x1.5 + 0.35/СЂСЏРґ\nвЂў <b>РЎР»РѕР¶РЅС‹Р№ (h)</b> - 2 РїР°СѓРєР° РІ СЂСЏРґСѓ, x2.0 + 0.5/СЂСЏРґ\n\nвЂў РњРёРЅ.СЃС‚Р°РІРєР°: {min_bet}в‚Ѕ\nвЂў РњР°РєСЃ.СЃС‚Р°РІРєР°: {max_bet}в‚Ѕ',
        'spider_instruction': 'Р’С‹Р±РµСЂРёС‚Рµ СЃР»РѕР¶РЅРѕСЃС‚СЊ Рё РІРІРµРґРёС‚Рµ РєРѕРјР°РЅРґСѓ.\n\n<blockquote>РљРѕРјР°РЅРґР°: /spider {{РЎСѓРјРјР°}} {{e|m|h}}</blockquote>\n\n<i>РџСЂРёРјРµСЂС‹:</i>\n<code>/spider 100 e</code> - Р»РµРіРєРёР№\n<code>/spider 50 m</code> - СЃСЂРµРґРЅРёР№\n<code>/spider 200 h</code> - СЃР»РѕР¶РЅС‹Р№',
    },
    
    'pl': {
        # Podstawowe przyciski
        'btn_slots': 'рџЋ° Sloty',  # legacy вЂ” juЕј nie wyЕ›wietlane, zostawione dla starych handlerГіw
        'btn_miniapp': 'рџЋ° Mini-App',
        'btn_games': 'рџЋІ Gry TG',
        'btn_profile': 'рџ‘¤ Profil',
        'btn_info': 'вќ” Informacje',
        'btn_back': 'вЂ№ Wstecz',
        'miniapp_intro': 'рџЋ° <b>MacvBet Mini-App</b>\n\nNaciЕ›nij przycisk poniЕјej, aby otworzyД‡ kasyno wewnД…trz Telegrama.',
        'btn_open_miniapp': 'рџЋ® OtwГіrz Mini-App',
        
        # Powitanie
        'welcome': 'рџ‘‹ Witaj, {name}!',
        'choose_language': 'рџЊђ Р’С‹Р±РµСЂРёС‚Рµ СЏР·С‹Рє / Wybierz jД™zyk:',
        'language_set': 'вњ… JД™zyk ustawiony: Polski',
        
        # Profil
        'profile_balance': 'рџ’° <b>Saldo:</b> {balance}',
        'profile_bonus': 'рџЋЃ <b>Saldo bonusowe:</b> {bonus}',
        'profile_active': 'рџЋЇ <b>Aktywne konto:</b> {type}',
        'profile_wager': 'рџ“Љ <b>ObrГіt bonusu:</b> {current} / {required} ({percent}%)',
        'profile_to_lose': 'вљ пёЏ <b>PozostaЕ‚o do obrotu depozytu:</b> {amount}',
        'balance_real': 'Rzeczywiste рџ’°',
        'balance_bonus': 'Bonusowe рџЋЃ',
        'btn_deposit': 'WpЕ‚aД‡',
        'btn_withdraw': 'WypЕ‚aД‡',
        'btn_withdraw_cancel': 'вќЊ Anuluj',
        'btn_referral': 'рџ‘Ґ Program partnerski',
        'btn_switch_balance': 'рџ”„ ZmieЕ„ konto',
        'btn_change_language': 'рџЊђ ZmieЕ„ jД™zyk',
        'balance_switched': 'Aktywne konto zmienione!',
        
        # WpЕ‚ata
        'deposit_title': 'рџ’і <b>Wybierz metodД™ wpЕ‚aty:</b>',
        'deposit_cryptobot': 'CryptoBot',
        'deposit_enter_amount': 'рџ–Љ <b>WprowadЕє kwotД™ wpЕ‚aty</b>\n\nmin. {min_amount} USDT (в‰€ {min_pln} zЕ‚)\n\nрџЊђ Metoda: CryptoBot (@send)\n\n<i>Przygotowanie danych moЕјe chwilД™ potrwaД‡...</i>',
        'deposit_min_amount': 'вќЊ Minimalna kwota wpЕ‚aty: {min_amount} USDT (в‰€ {min_pln} zЕ‚)',
        'deposit_invalid_amount': 'вќЊ WprowadЕє poprawnД… kwotД™ (liczbД™)',
        'deposit_creating': 'вЏі',
        'deposit_not_configured': 'вќЊ CryptoPay nie jest skonfigurowany. Skontaktuj siД™ z administratorem.',
        'deposit_invoice': 'рџ’і <b>OpЕ‚aД‡ rachunek aby dokonaД‡ wpЕ‚aty:</b>\n\nрџЊђ Metoda: CryptoBot (@send)\n\nвЂў Kwota: {amount_usdt} USDT (в‰€ {amount_pln} zЕ‚)\n\nRachunek waЕјny 30 minut',
        'deposit_success': 'вњ… <b>PЕ‚atnoЕ›Д‡ otrzymana pomyЕ›lnie!</b>\n\nNaliczono: {amount_usdt} USDT (в‰€ {amount_pln} zЕ‚)\nNowe saldo: {balance_usdt} USDT (в‰€ {balance_pln} zЕ‚)',
        'deposit_pending': 'вЏі PЕ‚atnoЕ›Д‡ jeszcze nie otrzymana',
        'deposit_cancelled': 'вќЊ PЕ‚atnoЕ›Д‡ anulowana',
        'deposit_bonus_activated': 'рџЋ‰ <b>Bonus 100% do depozytu zostaЕ‚ naliczony!</b>\n\nOtrzymaЕ‚eЕ› dodatkowo <b>{amount}</b> na swoje konto bonusowe.',
        'btn_open_invoice': 'OtwГіrz',
        'btn_check_payment': 'SprawdЕє',
        'btn_cancel_payment': 'Anuluj',
        
        # WypЕ‚ata
        'withdraw_title': 'рџ’ё <b>Wybierz metodД™ wypЕ‚aty:</b>',
        'withdraw_cryptobot': 'CryptoBot',
        'withdraw_enter_amount': 'рџ–Љ <b>WprowadЕє kwotД™ wypЕ‚aty od 5 USDT:</b>\n\nMetoda: рџЊђ CryptoBot (@send)\n\nвЂў DostД™pne: рџ”№ {available} USDT',
        'withdraw_min_amount': 'вќЊ Minimalna kwota wypЕ‚aty: 5 USDT',
        'withdraw_insufficient': 'вќЊ NiewystarczajД…ce Е›rodki. DostД™pne: {available} USDT',
        'withdraw_active_exists': 'вќЊ Masz juЕј aktywne zlecenie wypЕ‚aty!',
        'withdraw_active_bonus': 'вќЊ Masz niezakoЕ„czone gry bonusowe. Poczekaj na ich zakoЕ„czenie!',
        'withdraw_hold_error': 'вќЊ BЕ‚Д…d blokowania Е›rodkГіw',
        'withdraw_created': 'вњ… <b>Zlecenie wypЕ‚aty utworzone</b>\n\nрџ’° Kwota: {amount} USDT\nрџЊђ Metoda: CryptoBot\n\nвЏі Oczekuj na potwierdzenie administratora',
        'withdraw_blocked': 'WypЕ‚ata Zablokowana.',
        'withdraw_rejected': 'вќЊ <b>Zlecenie wypЕ‚aty odrzucone</b>\n\nрџ’° Kwota: {amount} USDT\n\nЕљrodki zwrГіcone na saldo',
        'withdraw_approved': 'вњ… <b>WypЕ‚ata zatwierdzona!</b>\n\nрџ’° Kwota: {amount} USDT\nрџЊђ Metoda: CryptoBot\n\nAby otrzymaД‡ Е›rodki, kliknij przycisk poniЕјej:',
        'btn_get_funds': 'рџ’Ћ Odbierz Е›rodki',
        
        # Gry
        'games_title': 'рџЋ® <b>Wybierz grД™ z listy poniЕјej:</b>',
        'slots_title': 'рџЊђ <b>Wybierz region dostД™pu...</b>',
        'slots_global': 'вЂў | DostД™p globalny рџЊЌ',
        'slots_russia': 'вЂў | Rosja рџ‡·рџ‡є',
        'game_in_dev': 'Sekcja w trakcie rozwoju рџљ§',
        
        # Przyciski gier
        'btn_dice': 'рџЋІ KoЕ›ci',
        'btn_mines': 'рџ’Ј Miny',
        'btn_bowling': 'рџЋі KrД™gle',
        'btn_football': 'вљЅ PiЕ‚ka noЕјna',
        'btn_basketball': 'рџЏЂ KoszykГіwka',
        'btn_rps': 'вњЉ Papier-KamieЕ„-NoЕјyce',
        'btn_darts': 'рџЋЇ Rzutki',
        'btn_spider': 'рџЋ° PajД…k',
        
        # Informacje
        'info_title': 'в„№пёЏ <b>Informacje o MacvBet</b>\n\nWybierz sekcjД™:',
        'btn_agreement': 'рџ“„ Regulamin',
        'btn_support': 'рџ’¬ Wsparcie',
        
        # BЕ‚Д™dy
        'error_insufficient_balance': 'вќЊ <b>NiewystarczajД…ce saldo</b>\n\n<i>Twoje saldo:</i> {balance}\n<i>Wymagane:</i> {required}',
        'error_invalid_bet': 'вќЊ <b>NieprawidЕ‚owy format komendy</b>',
        'error_bet_range': 'вќЊ ZakЕ‚ad musi byД‡ od {min} do {max}',
        
        # OgГіlne
        'main_menu': 'Menu gЕ‚Гіwne:',
        'bet_confirmed': 'вњ… PotwierdЕє',
        'bet_rejected': 'вќЊ OdrzuД‡',
        'bet_cancelled': 'вќЊ <b>ZakЕ‚ad odrzucony</b>',
        'win': 'рџЋ‰ <b>WYGRANA</b>',
        'loss': 'рџ” <b>Przegrana</b>',
        
        # KoЕ›ci
        'dice_menu': 'вљ™пёЏ <b>Rodzaje zakЕ‚adГіw:</b>\n<blockquote>- parzyste|nieparzyste - Przy trafieniu wypЕ‚ata x1.9</blockquote>\n<blockquote>- m|w - Mniej(1-3) WiД™cej(4-6) Przy trafieniu wypЕ‚ata x1.9</blockquote>\n<blockquote>- 1|2|3|4|5|6 - Przy trafieniu wypЕ‚ata x5.4</blockquote>\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'dice_make_bet': 'рџЋІ Postaw zakЕ‚ad',
        'dice_instruction': 'Wybierz rodzaj zakЕ‚adu i wprowadЕє komendД™ aby rozpoczД…Д‡ grД™.\n\n<blockquote>Komenda: /cube {{Kwota zakЕ‚adu}} {{Rodzaj zakЕ‚adu}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/cube 10 parzyste</code>\n<code>/cube 50 w</code>\n<code>/cube 20 5</code>',
        
        # KrД™gle
        'bowling_make_bet': 'рџЋі Postaw zakЕ‚ad',
        'bowling_menu': 'рџЋі <b>KRДGLE</b>\n\n<b>Rodzaje zakЕ‚adГіw:</b>\n<blockquote>- strike (6) - Przy trafieniu wypЕ‚ata x5.0</blockquote>\n<blockquote>- 4-5 krД™gli - Przy trafieniu wypЕ‚ata x2.5</blockquote>\n<blockquote>- 1-3 krД™gle - Przy trafieniu wypЕ‚ata x1.5</blockquote>\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'bowling_instruction': 'Wybierz rodzaj zakЕ‚adu i wprowadЕє komendД™ aby rozpoczД…Д‡ grД™.\n\n<blockquote>Komenda: /bowl {{Kwota zakЕ‚adu}} {{Rodzaj zakЕ‚adu}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/bowl 100 strike</code>\n<code>/bowl 50 4-5</code>\n<code>/bowl 20 1-3</code>',
        
        # Rzutki
        'darts_make_bet': 'рџЋЇ Postaw zakЕ‚ad',
        'darts_menu': 'рџЋЇ <b>RZUTKI</b>\n\n<b>Rodzaje zakЕ‚adГіw:</b>\n<blockquote>- Е›rodek (6) - Przy trafieniu wypЕ‚ata x5.0</blockquote>\n<blockquote>- 4-5 punktГіw - Przy trafieniu wypЕ‚ata x2.5</blockquote>\n<blockquote>- 1-3 punkty - Przy trafieniu wypЕ‚ata x1.5</blockquote>\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'darts_instruction': 'Wybierz rodzaj zakЕ‚adu i wprowadЕє komendД™ aby rozpoczД…Д‡ grД™.\n\n<blockquote>Komenda: /darts {{Kwota zakЕ‚adu}} {{Rodzaj zakЕ‚adu}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/darts 100 Е›rodek</code>\n<code>/darts 50 4-5</code>\n<code>/darts 20 1-3</code>',
        
        # KoszykГіwka
        'basketball_make_bet': 'рџЏЂ Postaw zakЕ‚ad',
        'basketball_menu': 'рџЏЂ <b>KOSZYKГ“WKA</b>\n\n<b>Rodzaje zakЕ‚adГіw:</b>\n<blockquote>- trafienie (4-5) - Przy trafieniu wypЕ‚ata x2.0</blockquote>\n<blockquote>- pudЕ‚o (1-3) - Przy trafieniu wypЕ‚ata x1.8</blockquote>\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'basketball_instruction': 'Wybierz rodzaj zakЕ‚adu i wprowadЕє komendД™ aby rozpoczД…Д‡ grД™.\n\n<blockquote>Komenda: /basket {{Kwota zakЕ‚adu}} {{Rodzaj zakЕ‚adu}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/basket 100 trafienie</code>\n<code>/basket 50 pudЕ‚o</code>',
        
        # PiЕ‚ka noЕјna
        'football_make_bet': 'вљЅ Postaw zakЕ‚ad',
        'football_menu': 'вљЅ <b>PIЕЃKA NOЕ»NA</b>\n\n<b>Rodzaje zakЕ‚adГіw:</b>\n<blockquote>- gol (3-5) - Przy trafieniu wypЕ‚ata x2.0</blockquote>\n<blockquote>- obok (1-2) - Przy trafieniu wypЕ‚ata x2.5</blockquote>\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'football_instruction': 'Wybierz rodzaj zakЕ‚adu i wprowadЕє komendД™ aby rozpoczД…Д‡ grД™.\n\n<blockquote>Komenda: /foot {{Kwota zakЕ‚adu}} {{Rodzaj zakЕ‚adu}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/foot 100 gol</code>\n<code>/foot 50 obok</code>',
        
        # Miny
        'mines_make_bet': 'рџ’Ј Rozpocznij grД™',
        'mines_menu': 'рџ’Ј <b>MINY</b>\n\n<b>Zasady:</b>\n<blockquote>Pole 5x5. Odkrywaj bezpieczne pola!</blockquote>\n\nвЂў Miny: 3-10\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'mines_instruction': '<blockquote>Komenda: /mines {{Kwota}} {{Liczba min}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/mines 100 3</code>\n<code>/mines 50 5</code>',
        
        # Papier-KamieЕ„-NoЕјyce
        'rps_make_bet': 'вњЉ Postaw zakЕ‚ad',
        'rps_menu': 'вњЉ <b>PAPIER-KAMIEЕѓ-NOЕ»YCE</b>\n\n<b>Zasady:</b>\n<blockquote>KamieЕ„ bije noЕјyce\nNoЕјyce tnД… papier\nPapier przykrywa kamieЕ„</blockquote>\n\n<b>WspГіЕ‚czynnik przy wygranej:</b> x2.0\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'rps_instruction': 'Wybierz swГіj ruch i wprowadЕє komendД™.\n\n<blockquote>Komenda: /knb {{Kwota}} {{k|n|p}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/knb 100 k</code> - kamieЕ„\n<code>/knb 50 n</code> - noЕјyce\n<code>/knb 75 p</code> - papier',
        
        # PajД…k
        'spider_make_bet': 'рџЋ° Rozpocznij grД™',
        'spider_menu': 'рџЋ° <b>PAJД„K</b>\n\n<b>Zasady:</b>\n<blockquote>5 rzД™dГіw po 3 pola. Unikaj pajД…kГіw!</blockquote>\n\n<b>Poziomy trudnoЕ›ci:</b>\nвЂў <b>ЕЃatwy (e)</b> - pajД…k moЕјe nie byД‡, x1.2 + 0.25/rzД…d\nвЂў <b>Ељredni (m)</b> - 1 pajД…k w rzД™dzie, x1.5 + 0.35/rzД…d\nвЂў <b>Trudny (h)</b> - 2 pajД…ki w rzД™dzie, x2.0 + 0.5/rzД…d\n\nвЂў Min.zakЕ‚ad: {min_bet}в‚Ѕ\nвЂў Maks.zakЕ‚ad: {max_bet}в‚Ѕ',
        'spider_instruction': 'Wybierz poziom trudnoЕ›ci i wprowadЕє komendД™.\n\n<blockquote>Komenda: /spider {{Kwota}} {{e|m|h}}</blockquote>\n\n<i>PrzykЕ‚ady:</i>\n<code>/spider 100 e</code> - Е‚atwy\n<code>/spider 50 m</code> - Е›redni\n<code>/spider 200 h</code> - trudny',
    }
}


def get_text(lang: str, key: str, **kwargs) -> str:
    """
    РџРѕР»СѓС‡РёС‚СЊ РїРµСЂРµРІРµРґРµРЅРЅС‹Р№ С‚РµРєСЃС‚
    
    Args:
        lang: РљРѕРґ СЏР·С‹РєР° (ru, pl)
        key: РљР»СЋС‡ РїРµСЂРµРІРѕРґР°
        **kwargs: РџР°СЂР°РјРµС‚СЂС‹ РґР»СЏ С„РѕСЂРјР°С‚РёСЂРѕРІР°РЅРёСЏ
        
    Returns:
        РџРµСЂРµРІРµРґРµРЅРЅС‹Р№ С‚РµРєСЃС‚
    """
    if lang not in TRANSLATIONS:
        lang = 'ru'
    
    text = TRANSLATIONS[lang].get(key, TRANSLATIONS['ru'].get(key, key))
    
    if kwargs:
        try:
            return text.format(**kwargs)
        except KeyError:
            return text
    
    return text


def format_amount(amount: float) -> str:
    """Р¤РѕСЂРјР°С‚РёСЂРѕРІР°С‚СЊ СЃСѓРјРјСѓ Р±РµР· РґРµСЃСЏС‚РёС‡РЅС‹С… Р·РЅР°РєРѕРІ"""
    return f"{int(amount)}"
