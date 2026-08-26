import type { SportCategoryKey, SportEvent, SelectedBet } from '@/types/sports';

const MOCK_EVENTS: SportEvent[] = [
  // FEATURED: Match of the day (Winline Style)
  {
    id: 'river-santafe',
    sport: 'football',
    league: 'Южноамериканский Кубок. 1/8 финала',
    leagueCountry: 'Южная Америка',
    team1: {
      name: 'Ривер Плейт',
      shortName: 'Ривер Плейт',
      initials: 'РП',
      color: '#DC2626',
      logo: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=80&auto=format&fit=crop&q=80',
    },
    team2: {
      name: 'Индепендьенте Санта-Фе',
      shortName: 'Санта-Фе',
      initials: 'СФ',
      color: '#EF4444',
      logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=80&auto=format&fit=crop&q=80',
    },
    startTime: '2026-08-27T00:30:00.000Z',
    displayTime: 'Сегодня 03:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.31,
      x: 5.00,
      p2: 11.0,
      total: { threshold: 2.5, over: 1.85, under: 1.95 },
    },
    marketsCount: 178,
    isFeatured: true,
    featuredTag: 'Матч дня',
    hasStream: true,
  },

  // LIVE Football (from screenshots)
  {
    id: 'aldosivi-independiente',
    sport: 'football',
    league: 'Аргентина. Кубок. 1/8 финала',
    leagueCountry: 'Аргентина',
    team1: {
      name: 'Альдосиви',
      initials: 'АЛД',
      score: 0,
      yellowCards: 2,
    },
    team2: {
      name: 'Индепендьенте Ривадавия',
      initials: 'ИНД',
      score: 1,
      yellowCards: 1,
    },
    startTime: '2026-08-27T01:00:00.000Z',
    displayTime: '2T 51\'',
    status: 'live',
    isLive: true,
    liveTime: '2T 51\'',
    odds: {
      p1: 14.0,
      x: 4.80,
      p2: 1.27,
      total: { threshold: 1.5, over: 2.10, under: 1.65 },
    },
    marketsCount: 50,
    hasStream: true,
  },

  // LIVE Tennis
  {
    id: 'djokovic-alcaraz',
    sport: 'tennis',
    league: 'US Open. Мужчины. Полуфинал',
    team1: {
      name: 'Новак Джокович',
      shortName: 'Джокович Н.',
      initials: 'НД',
      score: 1,
      subScores: [6, 4, 3],
    },
    team2: {
      name: 'Карлос Алькарас',
      shortName: 'Алькарас К.',
      initials: 'КА',
      score: 1,
      subScores: [4, 6, 2],
    },
    startTime: '2026-08-27T01:15:00.000Z',
    displayTime: '3-й сет 3:2',
    status: 'live',
    isLive: true,
    liveTime: '3-й сет 3:2',
    odds: {
      p1: 1.92,
      p2: 1.88,
    },
    marketsCount: 84,
    hasStream: true,
  },

  // LIVE Basketball (from Winline screenshot)
  {
    id: 'connecticut-goldenstate',
    sport: 'basketball',
    league: 'WNBA. Регулярный чемпионат',
    team1: {
      name: 'Коннектикут (ж)',
      initials: 'КОН',
      score: 9,
    },
    team2: {
      name: 'Голден Стэйт (ж)',
      initials: 'ГС',
      score: 20,
    },
    startTime: '2026-08-27T01:30:00.000Z',
    displayTime: '1Ч 0\'',
    status: 'live',
    isLive: true,
    liveTime: '1Ч 0\'',
    odds: {
      p1: 8.20,
      p2: 1.08,
    },
    marketsCount: 45,
    hasStream: true,
  },

  // LIVE Esports
  {
    id: 'navi-faze',
    sport: 'cybersport',
    league: 'CS 2. ESL Pro League Season 21',
    team1: {
      name: 'Natus Vincere',
      shortName: 'NAVI',
      initials: 'NAV',
      score: 1,
      subScores: [13, 7],
    },
    team2: {
      name: 'FaZe Clan',
      shortName: 'FaZe',
      initials: 'FAZ',
      score: 0,
      subScores: [9, 11],
    },
    startTime: '2026-08-27T01:00:00.000Z',
    displayTime: '2-я карта (7:11)',
    status: 'live',
    isLive: true,
    liveTime: 'Map 2 (7:11)',
    odds: {
      p1: 1.65,
      p2: 2.25,
    },
    marketsCount: 42,
    hasStream: true,
  },

  // PREMATCH Football: North American Leagues Cup
  {
    id: 'toluca-austin',
    sport: 'football',
    league: 'Кубок Североамериканских лиг. 1/4 финала',
    team1: {
      name: 'Депортиво Толука',
      shortName: 'Толука',
      initials: 'ТОЛ',
    },
    team2: {
      name: 'Остин',
      shortName: 'Остин',
      initials: 'ОСТ',
    },
    startTime: '2026-08-27T00:30:00.000Z',
    displayTime: 'Сегодня 03:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.74,
      x: 3.80,
      p2: 4.70,
    },
    marketsCount: 178,
    hasStream: true,
  },

  {
    id: 'america-columbus',
    sport: 'football',
    league: 'Кубок Североамериканских лиг. 1/4 финала',
    team1: {
      name: 'Америка Мехико',
      initials: 'АМЕ',
    },
    team2: {
      name: 'Коламбус Кру',
      initials: 'КОЛ',
    },
    startTime: '2026-08-27T02:45:00.000Z',
    displayTime: 'Сегодня 05:45',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.75,
      x: 3.55,
      p2: 4.70,
    },
    marketsCount: 165,
    hasStream: true,
  },

  // PREMATCH Football: Brazil Cup
  {
    id: 'palmeiras-santos',
    sport: 'football',
    league: 'Бразилия. Кубок. 1/4 финала. Первые матчи',
    team1: {
      name: 'Палмейрас СП',
      initials: 'ПАЛ',
    },
    team2: {
      name: 'Сантос СП',
      initials: 'САН',
    },
    startTime: '2026-08-27T00:30:00.000Z',
    displayTime: 'Сегодня 03:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.50,
      x: 3.90,
      p2: 7.20,
    },
    marketsCount: 191,
    hasStream: true,
  },

  {
    id: 'vasco-vitoria',
    sport: 'football',
    league: 'Бразилия. Кубок. 1/4 финала. Первые матчи',
    team1: {
      name: 'Васко да Гама РЖ',
      initials: 'ВАС',
    },
    team2: {
      name: 'Витория Салвадор',
      initials: 'ВИТ',
    },
    startTime: '2026-08-27T00:30:00.000Z',
    displayTime: 'Сегодня 03:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.55,
      x: 3.60,
      p2: 7.00,
    },
    marketsCount: 190,
    hasStream: true,
  },

  // PREMATCH Football: UEFA Champions League
  {
    id: 'real-mancity',
    sport: 'football',
    league: 'Лига Чемпионов УЕФА. 1/8 финала',
    team1: {
      name: 'Реал Мадрид',
      initials: 'РМА',
    },
    team2: {
      name: 'Манчестер Сити',
      initials: 'МСИ',
    },
    startTime: '2026-08-27T19:00:00.000Z',
    displayTime: 'Завтра 22:00',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 2.15,
      x: 3.65,
      p2: 3.10,
    },
    marketsCount: 240,
    hasStream: true,
  },

  // Tennis matches from screenshot
  {
    id: 'udvardy-mertens',
    sport: 'tennis',
    league: 'WTA 500. Монтеррей',
    team1: {
      name: 'Удварди П.',
      initials: 'УДВ',
    },
    team2: {
      name: 'Мертенс Э.',
      initials: 'МЕР',
    },
    startTime: '2026-08-27T00:30:00.000Z',
    displayTime: 'Сегодня 02:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 4.30,
      p2: 1.22,
    },
    marketsCount: 45,
    hasStream: true,
  },

  {
    id: 'chwalinska-parks',
    sport: 'tennis',
    league: 'WTA 500. Монтеррей',
    team1: {
      name: 'Хвалинска М.',
      initials: 'ХВА',
    },
    team2: {
      name: 'Паркс А.',
      initials: 'ПАР',
    },
    startTime: '2026-08-27T01:30:00.000Z',
    displayTime: 'Сегодня 04:30',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.56,
      p2: 2.42,
    },
    marketsCount: 54,
    hasStream: true,
  },

  {
    id: 'alexandrova-tauson',
    sport: 'tennis',
    league: 'US Open. Женщины. 1/16 финала',
    team1: {
      name: 'Александрова Е.',
      initials: 'АЛЕ',
    },
    team2: {
      name: 'Таусон К.',
      initials: 'ТАУ',
    },
    startTime: '2026-08-27T14:00:00.000Z',
    displayTime: 'Сегодня 17:00',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.99,
      p2: 1.81,
    },
    marketsCount: 62,
    hasStream: true,
  },

  // Basketball
  {
    id: 'seattle-toronto',
    sport: 'basketball',
    league: 'WNBA. Регулярный чемпионат',
    team1: {
      name: 'Сиэтл (ж)',
      initials: 'СИЭ',
    },
    team2: {
      name: 'Торонто Темпо (ж)',
      initials: 'ТОР',
    },
    startTime: '2026-08-27T02:00:00.000Z',
    displayTime: 'Сегодня 05:00',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 1.39,
      p2: 3.00,
    },
    marketsCount: 106,
    hasStream: true,
  },

  // Hockey
  {
    id: 'oilers-panthers',
    sport: 'hockey',
    league: 'NHL. Кубок Стэнли',
    team1: {
      name: 'Эдмонтон Ойлерз',
      initials: 'ЭДМ',
    },
    team2: {
      name: 'Флорида Пантерз',
      initials: 'ФЛО',
    },
    startTime: '2026-08-27T03:00:00.000Z',
    displayTime: 'Сегодня 06:00',
    status: 'prematch',
    isLive: false,
    odds: {
      p1: 2.10,
      x: 4.10,
      p2: 2.85,
    },
    marketsCount: 112,
    hasStream: true,
  },
];

export interface SportsFilterOptions {
  category: SportCategoryKey;
  mode: 'all' | 'live' | 'prematch';
  searchQuery?: string;
}

export const sportsService = {
  getEvents: (filters: SportsFilterOptions): SportEvent[] => {
    let list = [...MOCK_EVENTS];

    // Filter by mode (live / prematch)
    if (filters.mode === 'live') {
      list = list.filter((e) => e.isLive);
    } else if (filters.mode === 'prematch') {
      list = list.filter((e) => !e.isLive);
    }

    // Filter by category
    if (filters.category !== 'all' && filters.category !== 'top') {
      list = list.filter((e) => e.sport === filters.category);
    }

    // Filter by search query
    if (filters.searchQuery?.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.team1.name.toLowerCase().includes(q) ||
          e.team2.name.toLowerCase().includes(q) ||
          e.league.toLowerCase().includes(q)
      );
    }

    return list;
  },

  getFeaturedMatch: (): SportEvent | undefined => {
    return MOCK_EVENTS.find((e) => e.isFeatured) || MOCK_EVENTS[0];
  },

  getLiveCount: (): number => {
    return MOCK_EVENTS.filter((e) => e.isLive).length;
  },

  getCategoryCounts: (): Record<SportCategoryKey, number> => {
    const counts: Record<SportCategoryKey, number> = {
      all: MOCK_EVENTS.length,
      top: MOCK_EVENTS.length,
      football: 0,
      tennis: 0,
      hockey: 0,
      basketball: 0,
      cybersport: 0,
      table_tennis: 0,
      mma: 0,
    };

    for (const e of MOCK_EVENTS) {
      if (counts[e.sport] !== undefined) {
        counts[e.sport]++;
      }
    }
    return counts;
  },
};
