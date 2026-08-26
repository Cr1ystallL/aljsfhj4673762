'use client';

import { Flame, Gamepad2, Trophy, Swords, Disc, ShieldAlert } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import { cn } from '@/lib/utils';
import type { SportCategoryKey } from '@/types/sports';
import { useT } from '@/i18n/use-t';

interface SportsCategoryNavProps {
  selectedCategory: SportCategoryKey;
  onSelectCategory: (category: SportCategoryKey) => void;
  counts: Record<SportCategoryKey, number>;
}

interface CategoryItem {
  key: SportCategoryKey;
  labelKey: string;
  icon: React.ReactNode;
}

export function SportsCategoryNav({
  selectedCategory,
  onSelectCategory,
  counts,
}: SportsCategoryNavProps) {
  const { t } = useT();

  const CATEGORIES: CategoryItem[] = [
    {
      key: 'top',
      labelKey: t('sports.categories.top'),
      icon: <Flame size={16} className="text-red-400" />,
    },
    {
      key: 'football',
      labelKey: t('sports.categories.football'),
      icon: <SoccerBallIcon size={16} className="text-emerald-400" />,
    },
    {
      key: 'tennis',
      labelKey: t('sports.categories.tennis'),
      icon: <Disc size={16} className="text-amber-300" />,
    },
    {
      key: 'basketball',
      labelKey: t('sports.categories.basketball'),
      icon: <Disc size={16} className="text-orange-400" />,
    },
    {
      key: 'hockey',
      labelKey: t('sports.categories.hockey'),
      icon: <ShieldAlert size={16} className="text-cyan-400" />,
    },
    {
      key: 'cybersport',
      labelKey: t('sports.categories.cybersport'),
      icon: <Gamepad2 size={16} className="text-purple-400" />,
    },
    {
      key: 'all',
      labelKey: t('sports.categories.all'),
      icon: <Trophy size={16} className="text-amber-400" />,
    },
  ];

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2 -mx-1 px-1">
      <div className="flex items-center gap-2 min-w-max">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          const count = counts[cat.key] ?? 0;

          return (
            <button
              key={cat.key}
              onClick={() => onSelectCategory(cat.key)}
              className={cn(
                'group flex items-center gap-2 px-3.5 py-2 rounded-2xl border transition-all duration-200 active:scale-95 text-left shrink-0',
                isSelected
                  ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.15),inset_0_1px_0_rgba(255,255,255,0.15)] text-frost-white'
                  : 'bg-[#12141a]/90 hover:bg-[#181b22] border-white/10 hover:border-white/20 text-whisper-gray hover:text-frost-white'
              )}
            >
              <div
                className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110',
                  isSelected ? 'bg-amber-400/20' : 'bg-white/[0.05]'
                )}
              >
                {cat.icon}
              </div>

              <div className="flex flex-col">
                <span
                  className={cn(
                    'font-roobert text-[12px] font-semibold tracking-tight whitespace-nowrap',
                    isSelected ? 'text-frost-white' : 'text-whisper-gray group-hover:text-frost-white'
                  )}
                >
                  {cat.labelKey}
                </span>
                {count > 0 && (
                  <span className="font-roobert text-[10px] text-whisper-gray/70">
                    {count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
