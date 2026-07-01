'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [game, setGame] = useState<'crash' | 'mines' | 'coinflip' | 'wheel'>('crash');
  
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

    try {
      const message = `${clientSeed}:${nonce}:0`;
      const hash = await hmacSha256(serverSeed, message);
      const u = hashToFloat(hash);
      
      let finalValue: string | number = '';

      switch (game) {
        case 'crash':
          const raw = 0.956 / (1 - u);
          finalValue = Math.max(1.00, Math.floor(raw * 100) / 100) + 'x';
          break;
        case 'coinflip':
          const n = parseInt(hash.substring(0, 8), 16);
          finalValue = n % 2 === 0 ? 'Heads' : 'Tails';
          break;
        case 'wheel':
          const max = Math.pow(2, 52);
          const segmentInt = parseInt(hash.substring(0, 13), 16);
          const segmentIndex = Math.floor((segmentInt / max) * 15);
          finalValue = `Сектор ${segmentIndex}`;
          break;
        case 'mines':
          finalValue = 'Калькулятор для Mines в разработке';
          break;
      }

      setResult({ hash, value: finalValue });
    } catch (e) {
      setResult({ error: 'Ошибка при вычислении' });
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <h3 className="font-roobert font-semibold text-lg text-frost-white flex items-center gap-2">
        <CheckCircle2 size={18} className="text-macvbet-red" />
        Калькулятор Честной игры
      </h3>
      
      <div className="space-y-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-frost-white/50 mb-1">Игра</label>
          <select 
            value={game}
            onChange={(e) => setGame(e.target.value as any)}
            className="w-full bg-midnight-canvas border border-white/10 rounded-xl px-3 py-2 text-sm text-frost-white focus:border-white/30 focus:outline-none"
          >
            <option value="crash">Crash</option>
            <option value="coinflip">Coinflip</option>
            <option value="wheel">Wheel</option>
            <option value="mines">Mines (скоро)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-frost-white/50 mb-1">Server Seed (незашифрованный)</label>
          <input 
            type="text" 
            value={serverSeed}
            onChange={(e) => setServerSeed(e.target.value)}
            className="w-full bg-midnight-canvas border border-white/10 rounded-xl px-3 py-2 text-sm text-frost-white focus:border-white/30 focus:outline-none placeholder-white/20"
            placeholder="Вставьте server seed"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-frost-white/50 mb-1">Client Seed</label>
          <input 
            type="text" 
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value)}
            className="w-full bg-midnight-canvas border border-white/10 rounded-xl px-3 py-2 text-sm text-frost-white focus:border-white/30 focus:outline-none placeholder-white/20"
            placeholder="Вставьте client seed"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-frost-white/50 mb-1">Nonce</label>
          <input 
            type="number" 
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
            className="w-full bg-midnight-canvas border border-white/10 rounded-xl px-3 py-2 text-sm text-frost-white focus:border-white/30 focus:outline-none placeholder-white/20"
            placeholder="Номер раунда (Nonce)"
          />
        </div>

        <button 
          onClick={calculate}
          className="w-full flex items-center justify-center gap-2 bg-macvbet-red hover:bg-macvbet-red-hover text-white py-2.5 rounded-xl transition-colors font-medium text-sm mt-2"
        >
          <RefreshCw size={16} />
          Рассчитать результат
        </button>
      </div>

      {result && (
        <div className="mt-4 p-4 rounded-xl bg-midnight-canvas/50 border border-white/10 space-y-2 break-all">
          {result.error ? (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle size={16} />
              {result.error}
            </div>
          ) : (
            <>
              <div className="text-xs text-frost-white/60">
                <span className="font-semibold text-frost-white/80">HMAC-SHA256:</span><br/>
                {result.hash}
              </div>
              <div className="text-sm font-semibold text-macvbet-red">
                <span className="text-frost-white/80 font-normal">Результат:</span> {result.value}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
