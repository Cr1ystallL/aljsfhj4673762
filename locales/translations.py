"""
Переводы для всех языков
"""

TRANSLATIONS = {
    'ru': {
        # Основные кнопки
        'btn_slots': '🎰 Слоты',  # legacy — больше не отображается, оставлен для старых хэндлеров
        'btn_miniapp': '🎰 Mini-App',
        'btn_games': '🎲 Игры TG',
        'btn_profile': '👤 Профиль',
        'btn_info': '❔ Информация',
        'btn_back': '‹ Назад',
        'miniapp_intro': '🎰 <b>MacvBet Mini-App</b>\n\nНажмите кнопку ниже, чтобы открыть казино внутри Telegram.',
        'btn_open_miniapp': '🎮 Открыть Mini-App',
        
        # Приветствие
        'welcome': '👋 Добро пожаловать, {name}!',
        'choose_language': '🌐 Выберите язык / Wybierz język:',
        'language_set': '✅ Язык установлен: Русский',
        
        # Профиль
        'profile_balance': '💰 <b>Баланс:</b> {balance}',
        'profile_bonus': '🎁 <b>Бонусный баланс:</b> {bonus}',
        'profile_active': '🎯 <b>Активный счет:</b> {type}',
        'profile_wager': '📊 <b>Отыгрыш бонуса:</b> {current} / {required} ({percent}%)',
        'profile_to_lose': '⚠️ <b>Осталось отыграть депозит:</b> {amount}',
        'balance_real': 'Реальный 💰',
        'balance_bonus': 'Бонусный 🎁',
        'btn_deposit': 'Пополнить',
        'btn_withdraw': 'Вывести',
        'btn_withdraw_cancel': '❌ Отмена',
        'btn_referral': '👥 Реферальная программа',
        'btn_switch_balance': '🔄 Сменить счет',
        'btn_change_language': '🌐 Сменить язык',
        'balance_switched': 'Активный счет изменен!',
        
        # Пополнение
        'deposit_title': '💳 <b>Выберите способ пополнения:</b>',
        'deposit_cryptobot': 'CryptoBot',
        'deposit_enter_amount': '🖊 <b>Введите сумму для пополнения</b>\n\nмин. 3.61 USDT\n\n🌐 Метод: CryptoBot (@send)\n\n<i>Подготовка реквизитов может занять некоторое время...</i>',
        'deposit_min_amount': '❌ Минимальная сумма пополнения: 3.61 USDT',
        'deposit_invalid_amount': '❌ Введите корректную сумму (число)',
        'deposit_creating': '⏳',
        'deposit_not_configured': '❌ CryptoPay не настроен. Обратитесь к администратору.',
        'deposit_invoice': '💳 <b>Оплатите счёт для пополнения:</b>\n\n🌐 Метод: CryptoBot (@send)\n\n• Сумма: {amount} USDT\n\nСчёт действителен 30 минут',
        'deposit_success': '✅ <b>Оплата успешно получена!</b>\n\nНачислено: {amount} USDT\nНовый баланс: {balance} USDT',
        'deposit_pending': '⏳ Оплата еще не получена',
        'deposit_cancelled': '❌ Оплата отменена',
        'deposit_bonus_activated': '🎉 <b>Бонус на 100% к депозиту успешно начислен!</b>\n\nВы получили дополнительно <b>{amount}</b> на ваш бонусный счет.',
        'btn_open_invoice': 'Открыть',
        'btn_check_payment': 'Проверить',
        'btn_cancel_payment': 'Отменить',
        
        # Вывод
        'withdraw_title': '💸 <b>Выберите способ вывода:</b>',
        'withdraw_cryptobot': 'CryptoBot',
        'withdraw_enter_amount': '🖊 <b>Введите сумму для вывода от 5 USDT:</b>\n\nМетод: 🌐 CryptoBot (@send)\n\n• Доступно: 🔹 {available} USDT',
        'withdraw_min_amount': '❌ Минимальная сумма вывода: 5 USDT',
        'withdraw_insufficient': '❌ Недостаточно доступных средств. Доступно: {available} USDT',
        'withdraw_active_exists': '❌ У вас уже есть активная заявка на вывод!',
        'withdraw_active_bonus': '❌ У вас есть незавершенные бонусные игры. Дождитесь их окончания!',
        'withdraw_hold_error': '❌ Ошибка удержания средств',
        'withdraw_created': '✅ <b>Заявка на вывод создана</b>\n\n💰 Сумма: {amount} USDT\n🌐 Метод: CryptoBot\n\n⏳ Ожидайте подтверждения администратора',
        'withdraw_blocked': 'Вывод Заблокирован.',
        'withdraw_rejected': '❌ <b>Заявка на вывод отклонена</b>\n\n💰 Сумма: {amount} USDT\n\nСредства возвращены на баланс',
        'withdraw_approved': '✅ <b>Вывод одобрен!</b>\n\n💰 Сумма: {amount} USDT\n🌐 Метод: CryptoBot\n\nЧтобы получить средства, нажмите на кнопку ниже:',
        'btn_get_funds': '💎 Получить средства',
        
        # Игры
        'games_title': '🎮 <b>Выберите игру из списка ниже:</b>',
        'slots_title': '🌐 <b>Выберите регион доступа...</b>',
        'slots_global': '• | Общий доступ 🌍',
        'slots_russia': '• | Россия 🇷🇺',
        'game_in_dev': 'Раздел находится в разработке 🚧',
        
        # Кнопки игр
        'btn_dice': '🎲 Кости',
        'btn_mines': '💣 Мины',
        'btn_bowling': '🎳 Боулинг',
        'btn_football': '⚽ Футбол',
        'btn_basketball': '🏀 Баскетбол',
        'btn_rps': '✊ КНБ',
        'btn_darts': '🎯 Дартс',
        'btn_spider': '🎰 Паучок',
        
        # Информация
        'info_title': 'ℹ️ <b>Информация о MacvBet</b>\n\nВыберите раздел:',
        'btn_agreement': '📄 Пользовательское соглашение',
        'btn_support': '💬 Поддержка',
        
        # Ошибки
        'error_insufficient_balance': '❌ <b>Не хватает баланса</b>\n\n<i>Ваш баланс:</i> {balance}\n<i>Требуется:</i> {required}',
        'error_invalid_bet': '❌ <b>Неверный формат команды</b>',
        'error_bet_range': '❌ Ставка должна быть от {min} до {max}',
        
        # Общие
        'main_menu': 'Главное меню:',
        'bet_confirmed': '✅ Подтвердить',
        'bet_rejected': '❌ Отклонить',
        'bet_cancelled': '❌ <b>Ставка отклонена</b>',
        'win': '🎉 <b>ВЫИГРЫШ</b>',
        'loss': '😔 <b>Проигрыш</b>',
        
        # Кости
        'dice_menu': '⚙️ <b>Виды ставок:</b>\n<blockquote>- чет|нечет - При угадывании оплачивается x1.9</blockquote>\n<blockquote>- м|б - Меньше(1-3) Больше(4-6) При угадывании оплачивается x1.9</blockquote>\n<blockquote>- 1|2|3|4|5|6 - При угадывании оплачивается x5.4</blockquote>\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'dice_make_bet': '🎲 Сделать ставку',
        'dice_instruction': 'Выберите вид ставки и введите команду для запуска игры.\n\n<blockquote>Команда: /cube {{Сумма ставки}} {{Вид ставки}}</blockquote>\n\n<i>Примеры:</i>\n<code>/cube 10 чет</code>\n<code>/cube 50 б</code>\n<code>/cube 20 5</code>',
        
        # Боулинг
        'bowling_make_bet': '🎳 Сделать ставку',
        'bowling_menu': '🎳 <b>БОУЛИНГ</b>\n\n<b>Виды ставок:</b>\n<blockquote>- страйк (6) - При угадывании оплачивается x5.0</blockquote>\n<blockquote>- 4-5 кеглей - При угадывании оплачивается x2.5</blockquote>\n<blockquote>- 1-3 кегли - При угадывании оплачивается x1.5</blockquote>\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'bowling_instruction': 'Выберите вид ставки и введите команду для запуска игры.\n\n<blockquote>Команда: /bowl {{Сумма ставки}} {{Вид ставки}}</blockquote>\n\n<i>Примеры:</i>\n<code>/bowl 100 страйк</code>\n<code>/bowl 50 4-5</code>\n<code>/bowl 20 1-3</code>',
        
        # Дартс
        'darts_make_bet': '🎯 Сделать ставку',
        'darts_menu': '🎯 <b>ДАРТС</b>\n\n<b>Виды ставок:</b>\n<blockquote>- яблочко (6) - При угадывании оплачивается x5.0</blockquote>\n<blockquote>- 4-5 очков - При угадывании оплачивается x2.5</blockquote>\n<blockquote>- 1-3 очка - При угадывании оплачивается x1.5</blockquote>\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'darts_instruction': 'Выберите вид ставки и введите команду для запуска игры.\n\n<blockquote>Команда: /darts {{Сумма ставки}} {{Вид ставки}}</blockquote>\n\n<i>Примеры:</i>\n<code>/darts 100 яблочко</code>\n<code>/darts 50 4-5</code>\n<code>/darts 20 1-3</code>',
        
        # Баскетбол
        'basketball_make_bet': '🏀 Сделать ставку',
        'basketball_menu': '🏀 <b>БАСКЕТБОЛ</b>\n\n<b>Виды ставок:</b>\n<blockquote>- попадание (4-5) - При угадывании оплачивается x2.0</blockquote>\n<blockquote>- промах (1-3) - При угадывании оплачивается x1.8</blockquote>\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'basketball_instruction': 'Выберите вид ставки и введите команду для запуска игры.\n\n<blockquote>Команда: /basket {{Сумма ставки}} {{Вид ставки}}</blockquote>\n\n<i>Примеры:</i>\n<code>/basket 100 попадание</code>\n<code>/basket 50 промах</code>',
        
        # Футбол
        'football_make_bet': '⚽ Сделать ставку',
        'football_menu': '⚽ <b>ФУТБОЛ</b>\n\n<b>Виды ставок:</b>\n<blockquote>- гол (3-5) - При угадывании оплачивается x2.0</blockquote>\n<blockquote>- мимо (1-2) - При угадывании оплачивается x2.5</blockquote>\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'football_instruction': 'Выберите вид ставки и введите команду для запуска игры.\n\n<blockquote>Команда: /foot {{Сумма ставки}} {{Вид ставки}}</blockquote>\n\n<i>Примеры:</i>\n<code>/foot 100 гол</code>\n<code>/foot 50 мимо</code>',
        
        # Мины
        'mines_make_bet': '💣 Начать игру',
        'mines_menu': '💣 <b>МИНЫ</b>\n\n<b>Правила:</b>\n<blockquote>Поле 5x5. Открывайте безопасные клетки!</blockquote>\n\n• Мины: 3-10\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'mines_instruction': '<blockquote>Команда: /mines {{Сумма}} {{Кол-во мин}}</blockquote>\n\n<i>Примеры:</i>\n<code>/mines 100 3</code>\n<code>/mines 50 5</code>',
        
        # КНБ
        'rps_make_bet': '✊ Сделать ставку',
        'rps_menu': '✊ <b>КАМЕНЬ-НОЖНИЦЫ-БУМАГА</b>\n\n<b>Правила:</b>\n<blockquote>Камень бьет ножницы\nНожницы режут бумагу\nБумага накрывает камень</blockquote>\n\n<b>Коэффициент при победе:</b> x2.0\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'rps_instruction': 'Выберите свой ход и введите команду.\n\n<blockquote>Команда: /knb {{Сумма}} {{к|н|б}}</blockquote>\n\n<i>Примеры:</i>\n<code>/knb 100 к</code> - камень\n<code>/knb 50 н</code> - ножницы\n<code>/knb 75 б</code> - бумага',
        
        # Паучок
        'spider_make_bet': '🎰 Начать игру',
        'spider_menu': '🎰 <b>ПАУЧОК</b>\n\n<b>Правила:</b>\n<blockquote>5 рядов по 3 клетки. Избегайте пауков!</blockquote>\n\n<b>Уровни сложности:</b>\n• <b>Легкий (e)</b> - паук может отсутствовать, x1.2 + 0.25/ряд\n• <b>Средний (m)</b> - 1 паук в ряду, x1.5 + 0.35/ряд\n• <b>Сложный (h)</b> - 2 паука в ряду, x2.0 + 0.5/ряд\n\n• Мин.ставка: {min_bet}₽\n• Макс.ставка: {max_bet}₽',
        'spider_instruction': 'Выберите сложность и введите команду.\n\n<blockquote>Команда: /spider {{Сумма}} {{e|m|h}}</blockquote>\n\n<i>Примеры:</i>\n<code>/spider 100 e</code> - легкий\n<code>/spider 50 m</code> - средний\n<code>/spider 200 h</code> - сложный',
    },
    
    'pl': {
        # Podstawowe przyciski
        'btn_slots': '🎰 Sloty',  # legacy — już nie wyświetlane, zostawione dla starych handlerów
        'btn_miniapp': '🎰 Mini-App',
        'btn_games': '🎲 Gry TG',
        'btn_profile': '👤 Profil',
        'btn_info': '❔ Informacje',
        'btn_back': '‹ Wstecz',
        'miniapp_intro': '🎰 <b>MacvBet Mini-App</b>\n\nNaciśnij przycisk poniżej, aby otworzyć kasyno wewnątrz Telegrama.',
        'btn_open_miniapp': '🎮 Otwórz Mini-App',
        
        # Powitanie
        'welcome': '👋 Witaj, {name}!',
        'choose_language': '🌐 Выберите язык / Wybierz język:',
        'language_set': '✅ Język ustawiony: Polski',
        
        # Profil
        'profile_balance': '💰 <b>Saldo:</b> {balance}',
        'profile_bonus': '🎁 <b>Saldo bonusowe:</b> {bonus}',
        'profile_active': '🎯 <b>Aktywne konto:</b> {type}',
        'profile_wager': '📊 <b>Obrót bonusu:</b> {current} / {required} ({percent}%)',
        'profile_to_lose': '⚠️ <b>Pozostało do obrotu depozytu:</b> {amount}',
        'balance_real': 'Rzeczywiste 💰',
        'balance_bonus': 'Bonusowe 🎁',
        'btn_deposit': 'Wpłać',
        'btn_withdraw': 'Wypłać',
        'btn_withdraw_cancel': '❌ Anuluj',
        'btn_referral': '👥 Program partnerski',
        'btn_switch_balance': '🔄 Zmień konto',
        'btn_change_language': '🌐 Zmień język',
        'balance_switched': 'Aktywne konto zmienione!',
        
        # Wpłata
        'deposit_title': '💳 <b>Wybierz metodę wpłaty:</b>',
        'deposit_cryptobot': 'CryptoBot',
        'deposit_enter_amount': '🖊 <b>Wprowadź kwotę wpłaty</b>\n\nmin. 3.61 USDT\n\n🌐 Metoda: CryptoBot (@send)\n\n<i>Przygotowanie danych może chwilę potrwać...</i>',
        'deposit_min_amount': '❌ Minimalna kwota wpłaty: 3.61 USDT',
        'deposit_invalid_amount': '❌ Wprowadź poprawną kwotę (liczbę)',
        'deposit_creating': '⏳',
        'deposit_not_configured': '❌ CryptoPay nie jest skonfigurowany. Skontaktuj się z administratorem.',
        'deposit_invoice': '💳 <b>Opłać rachunek aby dokonać wpłaty:</b>\n\n🌐 Metoda: CryptoBot (@send)\n\n• Kwota: {amount} USDT\n\nRachunek ważny 30 minut',
        'deposit_success': '✅ <b>Płatność otrzymana pomyślnie!</b>\n\nNaliczono: {amount} USDT\nNowe saldo: {balance} USDT',
        'deposit_pending': '⏳ Płatność jeszcze nie otrzymana',
        'deposit_cancelled': '❌ Płatność anulowana',
        'deposit_bonus_activated': '🎉 <b>Bonus 100% do depozytu został naliczony!</b>\n\nOtrzymałeś dodatkowo <b>{amount}</b> na swoje konto bonusowe.',
        'btn_open_invoice': 'Otwórz',
        'btn_check_payment': 'Sprawdź',
        'btn_cancel_payment': 'Anuluj',
        
        # Wypłata
        'withdraw_title': '💸 <b>Wybierz metodę wypłaty:</b>',
        'withdraw_cryptobot': 'CryptoBot',
        'withdraw_enter_amount': '🖊 <b>Wprowadź kwotę wypłaty od 5 USDT:</b>\n\nMetoda: 🌐 CryptoBot (@send)\n\n• Dostępne: 🔹 {available} USDT',
        'withdraw_min_amount': '❌ Minimalna kwota wypłaty: 5 USDT',
        'withdraw_insufficient': '❌ Niewystarczające środki. Dostępne: {available} USDT',
        'withdraw_active_exists': '❌ Masz już aktywne zlecenie wypłaty!',
        'withdraw_active_bonus': '❌ Masz niezakończone gry bonusowe. Poczekaj na ich zakończenie!',
        'withdraw_hold_error': '❌ Błąd blokowania środków',
        'withdraw_created': '✅ <b>Zlecenie wypłaty utworzone</b>\n\n💰 Kwota: {amount} USDT\n🌐 Metoda: CryptoBot\n\n⏳ Oczekuj na potwierdzenie administratora',
        'withdraw_blocked': 'Wypłata Zablokowana.',
        'withdraw_rejected': '❌ <b>Zlecenie wypłaty odrzucone</b>\n\n💰 Kwota: {amount} USDT\n\nŚrodki zwrócone na saldo',
        'withdraw_approved': '✅ <b>Wypłata zatwierdzona!</b>\n\n💰 Kwota: {amount} USDT\n🌐 Metoda: CryptoBot\n\nAby otrzymać środki, kliknij przycisk poniżej:',
        'btn_get_funds': '💎 Odbierz środki',
        
        # Gry
        'games_title': '🎮 <b>Wybierz grę z listy poniżej:</b>',
        'slots_title': '🌐 <b>Wybierz region dostępu...</b>',
        'slots_global': '• | Dostęp globalny 🌍',
        'slots_russia': '• | Rosja 🇷🇺',
        'game_in_dev': 'Sekcja w trakcie rozwoju 🚧',
        
        # Przyciski gier
        'btn_dice': '🎲 Kości',
        'btn_mines': '💣 Miny',
        'btn_bowling': '🎳 Kręgle',
        'btn_football': '⚽ Piłka nożna',
        'btn_basketball': '🏀 Koszykówka',
        'btn_rps': '✊ Papier-Kamień-Nożyce',
        'btn_darts': '🎯 Rzutki',
        'btn_spider': '🎰 Pająk',
        
        # Informacje
        'info_title': 'ℹ️ <b>Informacje o MacvBet</b>\n\nWybierz sekcję:',
        'btn_agreement': '📄 Regulamin',
        'btn_support': '💬 Wsparcie',
        
        # Błędy
        'error_insufficient_balance': '❌ <b>Niewystarczające saldo</b>\n\n<i>Twoje saldo:</i> {balance}\n<i>Wymagane:</i> {required}',
        'error_invalid_bet': '❌ <b>Nieprawidłowy format komendy</b>',
        'error_bet_range': '❌ Zakład musi być od {min} do {max}',
        
        # Ogólne
        'main_menu': 'Menu główne:',
        'bet_confirmed': '✅ Potwierdź',
        'bet_rejected': '❌ Odrzuć',
        'bet_cancelled': '❌ <b>Zakład odrzucony</b>',
        'win': '🎉 <b>WYGRANA</b>',
        'loss': '😔 <b>Przegrana</b>',
        
        # Kości
        'dice_menu': '⚙️ <b>Rodzaje zakładów:</b>\n<blockquote>- parzyste|nieparzyste - Przy trafieniu wypłata x1.9</blockquote>\n<blockquote>- m|w - Mniej(1-3) Więcej(4-6) Przy trafieniu wypłata x1.9</blockquote>\n<blockquote>- 1|2|3|4|5|6 - Przy trafieniu wypłata x5.4</blockquote>\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'dice_make_bet': '🎲 Postaw zakład',
        'dice_instruction': 'Wybierz rodzaj zakładu i wprowadź komendę aby rozpocząć grę.\n\n<blockquote>Komenda: /cube {{Kwota zakładu}} {{Rodzaj zakładu}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/cube 10 parzyste</code>\n<code>/cube 50 w</code>\n<code>/cube 20 5</code>',
        
        # Kręgle
        'bowling_make_bet': '🎳 Postaw zakład',
        'bowling_menu': '🎳 <b>KRĘGLE</b>\n\n<b>Rodzaje zakładów:</b>\n<blockquote>- strike (6) - Przy trafieniu wypłata x5.0</blockquote>\n<blockquote>- 4-5 kręgli - Przy trafieniu wypłata x2.5</blockquote>\n<blockquote>- 1-3 kręgle - Przy trafieniu wypłata x1.5</blockquote>\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'bowling_instruction': 'Wybierz rodzaj zakładu i wprowadź komendę aby rozpocząć grę.\n\n<blockquote>Komenda: /bowl {{Kwota zakładu}} {{Rodzaj zakładu}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/bowl 100 strike</code>\n<code>/bowl 50 4-5</code>\n<code>/bowl 20 1-3</code>',
        
        # Rzutki
        'darts_make_bet': '🎯 Postaw zakład',
        'darts_menu': '🎯 <b>RZUTKI</b>\n\n<b>Rodzaje zakładów:</b>\n<blockquote>- środek (6) - Przy trafieniu wypłata x5.0</blockquote>\n<blockquote>- 4-5 punktów - Przy trafieniu wypłata x2.5</blockquote>\n<blockquote>- 1-3 punkty - Przy trafieniu wypłata x1.5</blockquote>\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'darts_instruction': 'Wybierz rodzaj zakładu i wprowadź komendę aby rozpocząć grę.\n\n<blockquote>Komenda: /darts {{Kwota zakładu}} {{Rodzaj zakładu}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/darts 100 środek</code>\n<code>/darts 50 4-5</code>\n<code>/darts 20 1-3</code>',
        
        # Koszykówka
        'basketball_make_bet': '🏀 Postaw zakład',
        'basketball_menu': '🏀 <b>KOSZYKÓWKA</b>\n\n<b>Rodzaje zakładów:</b>\n<blockquote>- trafienie (4-5) - Przy trafieniu wypłata x2.0</blockquote>\n<blockquote>- pudło (1-3) - Przy trafieniu wypłata x1.8</blockquote>\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'basketball_instruction': 'Wybierz rodzaj zakładu i wprowadź komendę aby rozpocząć grę.\n\n<blockquote>Komenda: /basket {{Kwota zakładu}} {{Rodzaj zakładu}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/basket 100 trafienie</code>\n<code>/basket 50 pudło</code>',
        
        # Piłka nożna
        'football_make_bet': '⚽ Postaw zakład',
        'football_menu': '⚽ <b>PIŁKA NOŻNA</b>\n\n<b>Rodzaje zakładów:</b>\n<blockquote>- gol (3-5) - Przy trafieniu wypłata x2.0</blockquote>\n<blockquote>- obok (1-2) - Przy trafieniu wypłata x2.5</blockquote>\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'football_instruction': 'Wybierz rodzaj zakładu i wprowadź komendę aby rozpocząć grę.\n\n<blockquote>Komenda: /foot {{Kwota zakładu}} {{Rodzaj zakładu}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/foot 100 gol</code>\n<code>/foot 50 obok</code>',
        
        # Miny
        'mines_make_bet': '💣 Rozpocznij grę',
        'mines_menu': '💣 <b>MINY</b>\n\n<b>Zasady:</b>\n<blockquote>Pole 5x5. Odkrywaj bezpieczne pola!</blockquote>\n\n• Miny: 3-10\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'mines_instruction': '<blockquote>Komenda: /mines {{Kwota}} {{Liczba min}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/mines 100 3</code>\n<code>/mines 50 5</code>',
        
        # Papier-Kamień-Nożyce
        'rps_make_bet': '✊ Postaw zakład',
        'rps_menu': '✊ <b>PAPIER-KAMIEŃ-NOŻYCE</b>\n\n<b>Zasady:</b>\n<blockquote>Kamień bije nożyce\nNożyce tną papier\nPapier przykrywa kamień</blockquote>\n\n<b>Współczynnik przy wygranej:</b> x2.0\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'rps_instruction': 'Wybierz swój ruch i wprowadź komendę.\n\n<blockquote>Komenda: /knb {{Kwota}} {{k|n|p}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/knb 100 k</code> - kamień\n<code>/knb 50 n</code> - nożyce\n<code>/knb 75 p</code> - papier',
        
        # Pająk
        'spider_make_bet': '🎰 Rozpocznij grę',
        'spider_menu': '🎰 <b>PAJĄK</b>\n\n<b>Zasady:</b>\n<blockquote>5 rzędów po 3 pola. Unikaj pająków!</blockquote>\n\n<b>Poziomy trudności:</b>\n• <b>Łatwy (e)</b> - pająk może nie być, x1.2 + 0.25/rząd\n• <b>Średni (m)</b> - 1 pająk w rzędzie, x1.5 + 0.35/rząd\n• <b>Trudny (h)</b> - 2 pająki w rzędzie, x2.0 + 0.5/rząd\n\n• Min.zakład: {min_bet}₽\n• Maks.zakład: {max_bet}₽',
        'spider_instruction': 'Wybierz poziom trudności i wprowadź komendę.\n\n<blockquote>Komenda: /spider {{Kwota}} {{e|m|h}}</blockquote>\n\n<i>Przykłady:</i>\n<code>/spider 100 e</code> - łatwy\n<code>/spider 50 m</code> - średni\n<code>/spider 200 h</code> - trudny',
    }
}


def get_text(lang: str, key: str, **kwargs) -> str:
    """
    Получить переведенный текст
    
    Args:
        lang: Код языка (ru, pl)
        key: Ключ перевода
        **kwargs: Параметры для форматирования
        
    Returns:
        Переведенный текст
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
    """Форматировать сумму без десятичных знаков"""
    return f"{int(amount)}"
