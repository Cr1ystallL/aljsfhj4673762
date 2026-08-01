'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Hash, Dice5, KeyRound, Copy } from 'lucide-react';
// Web Crypto API is available globally in browsers

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
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Float generation function matching backend
function hashToFloat(hash: string): number {
  const slice = hash.substring(0, 13);
  const int = parseInt(slice, 16);
  return int / Math.pow(2, 52);
}

export function ProvablyFairCalculator() {
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('1');
  const [game, setGame] = useState<'crash' | 'mines' | 'coinflip' | 'wheel' | 'plinko' | 'bridges'>('crash');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<{
    hash?: string;
    value?: string | number;
    error?: string;
  } | null>(null);

  const calculate = async () => {
    if (!serverSeed || !clientSeed || !nonce) {
      setResult({ error: 'Пожалуйста, заполните все поля' });
      return;
    }

    setIsCalculating(true);
    
    // Artificial small delay for effect
    await new Promise(r => setTimeout(r, 400));

    try {
      // Calculate SHA256 using Web Crypto API
      const message = `${serverSeed}${clientSeed}:${nonce}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const u = hashToFloat(hash);
      
      let finalValue: string | number = '';

      switch (game) {
        case 'crash':
          const raw = 0.956 / (1 - u);
          finalValue = Math.max(1.00, Math.floor(raw * 100) / 100).toFixed(2) + 'x';
          break;
        case 'coinflip':
          const n = parseInt(hash.substring(0, 8), 16);
          finalValue = n % 2 === 0 ? 'Орел (Heads)' : 'Решка (Tails)';
          break;
        case 'wheel':
          const max = Math.pow(2, 52);
          const segmentInt = parseInt(hash.substring(0, 13), 16);
          const segmentIndex = Math.floor((segmentInt / max) * 15);
          finalValue = `Сектор ${segmentIndex}`;
          break;
        case 'macvpot':
          const winningTicketPercentage = (u * 100).toFixed(2);
          finalValue = `Выигрышный процент: ${winningTicketPercentage}%`;
          break;
        case 'mines':
        case 'plinko':
        case 'bridges':
          finalValue = 'Хэш сгенерирован (Логика в разработке)';
          break;
      }

      setResult({ hash, value: finalValue });
    } catch (e) {
      setResult({ error: 'Ошибка при вычислении хэша' });
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
      {/* Glow effect background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-macvbet-red/5 rounded-full blur-[80px] -z-10 pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-roobert font-bold text-xl text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-macvbet-red/10 border border-macvbet-red/20 flex items-center justify-center">
            <CheckCircle2 size={20} className="text-macvbet-red" />
          </div>
          Инспектор Ставок
        </h3>
      </div>
      
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">Выберите игру</label>
          <div className="relative">
            <Dice5 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
            <select 
              value={game}
              onChange={(e) => setGame(e.target.value as any)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all appearance-none font-medium"
            >
              <option value="macvpot">MacvPot (Jackpot)</option>
              <option value="crash">MacvJet (Crash)</option>
              <option value="coinflip">Coinflip</option>
              <option value="wheel">Wheel</option>
              <option value="mines">Mines</option>
              <option value="plinko">Plinko</option>
              <option value="bridges">Bridges</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1 flex justify-between">
            <span>Server Seed</span>
            <span className="text-red-400/70 lowercase font-normal tracking-normal">(незашифрованный)</span>
          </label>
          <div className="relative">
            <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
            <input 
              type="text" 
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono"
              placeholder="e.g. 5b9f7a..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">Client Seed</label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
              <input 
                type="text" 
                value={clientSeed}
                onChange={(e) => setClientSeed(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono"
                placeholder="Ваш seed"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-frost-white/40 ml-1">Nonce</label>
            <div className="relative">
              <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-frost-white/30" />
              <input 
                type="number" 
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl pl-14 pr-4 py-3.5 text-sm text-frost-white focus:border-macvbet-red/50 focus:bg-white/5 focus:outline-none transition-all placeholder-white/20 font-mono"
                placeholder="Раунд"
              />
            </div>
          </div>
        </div>

        <button 
          onClick={calculate}
          disabled={isCalculating}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-macvbet-red to-rose-600 hover:from-macvbet-red-hover hover:to-rose-500 text-white py-4 rounded-2xl transition-all font-bold text-base mt-6 shadow-[0_0_20px_rgba(255,42,76,0.3)] hover:shadow-[0_0_30px_rgba(255,42,76,0.5)] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw size={18} className={isCalculating ? 'animate-spin' : ''} />
          {isCalculating ? 'Вычисляем...' : 'Проверить честность'}
        </button>
      </div>

      {result && (
        <div className={`mt-6 p-1 rounded-2xl transition-all duration-500 ${result.error ? 'bg-red-500/20' : 'bg-gradient-to-b from-white/10 to-transparent'}`}>
          <div className="bg-midnight-canvas rounded-[14px] p-5 border border-white/5 h-full relative overflow-hidden">
            {/* Inner glow for result */}
            {!result.error && <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[40px] pointer-events-none" />}
            
            {result.error ? (
              <div className="flex items-center gap-3 text-red-400 font-medium">
                <AlertCircle size={20} />
                {result.error}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-frost-white/40 mb-1.5 flex items-center justify-between">
                    <span>HMAC-SHA256 (Сгенерированный хэш)</span>
                    <button 
                      onClick={() => result.hash && navigator.clipboard.writeText(result.hash)}
                      className="text-frost-white/50 hover:text-white transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="font-mono text-xs text-frost-white/80 break-all bg-black/30 p-3 rounded-xl border border-white/5">
                    {result.hash}
                  </div>
                </div>
                
                <div className="pt-2 border-t border-white/5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-frost-white/40 mb-1">
                    Итоговый результат
                  </div>
                  <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-frost-white/80">
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
