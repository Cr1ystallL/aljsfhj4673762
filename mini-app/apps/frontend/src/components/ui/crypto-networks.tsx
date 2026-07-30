import React from 'react';

/**
 * Custom High-Quality SVG Icons for Crypto Networks & Payment Methods
 * STRICT RULE: NO EMOJIS! Only crisp vector SVG graphics.
 */

// TRON (TRC-20) Vector Icon
export function Trc20Icon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#EF0027" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="15" stroke="#EF0027" strokeWidth="1.5" />
      <path
        d="M24 8.5L8 14.5L18.5 24L24 8.5Z"
        fill="#EF0027"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M14.5 16.5L18.5 24L24 8.5L14.5 16.5Z" fill="#FF5252" />
    </svg>
  );
}

// TON (The Open Network) Vector Icon
export function TonIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#0098EA" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="15" stroke="#0098EA" strokeWidth="1.5" />
      <path
        d="M16 6.5L24 12V20L16 25.5L8 20V12L16 6.5Z"
        stroke="#0098EA"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M16 6.5V25.5" stroke="#0098EA" strokeWidth="1.2" strokeDasharray="2 2" />
      <path d="M8 12L16 16.5L24 12" stroke="#0098EA" strokeWidth="1.2" />
    </svg>
  );
}

// BNB Smart Chain (BEP-20) Vector Icon
export function Bep20Icon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#F3BA2F" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="15" stroke="#F3BA2F" strokeWidth="1.5" />
      <path
        d="M16 7.5L20.5 12L16 16.5L11.5 12L16 7.5ZM24.5 16L20 20.5L24.5 25L29 20.5L24.5 16ZM7.5 16L3 20.5L7.5 25L12 20.5L7.5 16ZM16 20.5L20.5 25L16 29.5L11.5 25L16 20.5Z"
        fill="#F3BA2F"
      />
    </svg>
  );
}

// Tether USDT Vector Icon
export function UsdtIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#26A17B" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="15" stroke="#26A17B" strokeWidth="1.5" />
      <path
        d="M17.8 17.5V17.49C17.65 17.5 17.15 17.55 16 17.55C14.89 17.55 14.39 17.5 14.2 17.49V17.5C11.5 17.38 9.5 16.8 9.5 16.1C9.5 15.4 11.5 14.82 14.2 14.7V12.5H9V9.5H23V12.5H17.8V14.7C20.5 14.82 22.5 15.4 22.5 16.1C22.5 16.8 20.5 17.38 17.8 17.5ZM17.8 18.25C20.35 18.12 22.25 17.65 22.5 17.07V21.5H17.8V18.25ZM14.2 18.25V21.5H9.5V17.07C9.75 17.65 11.65 18.12 14.2 18.25Z"
        fill="#26A17B"
      />
    </svg>
  );
}

// CryptoBot Vector Icon
export function CryptoBotIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#0088CC" fillOpacity="0.15" />
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="#0088CC" strokeWidth="1.5" />
      <path
        d="M22.5 10L7.5 15.8L12.5 18.2L14.5 24L17.5 20L22.5 23.5L24.5 10.5L22.5 10Z"
        stroke="#0088CC"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Direct Crypto Wallet Vector Icon
export function DirectCryptoIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#8A2BE2" fillOpacity="0.15" />
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="#8A2BE2" strokeWidth="1.5" />
      <path
        d="M21 11H11C9.89543 11 9 11.8954 9 13V21C9 22.1046 9.89543 23 11 23H21C22.1046 23 23 22.1046 23 21V13C23 11.8954 22.1046 11 21 11Z"
        stroke="#A855F7"
        strokeWidth="1.5"
      />
      <circle cx="18.5" cy="17" r="1.5" fill="#A855F7" />
    </svg>
  );
}

// Bank / Card Vector Icon
export function BankCardIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#3B82F6" fillOpacity="0.15" />
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="#3B82F6" strokeWidth="1.5" />
      <rect x="7" y="11" width="18" height="12" rx="2" stroke="#60A5FA" strokeWidth="1.5" />
      <path d="M7 15H25" stroke="#60A5FA" strokeWidth="1.5" />
    </svg>
  );
}
