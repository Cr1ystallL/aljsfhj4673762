'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Hash, Dice5, KeyRound, Copy, ShieldCheck, Check } from 'lucide-react';

// Helper for SHA-256 using Web Crypto API
async function sha256Hex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper for HMAC-SHA256 using Web Crypto API
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const messageData = encoder.encode(message);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert first 13 hex chars (52 bits) to uniform float [0, 1) matching backend
function hashToFloat(hash: string): number {
  const slice = hash.substring(0, 13);
  const int = parseInt(slice, 16);
  return int / Math.pow(2, 52);
}

// Deterministic mines position generator matching backend
async function generateMinesPositions(serverSeed: string, clientSeed: string, nonce: number, mineCount = 3): Promise<number[]> {
  const hash = await hmacSha256(serverSeed, `${clientSeed}:${nonce}`);
  const totalCells = 25;
  const cells: number[] = Array.from({ length: totalCells }, (_, i) => i);
  
  // Stretch byte stream
  let streamHex = hash;
  let counter = 0;
  
  for (let i = 0; i < mineCount; i++) {
    if (streamHex.length < 8) {
      streamHex += await sha256Hex(`${hash}:${counter++}`);
    }
    const chunk = parseInt(streamHex.slice(0, 8), 16);
    streamHex = streamHex.slice(8);
    const remaining = totalCells - i;
    const j = i + (chunk % remaining);
    const tmp = cells[i];
    cells[i] = cells[j];
    cells[j] = tmp;
  }
  return cells.slice(0, mineCount).sort((a, b) => a - b);
}

// Deterministic blackjack top cards generator matching backend 6-deck shoe
async function generateBlackjackTopCards(serverSeed: string, clientSeed: string, nonce: number, count = 8): Promise<string[]> {
  const suits = [
    { name: 'hearts', symbol: '♥' },
    { name: 'diamonds', symbol: '♦' },
    { name: 'clubs', symbol: '♣' },
    { name: 'spades', symbol: '♠' },
  ];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Array<{ rank: string; symbol: string }> = [];

  for (let d = 0; d < 6; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, symbol: suit.symbol });
      }
    }
  }

  const message = `${clientSeed}:${nonce}`;
  let streamHex = await hmacSha256(serverSeed, message);
  let counter = 0;

  for (let i = deck.length - 1; i > 0; i--) {
    if (streamHex.length < 8) {
      streamHex += await hmacSha256(serverSeed, `${message}:${counter++}`);
    }
    const chunk = parseInt(streamHex.slice(0, 8), 16);
    streamHex = streamHex.slice(8);
    const j = chunk % (i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return deck.slice(deck.length - count).reverse().map((c, i) => `${i + 1}. [${c.rank}${c.symbol}]`);
}

export function ProvablyFairCalculator() {
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('1');
  const [game, setGame] = useState<'crash' | 'blackjack' | 'mines' | 'coinflip' | 'wheel' | 'macvpot'>('crash');

  const [isCalculating, setIsCalculating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [result, setResult] = useState<{
    serverSeedHash?: string;
    hash?: string;
    value?: string | React.ReactNode;
    error?: string;
  } | null>(null);

  // Auto-fill from URL params if present (e.g. redirected from round history)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const urlServerSeed = sp.get('serverSeed') || sp.get('ss');
      const urlClientSeed = sp.get('clientSeed') || sp.get('cs');
      const urlNonce = sp.get('nonce') || sp.get('n');
      const urlGame = sp.get('game') as any;

      if (urlServerSeed) setServerSeed(urlServerSeed);
      if (urlClientSeed) setClientSeed(urlClientSeed);
      if (urlNonce) setNonce(urlNonce);
      if (urlGame && ['crash', 'blackjack', 'mines', 'coinflip', 'wheel', 'macvpot'].includes(urlGame)) {
        setGame(urlGame);
      }
    }
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const calculate = async () => {
    if (!serverSeed.trim() || !clientSeed.trim() || !nonce) {
      setResult({ error: 'Пожалуйста, заполните все поля (Server Seed, Client Seed, Nonce)' });
      return;
    }

    setIsCalculating(true);
    await new Promise((r) => setTimeout(r, 200));

    try {
      const cleanServerSeed = serverSeed.trim();
      const cleanClientSeed = clientSeed.trim();
      const cleanNonce = parseInt(nonce, 10) || 1;

      // 1. Calculate Server Seed SHA-256
      const calculatedServerSeedHash = await sha256Hex(cleanServerSeed);

      // 2. Calculate HMAC-SHA256 (serverSeed, clientSeed:nonce)
      const hmacHash = await hmacSha256(cleanServerSeed, `${cleanClientSeed}:${cleanNonce}`);
      const u = hashToFloat(hmacHash);

      let finalValue: string | React.ReactNode = '';

      switch (game) {
        case 'crash': {
          const raw = 0.95 / (1 - u);
          const mult = Math.max(1.00, Math.floor(raw * 100) / 100).toFixed(2);
          finalValue = `${mult}x`;
          break;
        }
        case 'coinflip': {
          const isHeads = u < 0.5;
          finalValue = isHeads ? 'Орёл (Heads)' : 'Решка (Tails)';
          break;
        }
        case 'wheel': {
          const segmentIndex = Math.floor(u * 15);
          finalValue = `Сектор ${segmentIndex}`;
          break;
        }
        case 'macvpot': {
          const winningPercentage = (u * 100).toFixed(2);
          finalValue = `Выигрышный процент банка: ${winningPercentage}%`;
          break;
        }
        case 'blackjack': {
          const topCards = await generateBlackjackTopCards(cleanServerSeed, cleanClientSeed, cleanNonce, 8);
          finalValue = (
            <div className="space-y-1">
              <span className="text-xs text-amber-300 font-semibold block">
                Первые 8 карт в колоде раунда:
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {topCards.map((card, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-lg bg-black/60 border border-white/10 text-white font-mono text-xs font-bold"
                  >
                    {card}
                  </span>
                ))}
              </div>
            </div>
          );
          break;
        }
        case 'mines': {
          const mines = await generateMinesPositions(cleanServerSeed, cleanClientSeed, cleanNonce, 3);
          finalValue = (
            <div>
              <span className="text-xs text-amber-300 font-semibold block mb-1">
                Расположение мин (для 3 мин):
              </span>
              <div className="flex gap-2">
                {mines.map((cell) => (
                  <span
                    key={cell}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-xs font-bold"
                  >
                    Ячейка #{cell + 1} (индекс {cell})
                  </span>
                ))}
              </div>
            </div>
          );
          break;
        }
      }

      setResult({
        serverSeedHash: calculatedServerSeedHash,
        hash: hmacHash,
        value: finalValue,
      });
    } catch (e) {
      setResult({ error: 'Ошибка при вычислении криптографического хэша' });
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
      {/* Glow effect background */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-macvbet-red/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="font-roobert font-bold text-xl text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-macvbet-red/10 border border-macvbet-red/20 flex items-center justify-center">
            <CheckCircle2 size={20} className="text-macvbet-red" />
          </div>
          Инспектор Честности (Provably Fair)
        </h3>
      </div>

      <div className="space-y-4 relative z-10">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">
            Игра
          </label>
          <div className="relative">
            <Dice5 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
            <select
              value={game}
              onChange={(e) => setGame(e.target.value as any)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-10 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="crash">MacvJet (Crash)</option>
              <option value="blackjack">Blackjack (21)</option>
              <option value="mines">Mines</option>
              <option value="coinflip">Coinflip</option>
              <option value="macvpot">MacvPot</option>
              <option value="wheel">Wheel</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1 flex justify-between">
            <span>Server Seed</span>
            <span className="text-amber-400/80 lowercase font-normal tracking-normal">
              (открытый ключ после игры)
            </span>
          </label>
          <div className="relative">
            <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
            <input
              type="text"
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono text-xs"
              placeholder="e.g. 5b9f7a..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">
              Client Seed
            </label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
              <input
                type="text"
                value={clientSeed}
                onChange={(e) => setClientSeed(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono text-xs"
                placeholder="Сид стола / клиента"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">
              Nonce
            </label>
            <div className="relative">
              <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
              <input
                type="number"
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono text-xs"
                placeholder="1"
              />
            </div>
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={isCalculating}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-macvbet-red to-rose-600 hover:from-macvbet-red-hover hover:to-rose-500 text-white py-4 rounded-2xl transition-all font-bold text-base mt-6 shadow-[0_0_20px_rgba(255,42,76,0.3)] hover:shadow-[0_0_30px_rgba(255,42,76,0.5)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw size={18} className={isCalculating ? 'animate-spin' : ''} />
          {isCalculating ? 'Вычисляем...' : 'Проверить честность'}
        </button>
      </div>

      {result && (
        <div
          className={`mt-6 p-1 rounded-2xl transition-all duration-500 ${
            result.error ? 'bg-red-500/20' : 'bg-gradient-to-b from-white/10 to-transparent'
          }`}
        >
          <div className="bg-midnight-canvas rounded-[14px] p-5 border border-white/5 h-full relative overflow-hidden">
            {!result.error && (
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px] pointer-events-none" />
            )}

            {result.error ? (
              <div className="flex items-center gap-3 text-red-400 font-medium">
                <AlertCircle size={20} />
                {result.error}
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Server Seed Hash (SHA-256) Check */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/90 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-emerald-400" />
                      Server Seed SHA-256 (Хэш до начала раунда)
                    </span>
                    <button
                      onClick={() => result.serverSeedHash && handleCopy(result.serverSeedHash, 'ssh')}
                      className="text-frost-white/50 hover:text-white transition-colors"
                      title="Скопировать хэш"
                    >
                      {copiedKey === 'ssh' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-300 break-all bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/30">
                    {result.serverSeedHash}
                  </div>
                  <p className="text-[10px] text-white/50 mt-1">
                    Сверьте этот хэш с хэшем, показанным до начала игры. Если они совпадают — казино не меняло исход.
                  </p>
                </div>

                {/* 2. HMAC-SHA256 */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-frost-white/40 mb-1.5 flex items-center justify-between">
                    <span>HMAC-SHA256 (Вычисленный ключ результата)</span>
                    <button
                      onClick={() => result.hash && handleCopy(result.hash, 'hmac')}
                      className="text-frost-white/50 hover:text-white transition-colors"
                      title="Скопировать HMAC"
                    >
                      {copiedKey === 'hmac' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-frost-white/80 break-all bg-black/40 p-2.5 rounded-xl border border-white/5">
                    {result.hash}
                  </div>
                </div>

                {/* 3. Calculated Outcome */}
                <div className="pt-2 border-t border-white/5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80 mb-1">
                    Итоговый результат раунда
                  </div>
                  <div className="text-xl font-bold text-frost-white">
                    {result.value}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
