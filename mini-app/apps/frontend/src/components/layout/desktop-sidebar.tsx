'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Layers,
  Sparkles,
  Trophy,
  Wallet,
  Zap,
  Gift,
  Gamepad2,
  Flame,
  CircleDot,
  Crown,
} from 'lucide-react';
import { useT } from '@/i18n/use-t';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  activePattern?: RegExp;
}

export function DesktopSidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { t } = useT();

  const navItems: NavItem[] = [
    {
      id: 'home',
      label: 'Главная',
      href: '/',
      icon: <Home className="w-4 h-4 text-amber-400" />,
      activePattern: /^\/$/,
    },
    {
      id: 'slots',
      label: 'Слоты',
      href: '/?category=slots',
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: 'live',
      label: 'Live Казино',
      href: '/?category=live',
      icon: <Flame className="w-4 h-4 text-orange-400" />,
    },
    {
      id: 'table',
      label: 'Настольные',
      href: '/?category=table',
      icon: <Gamepad2 className="w-4 h-4" />,
    },
    {
      id: 'instant',
      label: 'Лайв игры',
      href: '/?category=fast',
      icon: <Zap className="w-4 h-4 text-amber-500" />,
    },
    {
      id: 'sport',
      label: 'Спорт',
      href: '/sport',
      icon: <CircleDot className="w-4 h-4" />,
      activePattern: /^\/sport/,
    },
    {
      id: 'cybersport',
      label: 'Киберспорт',
      href: '/sport?tab=esports',
      icon: <Trophy className="w-4 h-4" />,
    },
    {
      id: 'promo',
      label: 'Промо',
      href: '/bonuses',
      icon: <Gift className="w-4 h-4 text-pink-400" />,
      activePattern: /^\/bonuses/,
    },
    {
      id: 'vip',
      label: 'VIP',
      href: '/profile',
      icon: <Crown className="w-4 h-4 text-amber-400" />,
      activePattern: /^\/profile/,
    },
    {
      id: 'bonuses',
      label: 'Бонусы',
      href: '/bonuses',
      icon: <Wallet className="w-4 h-4 text-amber-300" />,
    },
  ];

  return (
    <aside className="hidden lg:flex w-64 bg-[#0a0a0e] border-r border-amber-500/15 flex-col justify-between p-4 flex-shrink-0 sticky top-0 h-screen z-40 overflow-y-auto">
      <div>
        {/* Brand Logo & Header */}
        <div 
          onClick={() => router.push('/')}
          className="flex items-center gap-3 px-2 py-3 mb-4 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Crown className="w-5 h-5 text-black" fill="currentColor" />
          </div>
          <div>
            <div className="font-brand font-black text-lg tracking-widest gold-text-gradient">
              MACVJET
            </div>
            <div className="text-[9px] uppercase tracking-[0.25em] text-amber-200/40">
              Официальный клуб
            </div>
          </div>
        </div>

        {/* Navigation Rail */}
        <nav className="space-y-1 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = item.activePattern
              ? item.activePattern.test(pathname)
              : pathname === item.href;

            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-left ${
                  isActive
                    ? 'gold-card-active text-amber-300 font-semibold shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {item.icon}
                <span className="text-[13px]">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom VIP Widget & Brand Slogan */}
      <div className="space-y-4 pt-4">
        {/* VIP Widget Card */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-b from-amber-500/15 to-transparent border border-amber-500/30 text-center relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="w-7 h-7 mx-auto mb-1.5 text-amber-400">
            <Crown className="w-6 h-6 mx-auto" fill="currentColor" />
          </div>
          <div className="font-bold text-xs gold-text-gradient font-brand">VIP КЛУБ</div>
          <div className="text-[10px] text-zinc-400 my-1 leading-tight">
            Эксклюзивные привилегии для избранных игроков
          </div>
          <button
            onClick={() => router.push('/profile')}
            className="w-full mt-2 py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-amber-400/20 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
          >
            Узнать больше
          </button>
        </div>

        {/* Slogan */}
        <div className="text-center pt-2 border-t border-amber-500/10">
          <div className="font-brand font-bold text-xs tracking-widest gold-text-gradient">
            MACVJET
          </div>
          <div className="text-[8px] tracking-[0.2em] text-zinc-500 uppercase mt-0.5">
            ИГРАЙ • ВЫИГРЫВАЙ • ЖИВИ
          </div>
        </div>
      </div>
    </aside>
  );
}
