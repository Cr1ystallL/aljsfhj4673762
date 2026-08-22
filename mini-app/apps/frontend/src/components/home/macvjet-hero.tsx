"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Rocket, Users } from "lucide-react";
import { Pressable } from "@/components/ui/pressable";
import { useT } from "@/i18n/use-t";

const CRASH_GROWTH = 0.00006;

export type CrashUiPhase = "betting" | "starting" | "playing" | "crashed";

export interface CrashLobbyAvatar {
  userId: string;
  name: string;
  photoUrl: string | null;
}

export interface CrashLobbySnap {
  phase: CrashUiPhase;
  multiplier: number;
  elapsedTime: number;
  phaseEndsAt: number | null;
  crashPointPreview: number | null;
  playerCount: number;
  avatars: CrashLobbyAvatar[];
  lastCrash: number | null;
  fetchedAt: number;
  serverNow: number;
}

function mapPhase(raw: string | undefined): CrashUiPhase {
  if (raw === "starting") return "starting";
  if (raw === "active") return "playing";
  if (raw === "resolving" || raw === "completed") return "crashed";
  return "betting";
}

function lastCrashFromHistory(history: unknown): number | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  const first = history[0];
  if (typeof first === "number" && Number.isFinite(first)) return first;
  if (first && typeof first === "object") {
    const n = Number((first as { crashPoint?: unknown }).crashPoint);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return null;
}

function avatarsFromPlayers(players: unknown): CrashLobbyAvatar[] {
  if (!Array.isArray(players)) return [];
  const seen = new Set<string>();
  const out: CrashLobbyAvatar[] = [];
  for (const p of players) {
    if (!p || typeof p !== "object") continue;
    const userId = String((p as { userId?: unknown }).userId ?? "");
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const user = (p as { user?: { firstName?: string | null; username?: string | null; photoUrl?: string | null } | null }).user;
    out.push({
      userId,
      name: user?.firstName?.trim() || user?.username?.trim() || "?",
      photoUrl: user?.photoUrl ?? null,
    });
    if (out.length >= 5) break;
  }
  return out;
}

function formatMult(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "1.00×";
  return `${n.toFixed(2)}×`;
}

type Listener = (snap: CrashLobbySnap | null) => void;
const listeners = new Set<Listener>();
let cached: CrashLobbySnap | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

async function pullCrashLobby(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/games/crash/state", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) throw new Error("crash state");
    const json = await res.json();
    const s = json?.state;
    if (!s) throw new Error("no state");
    const fetchedAt = Date.now();
    const serverNow =
      typeof s.serverNow === "number" ? s.serverNow : fetchedAt;
    const stats = s.stats ?? {};
    const players = Array.isArray(s.activePlayers) ? s.activePlayers : [];
    const next: CrashLobbySnap = {
      phase: mapPhase(s.phase),
      multiplier: Number(s.multiplier) || 1,
      elapsedTime: Number(s.elapsedTime) || 0,
      phaseEndsAt:
        typeof s.phaseEndsAt === "number" ? s.phaseEndsAt : null,
      crashPointPreview:
        typeof s.crashPointPreview === "number" ? s.crashPointPreview : null,
      playerCount: Number(stats.playerCount) || players.length || 0,
      avatars: avatarsFromPlayers(players),
      lastCrash: lastCrashFromHistory(s.history),
      fetchedAt,
      serverNow,
    };
    cached = next;
    for (const listener of listeners) listener(next);
  } catch {
    /* keep last snapshot */
  } finally {
    inFlight = false;
    if (listeners.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const idle =
      cached?.phase === "betting" || cached?.phase === "crashed" || !cached;
    pollTimer = setTimeout(pullCrashLobby, idle ? 1500 : 750);
  }
}

function armCrashLobbyPoll(): void {
  if (pollTimer || inFlight) return;
  void pullCrashLobby();
}

export function useCrashLobby(enabled = true): CrashLobbySnap | null {
  const [snap, setSnap] = useState<CrashLobbySnap | null>(cached);

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setSnap);
    armCrashLobbyPoll();
    const onVis = () => {
      if (!document.hidden) void pullCrashLobby();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      listeners.delete(setSnap);
      document.removeEventListener("visibilitychange", onVis);
      if (listeners.size === 0 && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, [enabled]);

  return enabled ? snap : null;
}

function remainMs(snap: CrashLobbySnap, now: number): number {
  if (!snap.phaseEndsAt) return 0;
  const remainingAtFetch = snap.phaseEndsAt - snap.serverNow;
  return Math.max(0, remainingAtFetch - (now - snap.fetchedAt));
}

function liveMultiplier(snap: CrashLobbySnap, now: number): number {
  if (snap.phase !== "playing") return snap.multiplier;
  const elapsed = snap.elapsedTime + Math.max(0, now - snap.fetchedAt);
  let m = Math.exp(CRASH_GROWTH * elapsed);
  if (snap.crashPointPreview && m > snap.crashPointPreview) {
    m = snap.crashPointPreview;
  }
  return Math.min(m, 10_000);
}

export function MacvJetHero({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const reduceMotion = useReducedMotion();
  const snap = useCrashLobby(true);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const ms = reduceMotion ? 400 : 80;
    const id = window.setInterval(() => setNowTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const live = useMemo(() => {
    void nowTick;
    const now = Date.now();
    if (!snap) {
      return {
        phase: "betting" as CrashUiPhase,
        multiplier: 1,
        remainMs: 0,
        last: null as number | null,
        players: 0,
        avatars: [] as CrashLobbyAvatar[],
      };
    }
    return {
      phase: snap.phase,
      multiplier: liveMultiplier(snap, now),
      remainMs: remainMs(snap, now),
      last: snap.lastCrash,
      players: snap.playerCount,
      avatars: snap.avatars,
    };
  }, [snap, nowTick]);

  const remainSec = Math.ceil(live.remainMs / 1000);
  const liveOn = live.phase === "playing";
  const showCountdown =
    (live.phase === "betting" || live.phase === "starting") && remainSec > 0;

  const statusLabel =
    live.phase === "playing"
      ? t("home.jetLive")
      : live.phase === "starting"
        ? t("home.jetStarting")
        : live.phase === "crashed"
          ? t("home.jetCrashed")
          : t("home.jetWaiting");

  const headline = live.phase === "crashed"
    ? formatMult(live.last ?? live.multiplier)
    : showCountdown
      ? `0:${String(remainSec).padStart(2, "0")}`
      : live.phase === "playing"
        ? formatMult(live.multiplier)
        : live.last
          ? formatMult(live.last)
          : "1.00×";

  return (
    <Pressable
      onClick={onOpen}
      className="group relative isolate w-full overflow-hidden rounded-[24px] border border-white/12 bg-[#07090d] text-left shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: "url(/MacvJet16-9.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_110%,rgba(165,45,37,0.28),transparent_55%),radial-gradient(80%_50%_at_10%_-10%,rgba(251,191,36,0.10),transparent_50%),linear-gradient(90deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.42)_55%,rgba(0,0,0,0.18)_100%)]" />

      <div className="relative z-10 flex min-h-[168px] flex-col justify-between px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08] text-emerald-300 ring-1 ring-white/10">
                <Rocket className="h-3.5 w-3.5" />
              </span>
              <span className="font-roobert text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                MacvJet
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-roobert text-[10px] font-semibold uppercase tracking-wider ${
                  liveOn
                    ? "bg-emerald-400/15 text-emerald-300"
                    : live.phase === "crashed"
                      ? "bg-rose-400/15 text-rose-300"
                      : "bg-white/[0.08] text-white/50"
                }`}
              >
                {liveOn && (
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                    animate={reduceMotion ? undefined : { opacity: [1, 0.35, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                )}
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 max-w-[230px] font-roobert text-[13px] leading-snug text-white/50">
              {t("home.heroCrashSub")}
            </p>
          </div>

          {live.last != null && live.phase !== "crashed" && (
            <div className="shrink-0 rounded-2xl bg-white/[0.06] px-2.5 py-1.5 text-right ring-1 ring-white/10 backdrop-blur-md">
              <div className="font-roobert text-[9px] font-semibold uppercase tracking-wider text-white/35">
                {t("home.jetLast")}
              </div>
              <div
                className={`font-roobert text-[13px] font-bold tabular-nums ${
                  live.last >= 2 ? "text-emerald-300" : "text-white/70"
                }`}
              >
                {formatMult(live.last)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <motion.div
              key={live.phase}
              initial={reduceMotion ? false : { opacity: 0.6, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-roobert text-[44px] font-bold leading-none tracking-[-0.04em] tabular-nums ${
                live.phase === "crashed"
                  ? "text-rose-300"
                  : liveOn
                    ? "text-white"
                    : "text-white/90"
              }`}
            >
              {headline}
            </motion.div>
            <div className="mt-2 flex items-center gap-2 font-roobert text-[11px] text-white/40">
              <Users className="h-3 w-3" />
              <span>{t("home.jetInRound", { n: live.players })}</span>
              {live.avatars.length > 0 && (
                <span className="ml-1 flex -space-x-1.5">
                  {live.avatars.map((p) =>
                    p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.userId}
                        src={p.photoUrl}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover ring-1 ring-black/60"
                      />
                    ) : (
                      <span
                        key={p.userId}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[8px] font-bold text-white/70 ring-1 ring-black/60"
                      >
                        {p.name[0]?.toUpperCase() ?? "?"}
                      </span>
                    ),
                  )}
                </span>
              )}
            </div>
          </div>

          <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2.5 font-roobert text-[13px] font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {t("home.jetCta")}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Pressable>
  );
}
