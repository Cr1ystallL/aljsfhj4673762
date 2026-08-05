'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Users, Radio, Wallet, ShieldAlert, Sparkles } from 'lucide-react';

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
}

interface WorldGeoMapProps {
  serverGeoStats?: CountryGeoData[];
}

interface SvgPathInfo {
  id: string;
  title: string;
  d: string;
}

// ISO to Flag & Name mapping dictionary
const ISO_META: Record<string, { name: string; flag: string }> = {
  PL: { name: 'Польша', flag: '🇵🇱' },
  DE: { name: 'Германия', flag: '🇩🇪' },
  GB: { name: 'Великобритания', flag: '🇬🇧' },
  UA: { name: 'Украина', flag: '🇺🇦' },
  NL: { name: 'Нидерланды', flag: '🇳🇱' },
  ES: { name: 'Испания', flag: '🇪🇸' },
  FR: { name: 'Франция', flag: '🇫🇷' },
  US: { name: 'США', flag: '🇺🇸' },
  KZ: { name: 'Казахстан', flag: '🇰🇿' },
  RU: { name: 'Россия', flag: '🇷🇺' },
  IT: { name: 'Италия', flag: '🇮🇹' },
  CA: { name: 'Канада', flag: '🇨🇦' },
  BR: { name: 'Бразилия', flag: '🇧🇷' },
  TR: { name: 'Турция', flag: '🇹🇷' },
  AT: { name: 'Австрия', flag: '🇦🇹' },
  CH: { name: 'Швейцария', flag: '🇨🇭' },
  CZ: { name: 'Чехия', flag: '🇨🇿' },
  SE: { name: 'Швеция', flag: '🇸🇪' },
  NO: { name: 'Норвегия', flag: '🇳🇴' },
  FI: { name: 'Финляндия', flag: '🇫🇮' },
};

const DEFAULT_GEO_DATA: CountryGeoData[] = [
  { id: 'PL', name: 'Польша', flag: '🇵🇱', users: 1420, online: 38, deposits: 184500, wagered: 1250900, vpnPercent: 3.2, share: 62.4 },
  { id: 'DE', name: 'Германия', flag: '🇩🇪', users: 310, online: 9, deposits: 49200, wagered: 318000, vpnPercent: 5.4, share: 13.6 },
  { id: 'GB', name: 'Великобритания', flag: '🇬🇧', users: 185, online: 5, deposits: 31500, wagered: 210000, vpnPercent: 8.1, share: 8.1 },
  { id: 'UA', name: 'Украина', flag: '🇺🇦', users: 145, online: 4, deposits: 19800, wagered: 142000, vpnPercent: 2.1, share: 6.3 },
  { id: 'NL', name: 'Нидерланды', flag: '🇳🇱', users: 92, online: 3, deposits: 14200, wagered: 95000, vpnPercent: 6.8, share: 4.0 },
  { id: 'ES', name: 'Испания', flag: '🇪🇸', users: 64, online: 2, deposits: 8900, wagered: 61000, vpnPercent: 4.5, share: 2.8 },
  { id: 'FR', name: 'Франция', flag: '🇫🇷', users: 45, online: 1, deposits: 6400, wagered: 44000, vpnPercent: 3.9, share: 2.0 },
  { id: 'US', name: 'США', flag: '🇺🇸', users: 28, online: 1, deposits: 4100, wagered: 29000, vpnPercent: 12.5, share: 1.2 },
];

export function WorldGeoMap({ serverGeoStats }: WorldGeoMapProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'online' | 'deposits'>('users');
  const [svgPaths, setSvgPaths] = useState<SvgPathInfo[]>([]);
  const [loadingSvg, setLoadingSvg] = useState<boolean>(true);
  const [geoList, setGeoList] = useState<CountryGeoData[]>(DEFAULT_GEO_DATA);
  const [selectedCountry, setSelectedCountry] = useState<CountryGeoData | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<CountryGeoData | null>(null);

  // Load world.svg from public folder
  useEffect(() => {
    async function loadWorldSvg() {
      try {
        const res = await fetch('/world.svg');
        if (!res.ok) throw new Error('Failed to load world.svg');
        const text = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const paths = Array.from(doc.querySelectorAll('path'));

        const extracted: SvgPathInfo[] = paths
          .map((p) => ({
            id: (p.getAttribute('id') || '').toUpperCase(),
            title: p.getAttribute('title') || p.getAttribute('id') || '',
            d: p.getAttribute('d') || '',
          }))
          .filter((p) => p.d.length > 0);

        setSvgPaths(extracted);
      } catch (err) {
        console.error('Error parsing world.svg:', err);
      } finally {
        setLoadingSvg(false);
      }
    }
    void loadWorldSvg();
  }, []);

  useEffect(() => {
    if (serverGeoStats && serverGeoStats.length > 0) {
      setGeoList(serverGeoStats);
      setSelectedCountry(serverGeoStats[0]);
    } else {
      setSelectedCountry(DEFAULT_GEO_DATA[0]);
    }
  }, [serverGeoStats]);

  // Quick lookup map for country data by ID
  const geoMap = useMemo(() => {
    const map = new Map<string, CountryGeoData>();
    for (const c of geoList) {
      map.set(c.id.toUpperCase(), c);
    }
    return map;
  }, [geoList]);

  // Compute max values for heatmap shading
  const maxMetricValue = useMemo(() => {
    if (geoList.length === 0) return 1;
    return Math.max(
      ...geoList.map((c) => (activeTab === 'online' ? c.online : activeTab === 'deposits' ? c.deposits : c.users))
    );
  }, [geoList, activeTab]);

  const displayCountry = hoveredCountry || selectedCountry || geoList[0];

  const formatPln = (val: number) => val.toLocaleString('ru-RU');

  // Heatmap Color Fill Resolver
  const getCountryFill = (id: string, isHovered: boolean, isSelected: boolean) => {
    if (isHovered || isSelected) {
      return '#FFAC2E'; // Bright Gold Highlight
    }
    const data = geoMap.get(id);
    if (!data) {
      return 'rgba(255, 255, 255, 0.035)'; // Inactive country
    }

    const val = activeTab === 'online' ? data.online : activeTab === 'deposits' ? data.deposits : data.users;
    const ratio = Math.max(0.15, Math.min(1.0, val / maxMetricValue));

    // Gradient shading: Light amber/gold for low activity -> Deep vibrant gold/orange for high activity
    return `rgba(245, 158, 11, ${0.15 + ratio * 0.7})`;
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
              <span>Карта активности клиентов (Choropleth Heatmap)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live SVG Map
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

      {/* Main Heatmap Container */}
      <div className="relative p-4 md:p-6 flex flex-col justify-between overflow-hidden">
        {/* SVG World Map Canvas */}
        <div className="relative w-full aspect-[1009/665] min-h-[340px] max-h-[500px] border border-white/10 rounded-2xl bg-black/70 p-2 overflow-hidden flex items-center justify-center shadow-inner">
          {loadingSvg ? (
            <div className="flex items-center justify-center py-20 text-whisper-gray text-xs font-mono">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-2.5" />
              Загрузка карты мира...
            </div>
          ) : (
            <svg
              viewBox="0 0 1009.67 665.96"
              className="w-full h-full text-white/20 select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              <g stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round">
                {svgPaths.map((path) => {
                  const countryData = geoMap.get(path.id);
                  const isHovered = hoveredCountry?.id === path.id;
                  const isSelected = selectedCountry?.id === path.id;
                  const fill = getCountryFill(path.id, isHovered, isSelected);

                  return (
                    <path
                      key={path.id}
                      d={path.d}
                      fill={fill}
                      stroke={isHovered || isSelected ? '#FFAC2E' : countryData ? 'rgba(255, 172, 46, 0.4)' : 'rgba(255, 255, 255, 0.1)'}
                      strokeWidth={isHovered || isSelected ? 1.5 : 0.5}
                      className="cursor-pointer transition-all duration-200"
                      onClick={() => {
                        if (countryData) setSelectedCountry(countryData);
                        else {
                          const meta = ISO_META[path.id] || { name: path.title || path.id, flag: '🌐' };
                          setSelectedCountry({
                            id: path.id,
                            name: meta.name,
                            flag: meta.flag,
                            users: 0,
                            online: 0,
                            deposits: 0,
                            wagered: 0,
                            vpnPercent: 0,
                            share: 0,
                          });
                        }
                      }}
                      onMouseEnter={() => {
                        if (countryData) setHoveredCountry(countryData);
                        else {
                          const meta = ISO_META[path.id] || { name: path.title || path.id, flag: '🌐' };
                          setHoveredCountry({
                            id: path.id,
                            name: meta.name,
                            flag: meta.flag,
                            users: 0,
                            online: 0,
                            deposits: 0,
                            wagered: 0,
                            vpnPercent: 0,
                            share: 0,
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredCountry(null)}
                    >
                      <title>{path.title || path.id}</title>
                    </path>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Floating Detail Card */}
          <AnimatePresence mode="wait">
            {displayCountry && (
              <motion.div
                key={displayCountry.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.95 }}
                className="absolute top-4 right-4 max-w-[280px] w-full p-4 rounded-2xl border border-white/20 bg-black/85 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.85)] z-20 pointer-events-auto"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">{displayCountry.flag}</span>
                    <div>
                      <span className="font-roobert text-[14px] font-bold text-white block">
                        {displayCountry.name}
                      </span>
                      <span className="text-[10px] text-whisper-gray font-mono">
                        ISO: {displayCountry.id}
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
