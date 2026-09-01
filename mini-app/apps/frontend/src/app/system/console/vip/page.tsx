'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Percent,
  Save,
  Sparkles,
  Gift,
  Calendar,
  Zap,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { toast } from '@/store/toast-store';
import { VIP_RANKS, type VipTierConfig } from '@/lib/vip';
import { VipBadge } from '@/components/vip/vip-badge';

export default function AdminVipPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [xpPerZl, setXpPerZl] = useState<number>(10);
  const [cashbackStartDate, setCashbackStartDate] = useState<string>('2026-09-07T00:00:00.000Z');
  const [tiers, setTiers] = useState<VipTierConfig[]>([...VIP_RANKS]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vip/admin/config', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (data.ok && data.config) {
        if (data.config.xpPerZl) setXpPerZl(data.config.xpPerZl);
        if (data.config.cashbackStartDate) setCashbackStartDate(data.config.cashbackStartDate);
        if (Array.isArray(data.config.tiers)) setTiers(data.config.tiers);
      }
    } catch {
      // default
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/vip/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          xpPerZl,
          cashbackStartDate,
          tiers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Ошибка при сохранении настроек');
        return;
      }
      toast.success('Настройки VIP и Кэшбэка успешно сохранены!');
    } catch {
      toast.error('Сетевая ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (idx: number, patch: Partial<VipTierConfig>) => {
    setTiers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const [recalculating, setRecalculating] = useState(false);

  const handleResetAndRecalc = async () => {
    if (!confirm('Вы уверены? Это сбросит преждевременные клеймы кэшбэка и точно пересчитает XP и ранги всех игроков по их реальным ставкам.')) {
      return;
    }
    setRecalculating(true);
    try {
      const res = await fetch('/api/vip/admin/reset-and-recalc', {
        method: 'POST',
        credentials: 'include',
      });
      const j = await res.json();
      if (res.ok) {
        alert(j.message || 'Пересчет успешно выполнен!');
      } else {
        alert(j.error || 'Ошибка пересчета');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto flex flex-col gap-6 text-frost-white font-roobert">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Crown className="text-amber-400" size={26} />
            <span>Управление VIP Рангами и Кэшбэком</span>
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Настройка порогов XP, наград за уровни, процентов еженедельного кэшбэка и даты старта.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleResetAndRecalc}
            disabled={loading || saving || recalculating}
            className="px-3.5 py-2.5 rounded-xl border border-red-500/40 bg-red-950/20 hover:bg-red-900/30 text-red-300 font-bold text-xs transition-colors disabled:opacity-50"
          >
            {recalculating ? 'Пересчет...' : '🔄 Сброс кэшбэка & пересчет XP'}
          </button>
          <button
            type="button"
            onClick={loadConfig}
            disabled={loading || saving}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 text-black font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
          >
            <Save size={16} />
            <span>{saving ? 'Сохранение...' : 'Сохранить изменения'}</span>
          </button>
        </div>
      </div>

      {/* Global settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border border-white/10 bg-[#121418] flex flex-col gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
            <Zap size={14} className="text-amber-400" />
            <span>XP за 1 zł ставки</span>
          </label>
          <input
            type="number"
            min={1}
            value={xpPerZl}
            onChange={(e) => setXpPerZl(Math.max(1, Number(e.target.value) || 10))}
            className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white font-bold text-sm focus:border-amber-400 outline-none"
          />
          <span className="text-[11px] text-white/40">
            Игрок получает указанное количество XP за каждый 1 zł реальной ставки.
          </span>
        </div>

        <div className="p-5 rounded-2xl border border-white/10 bg-[#121418] flex flex-col gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
            <Calendar size={14} className="text-emerald-400" />
            <span>Дата старта еженедельного кэшбэка</span>
          </label>
          <input
            type="text"
            value={cashbackStartDate}
            onChange={(e) => setCashbackStartDate(e.target.value)}
            placeholder="2026-09-07T00:00:00.000Z"
            className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:border-emerald-400 outline-none"
          />
          <span className="text-[11px] text-white/40">
            ISO дата запуска (по умолчанию: 7 сентября 2026, 00:00 UTC). До этой даты кнопка клейма заблокирована.
          </span>
        </div>
      </div>

      {/* VIP Tiers Editor */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles size={18} className="text-amber-400" />
          <span>Сетка VIP Рангов (6 уровней)</span>
        </h2>

        <div className="flex flex-col gap-3">
          {tiers.map((tier, idx) => (
            <div
              key={tier.id}
              className="p-4 rounded-2xl border border-white/10 bg-[#121418] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              {/* Left Badge & Name */}
              <div className="flex items-center gap-3.5 min-w-[200px]">
                <VipBadge rankId={tier.id} size="md" />
                <div>
                  <input
                    type="text"
                    value={tier.nameRu}
                    onChange={(e) => updateTier(idx, { nameRu: e.target.value })}
                    className="font-bold text-sm bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white"
                  />
                  <div className="text-[11px] text-white/50 mt-1">Level {tier.level} ({tier.id})</div>
                </div>
              </div>

              {/* Grid of editable params */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">Мин. XP</label>
                  <input
                    type="number"
                    value={tier.minXp}
                    onChange={(e) => updateTier(idx, { minXp: Number(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">Оборот (zł)</label>
                  <input
                    type="number"
                    value={tier.wagerZl}
                    onChange={(e) => updateTier(idx, { wagerZl: Number(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-emerald-400/80 block mb-1">Кэшбэк %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.cashbackPercent}
                    onChange={(e) => updateTier(idx, { cashbackPercent: Number(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-emerald-500/30 text-emerald-400 font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-amber-300/80 block mb-1">Награда</label>
                  <input
                    type="text"
                    value={tier.rewardDescription}
                    onChange={(e) => updateTier(idx, { rewardDescription: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-white text-xs truncate"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
