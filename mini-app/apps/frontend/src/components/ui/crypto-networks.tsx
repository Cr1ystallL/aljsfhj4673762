import React from 'react';

/**
 * High-Resolution Official Crypto & Payment Method Images with large default sizes
 */

export function Trc20Icon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <img
      src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/trx.png"
      alt="TRON"
      className={`${className} object-contain`}
    />
  );
}

export function TonIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <img
      src="https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png"
      alt="TON"
      className={`${className} object-contain`}
    />
  );
}

export function Bep20Icon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <img
      src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bnb.png"
      alt="BEP-20"
      className={`${className} object-contain`}
    />
  );
}

export function UsdtIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <img
      src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png"
      alt="USDT"
      className={`${className} object-contain`}
    />
  );
}

export function CryptoBotIcon({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <img
      src="/cb.png"
      alt="CryptoBot"
      className={`${className} object-contain`}
    />
  );
}

export function DirectCryptoIcon({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <img
      src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png"
      alt="Direct Crypto"
      className={`${className} object-contain`}
    />
  );
}

export function BankCardIcon({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}
