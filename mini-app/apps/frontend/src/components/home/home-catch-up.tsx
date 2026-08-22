"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Trophy, Timer } from "lucide-react";
import { StreakPips } from "@/components/ui/streak-pips";
import { Pressable } from "@/components/ui/pressable";
import { useT } from "@/i18n/use-t";

export interface CatchUpContest {
  title: string;
  endsAt: number;
  href: string;
}

interface CatchUpPayload {
  maxWin24h: number;
  maxMultiplier24h: number;
  freeCases: number;
  winStreak: number;
}

function formatRemainingShort(ms: number): string {
  if (ms <= 0) return "0м";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export function HomeCatchUp({
  contest,
  hideContest,
  onOpen,
}: {
  contest: CatchUpContest | null;
  hideContest?: boolean;
  onOpen: (href: string) => void;
}) {
  const { t, localeTag } = useT();
  const [data, setData] = useState<CatchUpPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/balance/catch-up", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.ok) return;
        setData({
          maxWin24h: Number(json.maxWin24h) || 0,
          maxMultiplier24h: Number(json.maxMultiplier24h) || 0,
          freeCases: Math.max(0, Math.floor(Number(json.freeCases) || 0)),
          winStreak: Math.max(0, Math.floor(Number(json.winStreak) || 0)),
        });
      } catch {
        /* keep empty strip */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards: Array<{
    key: string;
    href: string;
    label: string;
    value: string;
    Icon: typeof Trophy;
    extra?: ReactNode;
  }> = [];

  if (data && (data.maxWin24h > 0 || data.maxMultiplier24h > 1)) {
    const value =
      data.maxMultiplier24h > 1
        ? `${data.maxMultiplier24h.toFixed(2)}×`
        : `${data.maxWin24h.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł`;
    const label =
      data.maxMultiplier24h > 1 && data.maxWin24h > 0
        ? `${t("home.missedMax")} · ${data.maxWin24h.toLocaleString(localeTag, { maximumFractionDigits: 0 })} zł`
        : t("home.missedMax");
    cards.push({
      key: "max",
      href: "/profile",
      label,
      value,
      Icon: Trophy,
    });
  }

  if (data && data.winStreak > 0) {
    cards.push({
      key: "streak",
      href: "/profile",
      label: t("home.missedStreak"),
      value: String(data.winStreak),
      Icon: Trophy,
      extra: <StreakPips n={data.winStreak} />,
    });
  }

  if (data && data.freeCases > 0) {
    cards.push({
      key: "cases",
      href: "/game/cases",
      label: data.freeCases === 1 ? t("home.missedCase") : t("home.missedCases"),
      value: String(data.freeCases),
      Icon: Box,
    });
  }

  if (contest && !hideContest) {
    const left = formatRemainingShort(Math.max(0, contest.endsAt - Date.now()));
    cards.push({
      key: "contest",
      href: contest.href,
      label: t("home.missedContest"),
      value: left,
      Icon: Timer,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 font-roobert text-[10px] uppercase tracking-[0.22em] text-white/45">
        {t("home.missedTitle")}
      </span>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {cards.map((card) => (
          <Pressable
            key={card.key}
            onClick={() => onOpen(card.href)}
            className="min-w-[148px] flex-1 rounded-2xl border border-white/12 bg-[#101216] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex items-center gap-1.5 font-roobert text-[10px] uppercase tracking-[0.16em] text-white/40">
              <card.Icon className="h-3 w-3" strokeWidth={2} />
              <span className="truncate">{card.label}</span>
            </div>
            <div className="mt-1.5 font-roobert text-[20px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-frost-white">
              {card.value}
            </div>
            {card.extra ? <div className="mt-2">{card.extra}</div> : null}
          </Pressable>
        ))}
      </div>
    </div>
  );
}
