import { redisClient } from '../lib/redis.js';
import { logger } from '../utils/logger.js';

export interface LobbyBanner {
  id: string;
  badge: {
    label: string;
    icon: string; // 'Flame' | 'Crown' | 'Gift' | 'Rocket' | 'Sparkles' | 'Trophy';
    color: string;
    bg: string;
    border: string;
  };
  title: string;
  subtitle: string;
  ctaText: string;
  href: string;
  image: string;
  glowColor: string;
  floorColor: string;
  accentGradient: string;
  enabled: boolean;
  order: number;
}

const REDIS_KEY = 'lobby_banners_v1';

export const DEFAULT_BANNERS: LobbyBanner[] = [
  {
    id: 'welcome_bonus',
    badge: {
      label: 'Приветственный бонус',
      icon: 'Flame',
      color: 'text-amber-300',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
    },
    title: '+200% К ДЕПОЗИТУ',
    subtitle: 'Удвой свой баланс и забери фриспины в подарок прямо сейчас',
    ctaText: 'Забрать бонус',
    href: '/balance',
    image: '/banerbonus.png',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    floorColor: 'rgba(245, 158, 11, 0.45)',
    accentGradient: 'from-amber-300 via-amber-400 to-orange-500',
    enabled: true,
    order: 0,
  },
  {
    id: 'cashback',
    badge: {
      label: 'VIP Привилегия',
      icon: 'Crown',
      color: 'text-emerald-300',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/40',
    },
    title: 'КЭШБЭК ДО 10%',
    subtitle: 'Возвращаем часть проигрыша каждую неделю на реальный баланс',
    ctaText: 'Подробнее',
    href: '/cashback',
    image: '/banercashback.png',
    glowColor: 'rgba(168, 85, 247, 0.32)',
    floorColor: 'rgba(16, 185, 129, 0.45)',
    accentGradient: 'from-emerald-300 via-teal-400 to-emerald-500',
    enabled: true,
    order: 1,
  },
  {
    id: 'daily_wheel',
    badge: {
      label: 'Ежедневный приз',
      icon: 'Gift',
      color: 'text-purple-300',
      bg: 'bg-purple-500/15',
      border: 'border-purple-500/40',
    },
    title: 'КОЛЕСО ФОРТУНЫ',
    subtitle: 'Крути колесо каждый день бесплатно и забирай до 500 zł',
    ctaText: 'Крутить колесо',
    href: '/bonuses',
    image: '/banetlw.png',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    floorColor: 'rgba(168, 85, 247, 0.45)',
    accentGradient: 'from-purple-300 via-fuchsia-400 to-pink-500',
    enabled: true,
    order: 2,
  },
  {
    id: 'macvjet_jackpot',
    badge: {
      label: 'Хит сезона',
      icon: 'Rocket',
      color: 'text-rose-300',
      bg: 'bg-rose-500/15',
      border: 'border-rose-500/40',
    },
    title: 'MACVJET: ДО x10,000',
    subtitle: 'Срывай сумасшедшие иксы и взлетай на вершину таблицы лидеров',
    ctaText: 'Взлететь',
    href: '/game/crash',
    image: '/banermj.png',
    glowColor: 'rgba(244, 63, 94, 0.35)',
    floorColor: 'rgba(249, 115, 22, 0.45)',
    accentGradient: 'from-rose-400 via-amber-400 to-orange-500',
    enabled: true,
    order: 3,
  },
];

class BannersConfigService {
  async getAll(): Promise<LobbyBanner[]> {
    try {
      const raw = await redisClient.getClient().get(REDIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LobbyBanner[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.sort((a, b) => a.order - b.order);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load banners from Redis, using defaults');
    }
    return DEFAULT_BANNERS;
  }

  async getActive(): Promise<LobbyBanner[]> {
    const all = await this.getAll();
    return all.filter((b) => b.enabled).sort((a, b) => a.order - b.order);
  }

  async save(banners: LobbyBanner[]): Promise<LobbyBanner[]> {
    const sorted = banners.map((b, idx) => ({ ...b, order: idx }));
    try {
      await redisClient.getClient().set(REDIS_KEY, JSON.stringify(sorted));
    } catch (err) {
      logger.error({ err }, 'Failed to persist banners to Redis');
    }
    return sorted;
  }

  async createOrUpdate(banner: LobbyBanner): Promise<LobbyBanner[]> {
    const current = await this.getAll();
    const idx = current.findIndex((b) => b.id === banner.id);
    let updated: LobbyBanner[];
    if (idx >= 0) {
      updated = [...current];
      updated[idx] = { ...banner, order: current[idx].order };
    } else {
      updated = [...current, { ...banner, order: current.length }];
    }
    return this.save(updated);
  }

  async delete(id: string): Promise<LobbyBanner[]> {
    const current = await this.getAll();
    const filtered = current.filter((b) => b.id !== id);
    return this.save(filtered);
  }

  async reorder(ids: string[]): Promise<LobbyBanner[]> {
    const current = await this.getAll();
    const byId = new Map(current.map((b) => [b.id, b]));
    const reordered: LobbyBanner[] = [];
    ids.forEach((id) => {
      const b = byId.get(id);
      if (b) {
        reordered.push(b);
        byId.delete(id);
      }
    });
    byId.forEach((b) => reordered.push(b));
    return this.save(reordered);
  }
}

export const bannersConfig = new BannersConfigService();
