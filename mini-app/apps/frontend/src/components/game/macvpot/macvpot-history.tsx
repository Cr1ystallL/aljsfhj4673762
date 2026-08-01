'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotHistoryProps {
  history: MacvpotHistoryRow[];
}

export function MacvpotHistory({ history }: MacvpotHistoryProps) {
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (history.length === 0) {
    return (
      <div className="w-full text-center py-8 text-white/40 text-sm border border-white/5 bg-white/[0.02] rounded-2xl">
        История пока пуста. Будьте первым участником!
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2.5">
      {history.map((item) => {
        const isExpanded = expandedRound === item.roundId;
        const winnerName = item.winner?.name || 'Нет победителя';
        const winnerInitial = winnerName.charAt(0).toUpperCase();
        const dateStr = new Date(item.endedAt).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return (
          <div
            key={item.roundId}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md overflow-hidden transition-all hover:bg-white/[0.04]"
          >
            <div
              onClick={() => setExpandedRound(isExpanded ? null : item.roundId)}
              className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              {/* Left: Winner info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0">
                  {item.winner?.photoUrl ? (
                    <Image
                      src={item.winner.photoUrl}
                      alt={winnerName}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <span className="text-white font-bold text-sm">{winnerInitial}</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white truncate max-w-[120px] sm:max-w-[180px]">
                      {winnerName}
                    </span>
                    {item.winner && (
                      <span className="text-[10px] font-medium text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/20">
                        {item.winner.chance}%
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-white/40">{dateStr}</span>
                </div>
              </div>

              {/* Right: Bank info & Accordion toggle */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="font-black text-amber-400 text-sm">
                    +{item.totalPot.toLocaleString('ru-RU')} монет
                  </span>
                  <span className="text-[11px] text-white/40">
                    {item.playerCount} участников
                  </span>
                </div>

                <div className="text-white/40">
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>
            </div>

            {/* Provably Fair details accordion */}
            {isExpanded && (
              <div className="px-3.5 pb-3.5 pt-2 border-t border-white/5 bg-black/20 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between text-purple-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-purple-400" />
                    Provably Fair (Честность)
                  </span>
                  <span className="text-white/40">Билет #{item.winningTicket}</span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between bg-white/[0.03] p-2 rounded-xl">
                    <span className="text-white/50">Server Seed Hash:</span>
                    <button
                      onClick={() => handleCopy(item.serverSeedHash, `ssh-${item.roundId}`)}
                      className="flex items-center gap-1 text-white/80 hover:text-white font-mono"
                    >
                      <span>{item.serverSeedHash.substring(0, 16)}...</span>
                      {copiedKey === `ssh-${item.roundId}` ? (
                        <Check size={12} className="text-green-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-white/[0.03] p-2 rounded-xl">
                    <span className="text-white/50">Server Seed (Открыт):</span>
                    <button
                      onClick={() => handleCopy(item.serverSeed, `ss-${item.roundId}`)}
                      className="flex items-center gap-1 text-white/80 hover:text-white font-mono"
                    >
                      <span>{item.serverSeed ? `${item.serverSeed.substring(0, 16)}...` : 'Скрыт'}</span>
                      {copiedKey === `ss-${item.roundId}` ? (
                        <Check size={12} className="text-green-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
