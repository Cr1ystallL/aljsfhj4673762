'use client';

import type { ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';
import { SoccerBallIcon } from '@/components/ui/soccer-ball-icon';
import {
  BasketballIcon,
  CsPlayerIcon,
  HockeyStickIcon,
  TennisRacquetIcon,
} from '@/components/ui/sport-icons';
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
  icon: ReactNode;
}

export function SportsCategoryNav({
  selectedCategory,
  onSelectCategory,
  counts,
}: SportsCategoryNavProps) {
  const { t } = useT();

  const CATEGORIES: CategoryItem[] = [
    { key: 'all', labelKey: t('sports.categories.all'), icon: <LayoutGrid size={14} /> },
    { key: 'football', labelKey: t('sports.categories.football'), icon: <SoccerBallIcon size={14} /> },
    { key: 'tennis', labelKey: t('sports.categories.tennis'), icon: <TennisRacquetIcon size={14} /> },
    { key: 'basketball', labelKey: t('sports.categories.basketball'), icon: <BasketballIcon size={14} /> },
    { key: 'hockey', labelKey: t('sports.categories.hockey'), icon: <HockeyStickIcon size={14} /> },
    { key: 'cybersport', labelKey: t('sports.categories.cybersport'), icon: <CsPlayerIcon size={14} /> },
  ];

  return (
    <div className="w-full overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
      <div className="flex items-center gap-1.5 min-w-max">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          const count = counts[cat.key] ?? 0;

          return (
            <button
              key={cat.key}
              onClick={() => onSelectCategory(cat.key)}
              className={cn(
                'inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full border transition-all duration-150 active:scale-95 shrink-0',
                isSelected
                  ? 'bg-white/[0.1] border-white/22 text-frost-white'
                  : 'bg-white/[0.03] border-white/10 text-whisper-gray hover:text-frost-white hover:border-white/16'
              )}
            >
              <span className={cn('flex items-center justify-center', isSelected ? 'text-frost-white' : 'text-whisper-gray')}>
                {cat.icon}
              </span>
              <span className="font-roobert text-[11px] font-semibold tracking-tight whitespace-nowrap">
                {cat.labelKey}
              </span>
              {count > 0 && (
                <span className="font-roobert text-[10px] tabular-nums text-whisper-gray/80">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
