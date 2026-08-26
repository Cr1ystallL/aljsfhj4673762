'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShieldCheck,
  History,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  hidden?: boolean;
}

export interface BlackjackRoundHistoryItem {
  roundId: string;
  endedAt: number;
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed: string;
  nonce: number;
  dealerHand: Card[];
  dealerValue: number;
  dealerBust: boolean;
  players: Array<{
    userId: string;
    name: string;
    avatar?: string;
    seatId: number;
    bet: number;
    payout: number;
    result: 'win' | 'lose' | 'push' | 'blackjack';
    playerValue: number;
    hand: Card[];
  }>;
}

interface BlackjackHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  currentRoundId?: string;
  currentServerSeedHash?: string;
  history: BlackjackRoundHistoryItem[];
  currentUserId?: string;
}

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  hearts: { symbol: '♥', color: 'text-red-500' },
  diamonds: { symbol: '♦', color: 'text-red-500' },
  clubs: { symbol: '♣', color: 'text-white' },
  spades: { symbol: '♠', color: 'text-white' },
};

function MiniCard({ card }: { card: Card }) {
  if (card.hidden) {
    return (
      <span className="inline-flex h-6 w-5 items-center justify-center rounded bg-amber-800/80 border border-amber-500/40 text-[10px] font-bold text-amber-200 shadow-sm">
        🂠
      </span>
    );
  }
  const s = SUIT_SYMBOLS[card.suit] || { symbol: '', color: 'text-white' };
  return (
    <span className="inline-flex h-6 min-w-5 px-1 items-center justify-center gap-0.5 rounded bg-white/[0.12] border border-white/20 text-[11px] font-bold shadow-sm">
      <span className="text-frost-white">{card.rank}</span>
      <span className={cn('text-[10px] leading-none', s.color)}>{s.symbol}</span>
    </span>
  );
}

export function BlackjackHistoryModal({
  isOpen,
  onClose,
  roomId,
  currentRoundId,
  currentServerSeedHash,
  history,
  currentUserId,
}: BlackjackHistoryModalProps) {
  const router = useRouter();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Скопировано в буфер!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleVerifyInCalculator = (item: BlackjackRoundHistoryItem) => {
    const query = new URLSearchParams({
      game: 'blackjack',
      serverSeed: item.serverSeed || '',
      clientSeed: item.clientSeed || '',
      nonce: String(item.nonce || 1),
    }).toString();
    onClose();
    router.push(`/info?${query}#calculator`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-[28px] sm:rounded-3xl border border-amber-500/30 bg-[#0c100d]/95 backdrop-blur-2xl shadow-[0_25px_70px_rgba(0,0,0,0.95)] overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 shadow-inner">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">
                    Честность & История
                  </h2>
                  <p className="text-xs text-amber-300/70">
                    {roomId === 'bj_table_1' ? 'Стол #1' : `Стол #${roomId.replace('bj_table_', '')}`} • Provably Fair
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* CURRENT LIVE ROUND SEED CARD */}
              {currentServerSeedHash && (
                <div className="p-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 shadow-inner space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-400 uppercase tracking-wider text-[11px]">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      Текущий раунд
                    </span>
                    <span className="text-[10px] text-white/50 font-mono">
                      {currentRoundId ? currentRoundId.substring(0, 18) + '...' : ''}
                    </span>
                  </div>

                  <p className="text-[11px] text-white/70 leading-relaxed">
                    Хэш колоды сформирован до раздачи. После окончания раунда станет доступен открытый ключ для проверки в калькуляторе.
                  </p>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-black/60 border border-white/10 font-mono text-[10px]">
                    <span className="text-white/40 select-none mr-2">SHA-256:</span>
                    <span className="text-emerald-300 truncate flex-1 font-bold">
                      {currentServerSeedHash}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(currentServerSeedHash, 'current_hash')}
                      className="ml-2 p-1 text-white/60 hover:text-white transition-colors cursor-pointer"
                      title="Скопировать хэш"
                    >
                      {copiedKey === 'current_hash' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {/* RECENT ROUNDS LIST */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="font-bold text-white/70 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <History size={13} className="text-amber-400" />
                    Недавние раунды ({history.length})
                  </span>
                </div>

                {history.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-white/5 bg-white/[0.02] text-white/40">
                    Сыграйте хотя бы один раунд за столом, чтобы увидеть историю и криптографические ключи.
                  </div>
                ) : (
                  history.map((item, idx) => {
                    const isExpanded = expandedRoundId === item.roundId;
                    const myResult = item.players.find((p) => p.userId === currentUserId);
                    const timeStr = new Date(item.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    return (
                      <div
                        key={item.roundId || idx}
                        className="rounded-2xl border border-white/10 bg-black/50 overflow-hidden transition-all hover:border-amber-500/30"
                      >
                        {/* Summary Bar */}
                        <div
                          onClick={() => setExpandedRoundId(isExpanded ? null : item.roundId)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-amber-300/80 font-bold">
                                #{idx + 1}
                              </span>
                              <span className="text-[10px] text-white/40 font-mono">
                                {timeStr}
                              </span>
                              {myResult && (
                                <span
                                  className={cn(
                                    'px-1.5 py-0.2 rounded text-[10px] font-bold uppercase font-mono tracking-tight',
                                    myResult.result === 'win' || myResult.result === 'blackjack'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : myResult.result === 'push'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  )}
                                >
                                  {myResult.result === 'blackjack' ? 'BJ' : myResult.result === 'win' ? 'Победа' : myResult.result === 'push' ? 'Ничья' : 'Проигрыш'}
                                </span>
                              )}
                            </div>

                            {/* Dealer outcome cards */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-white/50">Дилер:</span>
                              <div className="flex items-center gap-1">
                                {item.dealerHand.map((c, i) => (
                                  <MiniCard key={i} card={c} />
                                ))}
                              </div>
                              <span className="text-[10px] font-bold text-amber-300 font-mono ml-0.5">
                                ({item.dealerBust ? 'Перебор ' + item.dealerValue : item.dealerValue})
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {myResult && myResult.payout > 0 && (
                              <span className="text-xs font-black text-emerald-400 font-mono">
                                +{myResult.payout} zł
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronUp size={15} className="text-white/40" />
                            ) : (
                              <ChevronDown size={15} className="text-white/40" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Details / Provably Fair Verification Info */}
                        {isExpanded && (
                          <div className="p-3 border-t border-white/10 bg-black/80 space-y-3">
                            {/* Players Table Breakdown */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold text-white/60 uppercase">
                                Игроки за столом:
                              </span>
                              <div className="space-y-1">
                                {item.players.map((p, pIdx) => {
                                  const isMe = p.userId === currentUserId;
                                  return (
                                    <div
                                      key={pIdx}
                                      className={cn(
                                        'flex items-center justify-between p-1.5 rounded-lg border text-[11px]',
                                        isMe
                                          ? 'border-amber-400/40 bg-amber-400/10'
                                          : 'border-white/5 bg-white/[0.02]'
                                      )}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-bold text-white truncate max-w-[90px]">
                                          {isMe ? 'Вы' : p.name}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          {p.hand.map((c, ci) => (
                                            <MiniCard key={ci} card={c} />
                                          ))}
                                        </div>
                                        <span className="text-[10px] text-white/60 font-mono">
                                          ({p.playerValue})
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                                        <span className="text-white/40">Ставка {p.bet}</span>
                                        <span
                                          className={cn(
                                            'font-bold',
                                            p.payout > p.bet
                                              ? 'text-emerald-400'
                                              : p.payout === p.bet
                                              ? 'text-amber-300'
                                              : 'text-red-400'
                                          )}
                                        >
                                          {p.payout > 0 ? `+${p.payout}` : '0'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Cryptographic Seeds Block */}
                            <div className="space-y-2 pt-1 border-t border-white/5">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                <ShieldCheck size={12} />
                                Доказательство честности (Provably Fair)
                              </span>

                              {/* Server Seed */}
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-white/40">Server Seed (открытый ключ):</span>
                                <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px]">
                                  <span className="text-amber-200 truncate flex-1">
                                    {item.serverSeed || 'Скрыт'}
                                  </span>
                                  {item.serverSeed && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(item.serverSeed!, `seed_${item.roundId}`)}
                                      className="ml-1 p-0.5 text-white/60 hover:text-white"
                                    >
                                      {copiedKey === `seed_${item.roundId}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Server Seed Hash */}
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-white/40">Server Seed Hash (SHA-256):</span>
                                <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px]">
                                  <span className="text-emerald-300 truncate flex-1">
                                    {item.serverSeedHash}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(item.serverSeedHash, `hash_${item.roundId}`)}
                                    className="ml-1 p-0.5 text-white/60 hover:text-white"
                                  >
                                    {copiedKey === `hash_${item.roundId}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </div>

                              {/* Client Seed & Nonce */}
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-white/60">
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 truncate">
                                  Seed: {item.clientSeed}
                                </div>
                                <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                                  Nonce: {item.nonce}
                                </div>
                              </div>

                              {/* Verification Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyInCalculator(item)}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-300 font-bold text-[11px] transition-all active:scale-95 cursor-pointer"
                                >
                                  <ExternalLink size={13} />
                                  <span>Проверить в калькуляторе</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const text = JSON.stringify(
                                      {
                                        roundId: item.roundId,
                                        game: 'blackjack',
                                        serverSeed: item.serverSeed,
                                        serverSeedHash: item.serverSeedHash,
                                        clientSeed: item.clientSeed,
                                        nonce: item.nonce,
                                        dealerValue: item.dealerValue,
                                      },
                                      null,
                                      2
                                    );
                                    handleCopy(text, `full_${item.roundId}`);
                                  }}
                                  className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 font-bold text-[11px] transition-all active:scale-95 cursor-pointer shrink-0"
                                  title="Скопировать все данные раунда"
                                >
                                  {copiedKey === `full_${item.roundId}` ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                  <span>JSON</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
