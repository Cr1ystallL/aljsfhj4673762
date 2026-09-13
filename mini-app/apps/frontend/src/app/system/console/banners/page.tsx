'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  X,
  ExternalLink,
  Flame,
  Crown,
  Gift,
  Rocket,
  Sparkles,
  Trophy,
  ArrowRight,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { HelpButton } from '@/components/admin/help-button';
import { cn } from '@/lib/utils';

export interface LobbyBanner {
  id: string;
  badge: {
    label: string;
    icon: string;
    color: string;
    bg: string;
    border: string;
  };
  title: string;
  subtitle: string;
  ctaText: string;
  href: string;
  image: string;
  glowColor: string;
  floorColor: string;
  accentGradient: string;
  enabled: boolean;
  order: number;
}

const AVAILABLE_ICONS = ['Flame', 'Crown', 'Gift', 'Rocket', 'Sparkles', 'Trophy'] as const;

const THEME_PRESETS = [
  {
    name: 'Золото / Огонь',
    color: 'text-amber-300',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/40',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    floorColor: 'rgba(245, 158, 11, 0.45)',
    accentGradient: 'from-amber-300 via-amber-400 to-orange-500',
  },
  {
    name: 'Изумруд / Кэшбэк',
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/40',
    glowColor: 'rgba(16, 185, 129, 0.32)',
    floorColor: 'rgba(16, 185, 129, 0.45)',
    accentGradient: 'from-emerald-300 via-teal-400 to-emerald-500',
  },
  {
    name: 'Неон / Пурпур',
    color: 'text-purple-300',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/40',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    floorColor: 'rgba(168, 85, 247, 0.45)',
    accentGradient: 'from-purple-300 via-fuchsia-400 to-pink-500',
  },
  {
    name: 'Рубин / Краш',
    color: 'text-rose-300',
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/40',
    glowColor: 'rgba(244, 63, 94, 0.35)',
    floorColor: 'rgba(249, 115, 22, 0.45)',
    accentGradient: 'from-rose-400 via-amber-400 to-orange-500',
  },
  {
    name: 'Сапфир / Спорт',
    color: 'text-sky-300',
    bg: 'bg-sky-500/15',
    border: 'border-sky-500/40',
    glowColor: 'rgba(14, 165, 233, 0.35)',
    floorColor: 'rgba(2, 132, 199, 0.45)',
    accentGradient: 'from-sky-300 via-cyan-400 to-blue-500',
  },
];

const PRESET_IMAGES = [
  { label: 'Бонус (+200%)', path: '/banerbonus.png' },
  { label: 'Кэшбэк (VIP)', path: '/banercashback.png' },
  { label: 'Колесо фортуны', path: '/banetlw.png' },
  { label: 'MacvJet (Ракета)', path: '/banermj.png' },
];

function getIconComponent(name: string) {
  switch (name) {
    case 'Crown':
      return Crown;
    case 'Gift':
      return Gift;
    case 'Rocket':
      return Rocket;
    case 'Sparkles':
      return Sparkles;
    case 'Trophy':
      return Trophy;
    case 'Flame':
    default:
      return Flame;
  }
}

export default function BannersPage() {
  const [banners, setBanners] = useState<LobbyBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit / Create modal state
  const [editBanner, setEditBanner] = useState<LobbyBanner | null>(null);
  const [isNew, setIsNew] = useState(false);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/_x/banners', { credentials: 'include' });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.banners)) {
        setBanners(data.banners);
      }
    } catch (e) {
      console.error('Failed to fetch banners', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBanners();
  }, [loadBanners]);

  const handleToggleEnabled = async (banner: LobbyBanner) => {
    const updated = { ...banner, enabled: !banner.enabled };
    try {
      const res = await fetch('/api/_x/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          banner: updated,
          reason: `Toggle banner ${banner.id} to ${updated.enabled ? 'active' : 'inactive'}`,
        }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.banners)) {
        setBanners(data.banners);
      }
    } catch (e: any) {
      alert(e?.message || 'Ошибка обновления');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= banners.length) return;

    const copy = [...banners];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;

    const ids = copy.map((b) => b.id);
    try {
      const res = await fetch('/api/_x/banners/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids, reason: 'Reorder banners' }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.banners)) {
        setBanners(data.banners);
      }
    } catch (e: any) {
      alert(e?.message || 'Ошибка перестановки');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Удалить баннер "${id}"?`)) return;
    try {
      const res = await fetch(`/api/_x/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: `Deleted banner ${id}` }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.banners)) {
        setBanners(data.banners);
      }
    } catch (e: any) {
      alert(e?.message || 'Ошибка удаления');
    }
  };

  const handleOpenNew = () => {
    setIsNew(true);
    setEditBanner({
      id: `banner_${Date.now()}`,
      badge: {
        label: 'Новая акция',
        icon: 'Flame',
        color: THEME_PRESETS[0].color,
        bg: THEME_PRESETS[0].bg,
        border: THEME_PRESETS[0].border,
      },
      title: 'БОНУС ДО 1000 ZŁ',
      subtitle: 'Активируйте эксклюзивный промокод и забирайте приз',
      ctaText: 'Подробнее',
      href: '/bonuses',
      image: '/banerbonus.png',
      glowColor: THEME_PRESETS[0].glowColor,
      floorColor: THEME_PRESETS[0].floorColor,
      accentGradient: THEME_PRESETS[0].accentGradient,
      enabled: true,
      order: banners.length,
    });
  };

  const handleOpenEdit = (b: LobbyBanner) => {
    setIsNew(false);
    setEditBanner(JSON.parse(JSON.stringify(b)));
  };

  const handleSaveModal = async () => {
    if (!editBanner) return;
    if (!editBanner.id.trim() || !editBanner.title.trim()) {
      alert('Укажите ID и заголовок баннера');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/_x/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          banner: editBanner,
          reason: isNew ? `Created banner ${editBanner.id}` : `Updated banner ${editBanner.id}`,
        }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.banners)) {
        setBanners(data.banners);
        setEditBanner(null);
      } else {
        alert(data.error || 'Ошибка сохранения');
      }
    } catch (e: any) {
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: (typeof THEME_PRESETS)[0]) => {
    if (!editBanner) return;
    setEditBanner({
      ...editBanner,
      badge: {
        ...editBanner.badge,
        color: preset.color,
        bg: preset.bg,
        border: preset.border,
      },
      glowColor: preset.glowColor,
      floorColor: preset.floorColor,
      accentGradient: preset.accentGradient,
    });
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-frost-white flex items-center gap-2.5">
            Управление промо-баннерами
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-normal">
              Lobby Hero CMS
            </span>
          </h1>
          <p className="text-sm text-whisper-gray mt-1">
            Конструктор карусели в лобби казино: редактируйте тексты, изображения, цвета и порядок слайдов.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <HelpButton title="Справка: Баннеры лобби">
            <div className="space-y-2 text-xs text-frost-white/80">
              <p>
                <strong>Карусель:</strong> активные баннеры отображаются в верхней части главной страницы казино.
              </p>
              <p>
                <strong>Порядок:</strong> используйте стрелки вверх/вниз для смены очерёдности слайдов.
              </p>
              <p>
                <strong>Изображения:</strong> выберите из встроенных 3D-ассетов платформы или укажите свой URL.
              </p>
            </div>
          </HelpButton>
          <button
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-xs hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
          >
            <Plus size={16} />
            <span>Добавить баннер</span>
          </button>
        </div>
      </div>

      {/* Banner List */}
      {loading ? (
        <div className="py-20 text-center text-whisper-gray flex items-center justify-center gap-2 text-sm">
          <RefreshCw size={18} className="animate-spin text-emerald-400" />
          <span>Загрузка баннеров...</span>
        </div>
      ) : banners.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-white/15 rounded-2xl">
          <ImageIcon size={40} className="mx-auto text-whisper-gray/50 mb-3" />
          <h3 className="text-sm font-semibold text-frost-white">Нет настроенных баннеров</h3>
          <p className="text-xs text-whisper-gray mt-1">Нажмите кнопку выше, чтобы добавить первый слайд</p>
        </div>
      ) : (
        <div className="space-y-4">
          {banners.map((b, idx) => {
            const IconCmp = getIconComponent(b.badge.icon);
            return (
              <div
                key={b.id}
                className={cn(
                  'p-5 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5 backdrop-blur-xl',
                  b.enabled
                    ? 'border-white/15 bg-white/[0.03] shadow-xl'
                    : 'border-white/5 bg-white/[0.01] opacity-60'
                )}
              >
                {/* Left: Reorder & Image preview */}
                <div className="flex items-center gap-4">
                  {/* Up / Down arrows */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-white/10 text-whisper-gray hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === banners.length - 1}
                      className="p-1 rounded hover:bg-white/10 text-whisper-gray hover:text-white disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-black/50 border border-white/10 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.image} alt={b.title} className="w-full h-full object-contain" />
                  </div>

                  {/* Details */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${b.badge.border} ${b.badge.bg} ${b.badge.color}`}
                      >
                        <IconCmp size={10} />
                        <span>{b.badge.label}</span>
                      </span>
                      <h3 className="text-base font-bold text-frost-white">{b.title}</h3>
                    </div>
                    <p className="text-xs text-whisper-gray mt-1 line-clamp-1">{b.subtitle}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-whisper-gray/70">
                      <span>Ссылка: <code className="text-white/80 font-mono">{b.href}</code></span>
                      <span>•</span>
                      <span>Кнопка: <strong className="text-white/80">{b.ctaText}</strong></span>
                      <span>•</span>
                      <span>ID: <code className="text-white/60 font-mono">{b.id}</code></span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleToggleEnabled(b)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer',
                      b.enabled
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-white/5 border-white/10 text-whisper-gray hover:bg-white/10'
                    )}
                  >
                    {b.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    <span>{b.enabled ? 'Активен' : 'Отключен'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(b)}
                    className="p-2 rounded-xl bg-white/[0.05] border border-white/10 text-frost-white hover:bg-white/[0.1] transition-colors cursor-pointer"
                    title="Редактировать"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    onClick={() => handleDelete(b.id)}
                    className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create Modal */}
      {editBanner && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0b0d14] border border-white/20 rounded-3xl p-6 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-frost-white flex items-center gap-2">
                <Sliders size={18} className="text-amber-400" />
                {isNew ? 'Создание баннера' : `Редактирование: ${editBanner.id}`}
              </h3>
              <button
                onClick={() => setEditBanner(null)}
                className="p-1 rounded-lg text-whisper-gray hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Live Mini Preview Box */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/15 bg-[#07080b] p-4 flex items-center justify-between">
              <div
                aria-hidden="true"
                className="absolute right-0 top-0 bottom-0 w-[60%] blur-[40px] opacity-70 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 75% 50%, ${editBanner.glowColor} 0%, transparent 75%)`,
                }}
              />
              <div className="relative z-10 flex-1 pr-4">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${editBanner.badge.border} ${editBanner.badge.bg} ${editBanner.badge.color}`}
                >
                  <span>{editBanner.badge.label}</span>
                </span>
                <h4 className="mt-1 text-base font-black uppercase text-white tracking-tight leading-tight">
                  <span
                    className={`bg-gradient-to-r ${editBanner.accentGradient} bg-clip-text text-transparent`}
                  >
                    {editBanner.title || 'Заголовок'}
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-300 mt-0.5 line-clamp-1">{editBanner.subtitle}</p>
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r ${editBanner.accentGradient} text-black font-bold text-[10px] uppercase shadow`}
                  >
                    <span>{editBanner.ctaText || 'Кнопка'}</span>
                    <ArrowRight size={10} />
                  </span>
                </div>
              </div>
              <div className="relative z-10 w-20 h-20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editBanner.image}
                  alt="preview"
                  className="w-full h-full object-contain filter drop-shadow-lg"
                />
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {isNew && (
                <div className="md:col-span-2">
                  <label className="text-whisper-gray block mb-1">Уникальный ID (slug):</label>
                  <input
                    type="text"
                    value={editBanner.id}
                    onChange={(e) => setEditBanner({ ...editBanner, id: e.target.value })}
                    className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white font-mono outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-whisper-gray block mb-1">Заголовок (Headline):</label>
                <input
                  type="text"
                  value={editBanner.title}
                  onChange={(e) => setEditBanner({ ...editBanner, title: e.target.value })}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-whisper-gray block mb-1">Подзаголовок (Описание):</label>
                <input
                  type="text"
                  value={editBanner.subtitle}
                  onChange={(e) => setEditBanner({ ...editBanner, subtitle: e.target.value })}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-whisper-gray block mb-1">Текст на кнопке (CTA):</label>
                <input
                  type="text"
                  value={editBanner.ctaText}
                  onChange={(e) => setEditBanner({ ...editBanner, ctaText: e.target.value })}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-whisper-gray block mb-1">Ссылка при клике (href):</label>
                <input
                  type="text"
                  value={editBanner.href}
                  onChange={(e) => setEditBanner({ ...editBanner, href: e.target.value })}
                  placeholder="/balance, /bonuses, /game/crash"
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white font-mono outline-none"
                />
              </div>

              {/* Badge label & icon */}
              <div>
                <label className="text-whisper-gray block mb-1">Текст бейджа:</label>
                <input
                  type="text"
                  value={editBanner.badge.label}
                  onChange={(e) =>
                    setEditBanner({
                      ...editBanner,
                      badge: { ...editBanner.badge, label: e.target.value },
                    })
                  }
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-whisper-gray block mb-1">Иконка бейджа:</label>
                <select
                  value={editBanner.badge.icon}
                  onChange={(e) =>
                    setEditBanner({
                      ...editBanner,
                      badge: { ...editBanner.badge, icon: e.target.value },
                    })
                  }
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                >
                  {AVAILABLE_ICONS.map((ic) => (
                    <option key={ic} value={ic} className="bg-zinc-900 text-white">
                      {ic}
                    </option>
                  ))}
                </select>
              </div>

              {/* Artwork selection */}
              <div className="md:col-span-2">
                <label className="text-whisper-gray block mb-1">Изображение (3D Ассет):</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {PRESET_IMAGES.map((img) => (
                    <button
                      key={img.path}
                      type="button"
                      onClick={() => setEditBanner({ ...editBanner, image: img.path })}
                      className={cn(
                        'px-2.5 py-1 rounded-lg border text-[11px] transition-colors',
                        editBanner.image === img.path
                          ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                          : 'border-white/10 bg-white/5 text-whisper-gray hover:text-white'
                      )}
                    >
                      {img.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editBanner.image}
                  onChange={(e) => setEditBanner({ ...editBanner, image: e.target.value })}
                  className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-white font-mono outline-none"
                />
              </div>

              {/* Color Preset Selector */}
              <div className="md:col-span-2">
                <label className="text-whisper-gray block mb-1.5">Цветовая гамма баннера:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={cn(
                        'p-2 rounded-xl border text-center transition-all cursor-pointer',
                        editBanner.glowColor === preset.glowColor
                          ? 'border-white/40 bg-white/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      )}
                    >
                      <div
                        className={`h-2 rounded-full w-full bg-gradient-to-r ${preset.accentGradient} mb-1.5`}
                      />
                      <span className="text-[11px] text-frost-white font-medium block truncate">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditBanner(null)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs text-whisper-gray hover:text-white cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium text-xs hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
