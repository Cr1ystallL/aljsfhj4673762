'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Users, Radio, Wallet, ShieldAlert, Sparkles, Navigation } from 'lucide-react';

export interface CountryGeoData {
  id: string;
  name: string;
  flag: string;
  users: number;
  online: number;
  deposits: number;
  wagered: number;
  vpnPercent: number;
  share: number;
  cx: number; // SVG X coord (0..1000)
  cy: number; // SVG Y coord (0..500)
}

interface WorldGeoMapProps {
  serverGeoStats?: CountryGeoData[];
  totalUsersCount?: number;
  totalProfit?: number;
}

// Precise SVG ViewBox 0..1000 x 0..500 pin coordinates
const DEFAULT_GEO_DATA: CountryGeoData[] = [
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
    cx: 535,
    cy: 142,
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
    cx: 500,
    cy: 145,
  },
  {
    id: 'GB',
    name: 'Великобритания',
    flag: '🇬🇧',
    users: 185,
    online: 5,
    deposits: 31500,
    wagered: 210000,
    vpnPercent: 8.1,
    share: 8.1,
    cx: 460,
    cy: 135,
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
    cx: 575,
    cy: 150,
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
    cx: 485,
    cy: 138,
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
    cx: 445,
    cy: 195,
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
    cx: 475,
    cy: 170,
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
    cx: 210,
    cy: 175,
  },
];

export function WorldGeoMap({ serverGeoStats }: WorldGeoMapProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'online' | 'deposits'>('users');
  const [geoList, setGeoList] = useState<CountryGeoData[]>(DEFAULT_GEO_DATA);
  const [selectedCountry, setSelectedCountry] = useState<CountryGeoData | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<CountryGeoData | null>(null);

  useEffect(() => {
    if (serverGeoStats && serverGeoStats.length > 0) {
      setGeoList(serverGeoStats);
      setSelectedCountry(serverGeoStats[0]);
    } else {
      setSelectedCountry(DEFAULT_GEO_DATA[0]);
    }
  }, [serverGeoStats]);

  const displayCountry = hoveredCountry || selectedCountry || geoList[0];

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
              География пользователей
            </div>
            <div className="font-roobert text-[14px] font-medium text-frost-white flex items-center gap-2">
              <span>Интерактивная карта трафика</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live DB Geo
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
      <div className="relative p-4 md:p-6 flex flex-col justify-between overflow-hidden">
        {/* Subtle Map Grid Background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]" />

        {/* Realistic Vector World Map Canvas */}
        <div className="relative w-full aspect-[2.1/1] min-h-[320px] max-h-[440px] border border-white/10 rounded-2xl bg-black/60 p-4 overflow-hidden flex items-center justify-center shadow-inner">
          <svg
            viewBox="0 0 1000 500"
            className="w-full h-full text-white/20 select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
              {/* North America */}
              <path d="M 60 70 L 110 50 L 180 40 L 220 50 L 290 40 L 295 70 L 250 80 L 220 110 L 270 120 L 300 100 L 310 130 L 280 150 L 290 190 L 250 200 L 240 230 L 210 240 L 190 280 L 175 250 L 170 210 L 130 210 L 90 160 L 70 110 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* Greenland */}
              <path d="M 320 20 L 410 15 L 430 45 L 390 85 L 340 70 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* South America */}
              <path d="M 240 250 L 280 255 L 320 270 L 350 310 L 340 370 L 300 440 L 270 470 L 250 430 L 240 360 L 220 300 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* Europe & Scandinavia */}
              <path d="M 440 180 L 460 135 L 480 138 L 500 145 L 535 142 L 575 150 L 590 180 L 550 210 L 510 220 L 475 170 L 445 195 Z" fill="rgba(255,255,255,0.05)" className="hover:fill-white/10 transition-colors" />
              {/* Scandinavia */}
              <path d="M 480 100 L 520 60 L 550 70 L 540 120 L 500 125 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* British Isles */}
              <path d="M 445 120 L 470 115 L 465 145 L 440 140 Z" fill="rgba(255,255,255,0.04)" className="hover:fill-white/10 transition-colors" />
              {/* Africa */}
              <path d="M 440 220 L 540 210 L 590 250 L 600 300 L 560 370 L 520 420 L 480 370 L 450 300 L 420 250 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* Madagascar */}
              <path d="M 610 350 L 630 360 L 620 410 L 605 400 Z" fill="rgba(255,255,255,0.03)" />
              {/* Russia & Asia */}
              <path d="M 580 130 L 650 155 L 700 120 L 800 90 L 920 80 L 960 120 L 900 170 L 850 200 L 780 240 L 710 220 L 650 200 L 600 170 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* Middle East & Arabia */}
              <path d="M 560 210 L 630 215 L 640 260 L 580 290 L 550 240 Z" fill="rgba(255,255,255,0.03)" />
              {/* India */}
              <path d="M 680 210 L 740 220 L 730 300 L 690 280 Z" fill="rgba(255,255,255,0.03)" />
              {/* China & East Asia */}
              <path d="M 740 180 L 850 170 L 880 240 L 800 280 L 740 230 Z" fill="rgba(255,255,255,0.03)" />
              {/* Japan */}
              <path d="M 900 150 L 930 160 L 910 210 L 890 190 Z" fill="rgba(255,255,255,0.04)" />
              {/* Australia */}
              <path d="M 770 340 L 870 330 L 890 400 L 830 440 L 760 410 Z" fill="rgba(255,255,255,0.03)" className="hover:fill-white/10 transition-colors" />
              {/* New Zealand */}
              <path d="M 920 420 L 940 430 L 930 470 Z" fill="rgba(255,255,255,0.03)" />
            </g>

            {/* Latitude / Longitude Subtle Lines */}
            <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <line x1="500" y1="0" x2="500" y2="500" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />

            {/* Connecting laser lines to selected country */}
            {displayCountry && (
              <g>
                <line
                  x1={displayCountry.cx}
                  y1={displayCountry.cy}
                  x2={displayCountry.cx}
                  y2={displayCountry.cy - 30}
                  stroke="#FFAC2E"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  className="animate-pulse"
                />
                <circle cx={displayCountry.cx} cy={displayCountry.cy - 30} r="3" fill="#FFAC2E" />
              </g>
            )}

            {/* Country Markers / Pins */}
            {geoList.map((c) => {
              const isSelected = displayCountry?.id === c.id;
              const radius = Math.max(6, (c.share / 100) * 24);

              return (
                <g
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedCountry(c)}
                  onMouseEnter={() => setHoveredCountry(c)}
                  onMouseLeave={() => setHoveredCountry(null)}
                >
                  {/* Outer Pulsing Aura */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={radius + 8}
                    className={`transition-all duration-300 ${
                      isSelected
                        ? 'fill-amber-400/25 stroke-amber-400 animate-ping'
                        : 'fill-sky-400/10 stroke-sky-400/30'
                    }`}
                    strokeWidth="1"
                  />
                  {/* Outer Halo */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={radius + 3}
                    fill={isSelected ? 'rgba(255,172,46,0.2)' : 'rgba(56,189,248,0.15)'}
                    stroke={isSelected ? '#FFAC2E' : '#38BDF8'}
                    strokeWidth="1"
                  />
                  {/* Core Pin */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={radius}
                    fill={isSelected ? '#FFAC2E' : '#38BDF8'}
                    className="transition-transform duration-200 hover:scale-125"
                  />
                  {/* Text label on map */}
                  <text
                    x={c.cx}
                    y={c.cy + radius + 14}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="11"
                    fontWeight="600"
                    className="pointer-events-none font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  >
                    {c.flag} {c.id} ({c.share}%)
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Floating Stat Details Card */}
          <AnimatePresence mode="wait">
            {displayCountry && (
              <motion.div
                key={displayCountry.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.95 }}
                className="absolute top-4 right-4 max-w-[280px] w-full p-4 rounded-2xl border border-white/20 bg-black/85 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.8)] z-20"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">{displayCountry.flag}</span>
                    <div>
                      <span className="font-roobert text-[14px] font-bold text-white block">
                        {displayCountry.name}
                      </span>
                      <span className="text-[10px] text-whisper-gray font-mono">
                        ISO Code: {displayCountry.id}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-400 font-bold border border-amber-400/30">
                    {displayCountry.share}%
                  </span>
                </div>

                <div className="space-y-2.5 font-roobert text-[12px]">
                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Users size={13} className="text-amber-400" /> Игроки:
                    </span>
                    <span className="font-semibold text-white">
                      {displayCountry.users.toLocaleString('ru-RU')} чел.
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Radio size={13} className="text-emerald-400 animate-pulse" /> Онлайн сейчас:
                    </span>
                    <span className="font-semibold text-emerald-400">
                      {displayCountry.online} чел.
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Wallet size={13} className="text-cyan-400" /> Депозиты:
                    </span>
                    <span className="font-semibold text-white">
                      {formatPln(displayCountry.deposits)} zł
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-whisper-gray">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" /> Оборот ставок:
                    </span>
                    <span className="font-semibold text-white">
                      {formatPln(displayCountry.wagered)} zł
                    </span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[10.5px]">
                    <span className="flex items-center gap-1 text-slate-400">
                      <ShieldAlert size={11} /> VPN / Proxy:
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

        {/* Top Countries Summary Bar */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {geoList.slice(0, 4).map((country) => {
            const isSelected = displayCountry?.id === country.id;
            return (
              <button
                key={country.id}
                onClick={() => setSelectedCountry(country)}
                onMouseEnter={() => setHoveredCountry(country)}
                onMouseLeave={() => setHoveredCountry(null)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-amber-400/60 bg-amber-400/15 shadow-[0_0_20px_rgba(255,172,46,0.2)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="flex items-center gap-1.5 text-white font-semibold truncate">
                    <span className="text-base">{country.flag}</span>
                    <span>{country.name}</span>
                  </span>
                  <span className="font-mono text-[11px] text-amber-400 font-bold">
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
                <div className="mt-1.5 flex justify-between text-[10px] text-whisper-gray font-roobert">
                  <span>{country.users.toLocaleString()} игр.</span>
                  <span className="text-emerald-400 font-semibold">{country.online} онл.</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
