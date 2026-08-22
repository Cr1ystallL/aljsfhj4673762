"use client";

import { useReducedMotion } from "framer-motion";
import { GameIcon, gameLabel, resolveGameKey } from "@/components/ui/game-icon";
import { useT } from "@/i18n/use-t";

export interface LuckFeedItem {
  id: string;
  name: string;
  photoUrl: string | null;
  gameType: string;
  payout: number;
  multiplier: number;
  at: number;
}

export function HomeLuckFeed({ items }: { items: LuckFeedItem[] }) {
  const { t, localeTag } = useT();
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;

  const loop = items.length >= 4 && !reduceMotion ? [...items, ...items] : items;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-midnight-canvas/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-midnight-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-midnight-canvas to-transparent" />
      <div
        className={`flex h-12 items-center gap-3 px-3 ${
          loop.length > items.length ? "w-max animate-luck-scroll" : "overflow-x-auto no-scrollbar"
        }`}
      >
        {loop.map((item, i) => {
          const game = resolveGameKey(item.gameType);
          return (
            <div
              key={`${item.id}-${i}`}
              className="flex shrink-0 items-center gap-2 pr-3"
            >
              {item.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photoUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 font-roobert text-[9px] font-bold text-white/70">
                  {item.name[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="max-w-[72px] truncate font-roobert text-[12px] text-white/70">
                {item.name}
              </span>
              <GameIcon game={game} size={12} className="text-white/45" />
              <span className="font-roobert text-[11px] text-white/40">
                {gameLabel(game)}
              </span>
              <span className="font-roobert text-[12px] font-semibold tabular-nums text-emerald-300/90">
                {item.payout.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł
              </span>
              {item.multiplier >= 1.2 && (
                <span className="font-roobert text-[11px] tabular-nums text-white/45">
                  {item.multiplier.toFixed(2)}×
                </span>
              )}
              {i < loop.length - 1 && (
                <span className="ml-1 h-1 w-1 rounded-full bg-white/15" />
              )}
            </div>
          );
        })}
      </div>
      <span className="sr-only">{t("home.luckFeed")}</span>
    </div>
  );
}
