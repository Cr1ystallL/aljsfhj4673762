import React from 'react';

/**
 * Embedded Vector SVG Icons for Crypto Networks & Payment Methods
 * Guaranteed to render instantly 100% of the time inside Telegram WebApp without external image loading issues.
 */

export function Trc20Icon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7L12 22L22 7L12 2Z" fill="#EF0027" fillOpacity="0.2" stroke="#EF0027" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#EF0027" stroke="#EF0027" strokeWidth="1.2" />
    </svg>
  );
}

export function TonIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" fill="#0098EA" fillOpacity="0.2" stroke="#0098EA" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2V22M4 7L12 12L20 7" stroke="#0098EA" strokeWidth="1.2" />
    </svg>
  );
}

export function Bep20Icon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4L16 8L12 12L8 8L12 4ZM19 11L23 15L19 19L15 15L19 11ZM5 11L9 15L5 19L1 15L5 11ZM12 15L16 19L12 23L8 19L12 15Z" fill="#F3BA2F" />
    </svg>
  );
}

export function UsdtIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#26A17B" fillOpacity="0.25" stroke="#26A17B" strokeWidth="1.5" />
      <path d="M13.5 13.5V13.49C13.4 13.5 13 13.55 12 13.55C11 13.55 10.6 13.5 10.5 13.49V13.5C8.5 13.4 7 12.9 7 12.3C7 11.7 8.5 11.2 10.5 11.1V9.5H7V7.5H17V9.5H13.5V11.1C15.5 11.2 17 11.7 17 12.3C17 12.9 15.5 13.4 13.5 13.5Z" fill="#26A17B" />
    </svg>
  );
}

export function CryptoBotIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.23 15.51 16.01C15.37 16.76 15.09 17.01 14.83 17.04C14.25 17.09 13.81 16.66 13.25 16.29C12.37 15.71 11.87 15.35 11.02 14.79C10.04 14.14 10.68 13.78 11.23 13.21C11.38 13.06 13.89 10.77 13.94 10.56C13.95 10.53 13.95 10.43 13.89 10.38C13.83 10.33 13.74 10.35 13.67 10.36C13.57 10.38 12.01 11.42 8.97 13.47C8.53 13.77 8.13 13.92 7.77 13.91C7.37 13.9 6.6 13.68 6.03 13.49C5.33 13.26 4.77 13.14 4.82 12.75C4.85 12.55 5.13 12.34 5.66 12.13C8.91 10.71 11.08 9.77 12.17 9.32C15.3 8.02 15.95 7.79 16.37 7.79C16.46 7.79 16.67 7.81 16.8 7.92C16.91 8.01 16.94 8.14 16.95 8.24C16.94 8.31 16.95 8.57 16.64 8.8Z"
        fill="#0088CC"
      />
    </svg>
  );
}

export function DirectCryptoIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#26A17B" fillOpacity="0.2" stroke="#26A17B" strokeWidth="1.5" />
      <path d="M13.5 13.5V13.49C13.4 13.5 13 13.55 12 13.55C11 13.55 10.6 13.5 10.5 13.49V13.5C8.5 13.4 7 12.9 7 12.3C7 11.7 8.5 11.2 10.5 11.1V9.5H7V7.5H17V9.5H13.5V11.1C15.5 11.2 17 11.7 17 12.3C17 12.9 15.5 13.4 13.5 13.5Z" fill="#26A17B" />
    </svg>
  );
}

export function BankCardIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}
