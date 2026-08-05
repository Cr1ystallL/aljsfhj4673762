'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Users, Radio, Wallet, ShieldAlert, Sparkles, Navigation } from 'lucide-react';

interface CountryData {
  id: string;
  name: string;
  flag: string;
  users: number;
  online: number;
  deposits: number;
  wagered: number;
  vpnPercent: number;
  share: number;
  cx: number; // SVG X coordinate %
  cy: number; // SVG Y coordinate %
}

const COUNTRIES_DATA: CountryData[] = [
  {
    id: 'PL',
    name: 'Польша',
    flag: '🇵🇱',
    users: 1420,
    online: 38,
    deposits: 184500,
    wagered: 1250900,
    vpnPercent: 3.2,
    share: 62.4,
    cx: 54,
    cy: 32,
  },
  {
    id: 'DE',
    name: 'Германия',
    flag: '🇩🇪',
    users: 310,
    online: 9,
    deposits: 49200,
    wagered: 318000,
    vpnPercent: 5.4,
    share: 13.6,
    cx: 50,
    cy: 33,
  },
  {
    id: 'UK',
    name: 'Великобритания',
    flag: '🇬🇧',
    users: 185,
    online: 5,
    deposits: 31500,
    wagered: 210000,
    vpnPercent: 8.1,
    share: 8.1,
    cx: 45,
    cy: 30,
  },
  {
    id: 'UA',
    name: 'Украина',
    flag: '🇺🇦',
    users: 145,
    online: 4,
    deposits: 19800,
    wagered: 142000,
    vpnPercent: 2.1,
    share: 6.3,
    cx: 59,
    cy: 35,
  },
  {
    id: 'NL',
    name: 'Нидерланды',
    flag: '🇳🇱',
    users: 92,
    online: 3,
    deposits: 14200,
    wagered: 95000,
    vpnPercent: 6.8,
    share: 4.0,
    cx: 48,
    cy: 31,
  },
  {
    id: 'ES',
    name: 'Испания',
    flag: '🇪🇸',
    users: 64,
    online: 2,
    deposits: 8900,
    wagered: 61000,
    vpnPercent: 4.5,
    share: 2.8,
    cx: 44,
    cy: 42,
  },
  {
    id: 'FR',
    name: 'Франция',
    flag: '🇫🇷',
    users: 45,
    online: 1,
    deposits: 6400,
    wagered: 44000,
    vpnPercent: 3.9,
    share: 2.0,
    cx: 47,
    cy: 37,
  },
  {
    id: 'US',
    name: 'США',
    flag: '🇺🇸',
    users: 28,
    online: 1,
    deposits: 4100,
    wagered: 29000,
    vpnPercent: 12.5,
    share: 1.2,
    cx: 22,
    cy: 38,
  },
];

export function WorldGeoMap() {
  const [activeTab, setActiveTab] = useState<'users' | 'online' | 'deposits'>('users');
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(COUNTRIES_DATA[0]);
  const [hoveredCountry, setHoveredCountry] = useState<CountryData | null>(null);

  const displayCountry = hoveredCountry || selectedCountry || COUNTRIES_DATA[0];

  const formatPln = (val: number) => {
    return val.toLocaleString('ru-RU');
  };

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-pill border border-amber-400/20 bg-amber-400/10 flex items-center justify-center text-amber-400">
            <Globe size={16} strokeWidth={1.8} />
          </span>
          <div>
            <div className="font-roobert text-[11px] uppercase tracking-[0.06em] text-whisper-gray">
              География игроков
            </div>
            <div className="font-roobert text-[14px] font-medium text-frost-white flex items-center gap-2">
              <span>Интерактивная карта визитов</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Geo
              </span>
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center p-1 rounded-full bg-white/[0.04] border border-white/10">
          {(
            [
              { id: 'users', label: 'Игроки', icon: Users },
              { id: 'online', label: 'Онлайн', icon: Radio },
              { id: 'deposits', label: 'Депозиты', icon: Wallet },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-semibold'
                    : 'text-whisper-gray hover:text-white'
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Map Container */}
      <div className="relative p-4 md:p-6 min-h-[380px] flex flex-col justify-between overflow-hidden">
        {/* Subtle Map Background Pattern */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* Vector SVG World Map Canvas */}
        <div className="relative w-full aspect-[2/1] max-h-[340px] border border-white/5 rounded-2xl bg-black/40 p-4 overflow-hidden flex items-center justify-center">
          <svg
            viewBox="0 0 100 50"
            className="w-full h-full text-white/10 drop-shadow-md select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* World Continents Rough Vector outlines */}
            {/* North America */}
            <path
              d="M 12 10 Q 25 8 32 18 Q 28 28 18 32 Q 10 24 12 10 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />
            {/* South America */}
            <path
              d="M 28 33 Q 35 34 32 45 Q 26 48 24 40 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />
            {/* Europe */}
            <path
              d="M 43 12 Q 58 10 59 22 Q 48 25 43 18 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />
            {/* Africa */}
            <path
              d="M 45 23 Q 57 24 54 39 Q 47 43 44 32 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />
            {/* Asia */}
            <path
              d="M 59 10 Q 85 8 88 24 Q 72 32 58 23 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />
            {/* Australia */}
            <path
              d="M 78 35 Q 88 34 86 44 Q 77 45 78 35 Z"
              fill="currentColor"
              className="hover:text-white/20 transition-colors"
            />

            {/* Connecting lines from active country */}
            {displayCountry && (
              <line
                x1={displayCountry.cx}
                y1={displayCountry.cy}
                x2={displayCountry.cx}
                y2={displayCountry.cy - 6}
                stroke="#FFAC2E"
                strokeWidth="0.3"
                strokeDasharray="0.6 0.6"
                className="animate-pulse"
              />
            )}

            {/* Interactive Pins on Map */}
            {COUNTRIES_DATA.map((c) => {
              const isSelected = displayCountry?.id === c.id;
              const sizeMultiplier = Math.max(1, (c.share / 100) * 4);

              return (
                <g key={c.id} className="cursor-pointer" onClick={() => setSelectedCountry(c)}>
                  {/* Outer pulse */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={sizeMultiplier + 1.2}
                    className={`transition-all ${
                      isSelected
                        ? 'fill-amber-400/30 stroke-amber-400 animate-ping'
                        : 'fill-amber-400/10'
                    }`}
                  />
                  {/* Main Pin Dot */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={sizeMultiplier}
                    fill={isSelected ? '#FFAC2E' : '#38BDF8'}
                    className="transition-all hover:scale-150"
                    onMouseEnter={() => setHoveredCountry(c)}
                    onMouseLeave={() => setHoveredCountry(null)}
                  />
                </g>
              );
            })}
          </svg>

          {/* Interactive Floating Hover / Selected Card */}
          <AnimatePresence mode="wait">
            {displayCountry && (
              <motion.div
                key={displayCountry.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-4 right-4 max-w-[260px] w-full p-3.5 rounded-xl border border-white/15 bg-black/80 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-20 pointer-events-auto"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{displayCountry.flag}</span>
                    <span className="font-roobert text-[13px] font-semibold text-white">
                      {displayCountry.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/15 text-amber-400 font-bold">
                    {displayCountry.share}%
                  </span>
                </div>

                <div className="space-y-2 text-[11px] font-roobert">
                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Users size={12} className="text-amber-400" /> Игроки:
                    </span>
                    <span className="font-semibold text-white">
                      {displayCountry.users.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Radio size={12} className="text-emerald-400 animate-pulse" /> Онлайн сейчас:
                    </span>
                    <span className="font-semibold text-emerald-400">
                      {displayCountry.online} чел.
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Wallet size={12} className="text-cyan-400" /> Депозиты:
                    </span>
                    <span className="font-semibold text-white">
                      {formatPln(displayCountry.deposits)} zł
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-purple-400" /> Оборот ставок:
                    </span>
                    <span className="font-semibold text-white">
                      {formatPln(displayCountry.wagered)} zł
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[10px] text-whisper-gray">
                    <span className="flex items-center gap-1 text-slate-400">
                      <ShieldAlert size={10} /> VPN трафик:
                    </span>
                    <span className="font-mono text-amber-300 font-medium">
                      {displayCountry.vpnPercent}%
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Top Countries Bar List */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {COUNTRIES_DATA.slice(0, 4).map((country) => {
            const isSelected = displayCountry?.id === country.id;
            return (
              <button
                key={country.id}
                onClick={() => setSelectedCountry(country)}
                onMouseEnter={() => setHoveredCountry(country)}
                onMouseLeave={() => setHoveredCountry(null)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-amber-400/50 bg-amber-400/10 shadow-[0_0_15px_rgba(255,172,46,0.15)]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="flex items-center gap-1.5 text-white font-medium truncate">
                    <span>{country.flag}</span>
                    <span>{country.name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-amber-400 font-semibold">
                    {country.share}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-200 rounded-full transition-all duration-500"
                    style={{ width: `${country.share}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[9.5px] text-whisper-gray">
                  <span>{country.users} игрок.</span>
                  <span className="text-emerald-400 font-medium">{country.online} онл.</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
