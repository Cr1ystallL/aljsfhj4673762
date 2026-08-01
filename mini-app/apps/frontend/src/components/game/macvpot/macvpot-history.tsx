'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, Copy, Check, X, Trophy, Sparkles } from 'lucide-react';
import type { MacvpotHistoryRow } from '@/app/game/macvpot/page';

interface MacvpotHistoryProps {
  history: MacvpotHistoryRow[];
}

export function MacvpotHistory({ history }: MacvpotHistoryProps) {
  const [selectedRound, setSelectedRound] = useState<MacvpotHistoryRow | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (history.length === 0) {
    return (
      <div className="w-full flex items-center justify-center py-3 px-4 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-white/40 font-medium">
        <Sparkles size={14} className="text-amber-400 mr-2" />
        История раундов формируется... Будьте первым победителем!
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Top horizontal scrolling history chips */}
      <div className="w-full flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 shrink-0 flex items-center gap-1 mr-1">
          <Trophy size={12} className="text-amber-400" />
          Раунды:
        </div>

        {history.map((item) => {
          const winnerName = item.winner?.name || 'Ничья';
          const winnerInitial = winnerName.charAt(0).toUpperCase();

          return (
            <button
              key={item.roundId}
              onClick={() => setSelectedRound(item)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all shrink-0 group backdrop-blur-md"
            >
              <div className="w-5 h-5 rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                {item.winner?.photoUrl ? (
                  <Image
                    src={item.winner.photoUrl}
                    alt={winnerName}
                    width={20}
                    height={20}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                ) : (
                  <span className="text-[10px] font-bold text-white">{winnerInitial}</span>
                )}
              </div>

              <span className="text-xs font-bold text-amber-400 font-mono">
                {item.totalPot.toLocaleString('ru-RU')} zł
              </span>

              <span className="text-[10px] font-semibold text-white/70 bg-white/[0.06] px-1.5 py-0.2 rounded-md border border-white/10">
                {item.winner?.chance || 0}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Provably Fair Detail Modal */}
      {selectedRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0d0d12] p-5 text-white flex flex-col gap-4 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
            <button
              onClick={() => setSelectedRound(null)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-amber-400">
                <ShieldCheck size={22} />
              </div>
              <div className="flex flex-col">
                <h3 className="font-bold text-base font-roobert text-white">
                  Проверка честности раунда
                </h3>
                <span className="text-xs text-white/40 font-mono">
                  ID: {selectedRound.roundId.substring(0, 18)}...
                </span>
              </div>
            </div>

            {/* Winner summary */}
            <div className="w-full rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden">
                  {selectedRound.winner?.photoUrl ? (
                    <Image
                      src={selectedRound.winner.photoUrl}
                      alt={selectedRound.winner.name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <span className="font-bold text-sm text-white">
                      {(selectedRound.winner?.name || 'П').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-white">
                    {selectedRound.winner?.name || 'Нет победителя'}
                  </span>
                  <span className="text-xs text-white/70 font-semibold">
                    Шанс: {selectedRound.winner?.chance}%
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs text-white/50">Банк раунда</span>
                <span className="font-black text-amber-400 text-base">
                  {selectedRound.totalPot.toLocaleString('ru-RU')} zł
                </span>
              </div>
            </div>

            {/* Provably Fair Seeds */}
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-col gap-1 bg-black/60 border border-white/10 p-3 rounded-2xl">
                <span className="text-white/50 font-medium">Server Seed (Открытый ключ):</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-white/80 break-all text-[11px]">
                    {selectedRound.serverSeed || 'Скрыт'}
                  </span>
                  <button
                    onClick={() => handleCopy(selectedRound.serverSeed, 'ss')}
                    className="p-1 text-white/60 hover:text-white"
                  >
                    {copiedKey === 'ss' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 bg-black/60 border border-white/10 p-3 rounded-2xl">
                <span className="text-white/50 font-medium">Server Seed Hash (SHA256):</span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-white/80 break-all text-[11px]">
                    {selectedRound.serverSeedHash}
                  </span>
                  <button
                    onClick={() => handleCopy(selectedRound.serverSeedHash, 'ssh')}
                    className="p-1 text-white/60 hover:text-white"
                  >
                    {copiedKey === 'ssh' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/60 border border-white/10 p-2.5 rounded-2xl flex flex-col gap-0.5">
                  <span className="text-white/50 text-[10px]">Client Seed:</span>
                  <span className="font-mono text-white/80 text-[11px] truncate">
                    {selectedRound.clientSeed}
                  </span>
                </div>

                <div className="bg-black/60 border border-white/10 p-2.5 rounded-2xl flex flex-col gap-0.5">
                  <span className="text-white/50 text-[10px]">Выигрышный билет:</span>
                  <span className="font-mono text-amber-400 text-xs font-bold">
                    #{selectedRound.winningTicket}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedRound(null)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-all"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
