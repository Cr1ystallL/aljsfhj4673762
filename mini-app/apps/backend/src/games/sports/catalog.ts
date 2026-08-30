export type SportKind = 'football' | 'tennis' | 'hockey' | 'basketball' | 'cybersport';

export interface TeamTemplate {
  name: string;
  shortName: string;
  initials: string;
  color: string;
  logo?: string;
  attack: number;
  defense: number;
}

export interface InitialLiveState {
  minute?: number;
  second?: number;
  score1?: number;
  score2?: number;
  subScores1?: number[];
  subScores2?: number[];
  yellow1?: number;
  yellow2?: number;
  period?: string;
}

export interface EventTemplate {
  id: string;
  sport: SportKind;
  league: string;
  leagueCountry?: string;
  team1: TeamTemplate;
  team2: TeamTemplate;
  isFeatured?: boolean;
  /** ms after boot (or recycle) before kickoff. Ignored when `initialLive` is set. */
  initialDelayMs: number;
  /** How long after a finish before the next instance starts. */
  recycleDelayMs: number;
  /** Seed a live match on first boot so the board is not empty. */
  initialLive?: InitialLiveState;
}

const club = (path: string) =>
  `https://upload.wikimedia.org/wikipedia/${path}`;

export const SPORTS_CATALOG: EventTemplate[] = [
  {
    id: 'river-santafe',
    sport: 'football',
    league: 'Юсер. Кубок. 1/8',
    leagueCountry: 'Южная Америка',
    isFeatured: true,
    initialDelayMs: 90_000,
    recycleDelayMs: 240_000,
    team1: {
      name: 'Ривер Плейт',
      shortName: 'Ривер',
      initials: 'РП',
      color: '#DC2626',
      logo: club('commons/thumb/a/ac/Escudo_del_C_A_River_Plate.svg/200px-Escudo_del_C_A_River_Plate.svg.png'),
      attack: 1.9,
      defense: 0.85,
    },
    team2: {
      name: 'Индепендьенте Санта-Фе',
      shortName: 'Санта-Фе',
      initials: 'СФ',
      color: '#EF4444',
      logo: club('commons/thumb/e/e1/Escudo_de_Independiente_Santa_Fe.svg/200px-Escudo_de_Independiente_Santa_Fe.svg.png'),
      attack: 0.9,
      defense: 1.35,
    },
  },
  {
    id: 'aldosivi-independiente',
    sport: 'football',
    league: 'Аргентина. Кубок. 1/8',
    leagueCountry: 'Аргентина',
    initialDelayMs: 180_000,
    recycleDelayMs: 180_000,
    initialLive: { minute: 71, second: 12, score1: 0, score2: 1, yellow1: 2, yellow2: 1, period: '2T' },
    team1: {
      name: 'Альдосиви',
      shortName: 'Альдосиви',
      initials: 'АЛД',
      color: '#15803D',
      logo: club('commons/thumb/7/7b/Escudo_del_Club_Atl%C3%A9tico_Aldosivi.svg/200px-Escudo_del_Club_Atl%C3%A9tico_Aldosivi.svg.png'),
      attack: 0.9,
      defense: 1.2,
    },
    team2: {
      name: 'Индепендьенте Ривадавия',
      shortName: 'Индепендьенте',
      initials: 'ИНД',
      color: '#1D4ED8',
      logo: club('commons/thumb/b/be/Escudo_de_Independiente_Rivadavia.svg/200px-Escudo_de_Independiente_Rivadavia.svg.png'),
      attack: 1.2,
      defense: 0.95,
    },
  },
  {
    id: 'america-junior',
    sport: 'football',
    league: 'Колумбия. Серия А',
    leagueCountry: 'Колумбия',
    initialDelayMs: 210_000,
    recycleDelayMs: 200_000,
    initialLive: { minute: 8, second: 20, score1: 0, score2: 1, period: '1T' },
    team1: {
      name: 'Америка де Кали',
      shortName: 'Америка Кали',
      initials: 'АМК',
      color: '#DC2626',
      logo: club('commons/thumb/e/eb/Escudo_de_Am%C3%A9rica_de_Cali.svg/200px-Escudo_de_Am%C3%A9rica_de_Cali.svg.png'),
      attack: 1.3,
      defense: 1.0,
    },
    team2: {
      name: 'Хуниор Барранкилья',
      shortName: 'Хуниор',
      initials: 'ХУН',
      color: '#B91C1C',
      logo: club('commons/thumb/e/ef/Escudo_del_Club_Deportivo_Popular_Junior_F.C..svg/200px-Escudo_del_Club_Deportivo_Popular_Junior_F.C..svg.png'),
      attack: 1.25,
      defense: 1.05,
    },
  },
  {
    id: 'djokovic-alcaraz',
    sport: 'tennis',
    league: 'US Open. Мужчины. Полуфинал',
    initialDelayMs: 150_000,
    recycleDelayMs: 160_000,
    initialLive: {
      score1: 1,
      score2: 1,
      subScores1: [6, 4, 3],
      subScores2: [4, 6, 2],
      period: '3-й сет',
    },
    team1: {
      name: 'Новак Джокович',
      shortName: 'Джокович Н.',
      initials: 'НД',
      color: '#2563EB',
      attack: 1.05,
      defense: 1.0,
    },
    team2: {
      name: 'Карлос Алькарас',
      shortName: 'Алькарас К.',
      initials: 'КА',
      color: '#EA580C',
      attack: 1.08,
      defense: 1.0,
    },
  },
  {
    id: 'connecticut-goldenstate',
    sport: 'basketball',
    league: 'WNBA. Регулярный чемпионат',
    initialDelayMs: 200_000,
    recycleDelayMs: 180_000,
    initialLive: { minute: 6, second: 40, score1: 14, score2: 26, period: '1Ч' },
    team1: {
      name: 'Коннектикут Сан (ж)',
      shortName: 'Коннектикут',
      initials: 'КОН',
      color: '#D97706',
      logo: club('en/thumb/5/59/Connecticut_Sun_logo.svg/200px-Connecticut_Sun_logo.svg.png'),
      attack: 0.95,
      defense: 1.05,
    },
    team2: {
      name: 'Голден Стэйт (ж)',
      shortName: 'Голден Стэйт',
      initials: 'ГС',
      color: '#7C3AED',
      logo: club('en/thumb/0/04/Golden_State_Valkyries_logo.svg/200px-Golden_State_Valkyries_logo.svg.png'),
      attack: 1.1,
      defense: 0.95,
    },
  },
  {
    id: 'navi-faze',
    sport: 'cybersport',
    league: 'CS 2. ESL Pro League',
    initialDelayMs: 170_000,
    recycleDelayMs: 150_000,
    initialLive: {
      score1: 1,
      score2: 0,
      subScores1: [13, 8],
      subScores2: [9, 11],
      period: 'Map 2',
    },
    team1: {
      name: 'Natus Vincere',
      shortName: 'NAVI',
      initials: 'NAV',
      color: '#EAB308',
      attack: 1.1,
      defense: 1.0,
    },
    team2: {
      name: 'FaZe Clan',
      shortName: 'FaZe',
      initials: 'FAZ',
      color: '#EF4444',
      attack: 1.05,
      defense: 1.0,
    },
  },
  {
    id: 'toluca-austin',
    sport: 'football',
    league: 'Кубок Сев. лиг. 1/4',
    initialDelayMs: 240_000,
    recycleDelayMs: 220_000,
    team1: {
      name: 'Депортиво Толука',
      shortName: 'Толука',
      initials: 'ТОЛ',
      color: '#DC2626',
      logo: club('commons/thumb/6/6f/Deportivo_Toluca_FC_logo.svg/200px-Deportivo_Toluca_FC_logo.svg.png'),
      attack: 1.6,
      defense: 1.0,
    },
    team2: {
      name: 'Остин ФК',
      shortName: 'Остин',
      initials: 'ОСТ',
      color: '#059669',
      logo: club('en/thumb/7/7b/Austin_FC_logo.svg/200px-Austin_FC_logo.svg.png'),
      attack: 1.1,
      defense: 1.25,
    },
  },
  {
    id: 'america-columbus',
    sport: 'football',
    league: 'Кубок Сев. лиг. 1/4',
    initialDelayMs: 480_000,
    recycleDelayMs: 240_000,
    team1: {
      name: 'Америка Мехико',
      shortName: 'Америка',
      initials: 'АМЕ',
      color: '#FBBF24',
      logo: club('commons/thumb/a/ae/Club_Am%C3%A9rica_logo.svg/200px-Club_Am%C3%A9rica_logo.svg.png'),
      attack: 1.55,
      defense: 0.95,
    },
    team2: {
      name: 'Коламбус Кру',
      shortName: 'Коламбус',
      initials: 'КОЛ',
      color: '#F59E0B',
      logo: club('en/thumb/5/59/Columbus_Crew_logo_2021.svg/200px-Columbus_Crew_logo_2021.svg.png'),
      attack: 1.15,
      defense: 1.2,
    },
  },
  {
    id: 'palmeiras-santos',
    sport: 'football',
    league: 'Бразилия. Кубок. 1/4',
    initialDelayMs: 720_000,
    recycleDelayMs: 260_000,
    team1: {
      name: 'Палмейрас СП',
      shortName: 'Палмейрас',
      initials: 'ПАЛ',
      color: '#16A34A',
      logo: club('commons/thumb/1/10/Palmeiras_logo.svg/200px-Palmeiras_logo.svg.png'),
      attack: 1.8,
      defense: 0.8,
    },
    team2: {
      name: 'Сантос СП',
      shortName: 'Сантос',
      initials: 'САН',
      color: '#4B5563',
      logo: club('commons/thumb/1/15/Santos_Logo.png/200px-Santos_Logo.png'),
      attack: 0.95,
      defense: 1.4,
    },
  },
  {
    id: 'vasco-vitoria',
    sport: 'football',
    league: 'Бразилия. Кубок. 1/4',
    initialDelayMs: 360_000,
    recycleDelayMs: 240_000,
    team1: {
      name: 'Васко да Гама РЖ',
      shortName: 'Васко да Гама',
      initials: 'ВАС',
      color: '#111827',
      logo: club('commons/thumb/2/23/Club_de_Regatas_Vasco_da_Gama.svg/200px-Club_de_Regatas_Vasco_da_Gama.svg.png'),
      attack: 1.6,
      defense: 0.9,
    },
    team2: {
      name: 'Витория Салвадор',
      shortName: 'Витория',
      initials: 'ВИТ',
      color: '#DC2626',
      logo: club('commons/thumb/0/05/Esporte_Clube_Vit%C3%B3ria_logo.svg/200px-Escudo_do_EC_Vit%C3%B3ria.svg.png'),
      attack: 0.95,
      defense: 1.35,
    },
  },
  {
    id: 'real-mancity',
    sport: 'football',
    league: 'Лига Чемпионов УЕФА. 1/8',
    initialDelayMs: 1_080_000,
    recycleDelayMs: 300_000,
    team1: {
      name: 'Реал Мадрид',
      shortName: 'Реал Мадрид',
      initials: 'РМА',
      color: '#FACC15',
      logo: club('en/thumb/5/56/Real_Madrid_CF.svg/200px-Real_Madrid_CF.svg.png'),
      attack: 2.1,
      defense: 0.9,
    },
    team2: {
      name: 'Манчестер Сити',
      shortName: 'Ман Сити',
      initials: 'МСИ',
      color: '#38BDF8',
      logo: club('en/thumb/e/eb/Manchester_City_FC_badge.svg/200px-Manchester_City_FC_badge.svg.png'),
      attack: 2.05,
      defense: 0.92,
    },
  },
  {
    id: 'udvardy-mertens',
    sport: 'tennis',
    league: 'WTA 500. Монтеррей',
    initialDelayMs: 300_000,
    recycleDelayMs: 200_000,
    team1: {
      name: 'Удварди П.',
      shortName: 'Удварди П.',
      initials: 'УДВ',
      color: '#10B981',
      attack: 0.85,
      defense: 1.0,
    },
    team2: {
      name: 'Мертенс Э.',
      shortName: 'Мертенс Э.',
      initials: 'МЕР',
      color: '#6366F1',
      attack: 1.2,
      defense: 1.0,
    },
  },
  {
    id: 'celtics-lakers',
    sport: 'basketball',
    league: 'NBA. Регулярный чемпионат',
    initialDelayMs: 600_000,
    recycleDelayMs: 220_000,
    team1: {
      name: 'Бостон Селтикс',
      shortName: 'Бостон',
      initials: 'БОС',
      color: '#15803D',
      logo: club('en/thumb/8/8f/Boston_Celtics.svg/200px-Boston_Celtics.svg.png'),
      attack: 1.15,
      defense: 0.95,
    },
    team2: {
      name: 'Лос-Анджелес Лейкерс',
      shortName: 'Лейкерс',
      initials: 'ЛАЛ',
      color: '#7E22CE',
      logo: club('commons/thumb/3/3c/Los_Angeles_Lakers_logo.svg/200px-Los_Angeles_Lakers_logo.svg.png'),
      attack: 1.05,
      defense: 1.05,
    },
  },
  {
    id: 'oilers-panthers',
    sport: 'hockey',
    league: 'NHL. Финал Кубка Стэнли',
    initialDelayMs: 840_000,
    recycleDelayMs: 240_000,
    team1: {
      name: 'Эдмонтон Ойлерз',
      shortName: 'Эдмонтон',
      initials: 'ЭДМ',
      color: '#EA580C',
      logo: club('en/thumb/4/4d/Logo_Edmonton_Oilers.svg/200px-Logo_Edmonton_Oilers.svg.png'),
      attack: 3.1,
      defense: 0.95,
    },
    team2: {
      name: 'Флорида Пантерз',
      shortName: 'Флорида',
      initials: 'ФЛО',
      color: '#DC2626',
      logo: club('en/thumb/4/43/Florida_Panthers_2016_logo.svg/200px-Florida_Panthers_2016_logo.svg.png'),
      attack: 2.9,
      defense: 1.0,
    },
  },
];

export function templateById(id: string): EventTemplate | undefined {
  return SPORTS_CATALOG.find((t) => t.id === id);
}
