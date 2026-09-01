import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Dice5, Trash2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { soundManager } from '@/lib/sound/sound-manager';
import { useT } from '@/i18n/use-t';

export type KenoPhase = 'idle' | 'playing' | 'revealing';
type KenoRisk = 'low' | 'medium' | 'high';

interface KenoBetPanelProps {
  amount: number;
  onAmountChange: (v: number) => void;
  risk: string;
  onRiskChange: (r: string) => void;
  picks: number[];
  onAutoPick: () => void;
  onClear: () => void;
  phase: KenoPhase;
  onBet: () => void;
  busy: boolean;
  maxPick: number;
  activeBalance: number;
  currency?: string;
}

const RISK_OPTIONS: Array<{ value: KenoRisk; label: string; dotColor: string }> = [
  { value: 'low', label: 'Низкий', dotColor: 'bg-emerald-400' },
  { value: 'medium', label: 'Средний', dotColor: 'bg-amber-400' },
  { value: 'high', label: 'Высокий', dotColor: 'bg-red-400' },
];

export function KenoBetPanel({
  amount,
  onAmountChange,
  risk,
  onRiskChange,
  picks,
  onAutoPick,
  onClear,
  phase,
  onBet,
  busy,
  maxPick,
  activeBalance,
}: KenoBetPanelProps) {
  const { t } = useT();
  const [amountStr, setAmountStr] = useState(amount.toString());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAmountStr = (val: string) => {
    setAmountStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      onAmountChange(parsed);
    }
  };

  const handleHalve = () => {
    const val = Math.max(1, Math.floor(amount / 2));
    setAmountStr(val.toString());
    onAmountChange(val);
    soundManager.play('click');
  };

  const handleDouble = () => {
    const val = amount * 2;
    setAmountStr(val.toString());
    onAmountChange(val);
    soundManager.play('click');
  };

  const disabled = phase !== 'idle' || busy;
  const minBet = 1;
  const maxBet = Math.max(1, Math.floor(activeBalance) || 1);
  const canBet = picks.length >= 1 && picks.length <= maxPick && !disabled;
  const currentRisk = RISK_OPTIONS.find((r) => r.value === risk) || RISK_OPTIONS[0];

  const ctaLabel =
    phase === 'revealing'
      ? t('common.playing')
      : busy
        ? t('common.loading')
        : t('common.bet');

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl shadow-2xl">
      {/* Row 1: Bet Amount (60%) & Risk Selector Dropdown (40%) */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-2 items-end">
        {/* Bet Amount */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <label className="text-[10px] uppercase tracking-wider text-white/50 font-roobert font-medium">
              Ставка
            </label>
          </div>
          <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-xl focus-within:border-primary/50 transition-colors h-9 px-2">
            <div className="text-white/40 mr-1.5 shrink-0">
              <Coins className="w-3.5 h-3.5" />
            </div>
            <input
              type="number"
              value={amountStr}
              onChange={(e) => handleAmountStr(e.target.value)}
              disabled={disabled}
              className="w-full h-full border-0 bg-transparent outline-none text-white font-mono text-sm min-w-0"
            />
            <div className="flex shrink-0 space-x-1 pl-1">
              <button
                type="button"
                disabled={disabled}
                onClick={handleHalve}
                className="h-6 px-1.5 text-[10px] rounded-lg bg-white/5 hover:bg-white/10 text-white/70 font-mono transition-colors disabled:opacity-50"
              >
                ½
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleDouble}
                className="h-6 px-1.5 text-[10px] rounded-lg bg-white/5 hover:bg-white/10 text-white/70 font-mono transition-colors disabled:opacity-50"
              >
                2×
              </button>
            </div>
          </div>
        </div>

        {/* Risk Dropdown */}
        <div className="space-y-1 relative" ref={dropdownRef}>
          <label className="text-[10px] uppercase tracking-wider text-white/50 px-1 font-roobert font-medium">
            Сложность
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full h-9 px-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] flex items-center justify-between text-white text-xs font-medium transition-all disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn('w-2 h-2 rounded-full shrink-0', currentRisk.dotColor)} />
              <span className="truncate">{currentRisk.label}</span>
            </div>
            <ChevronDown
              size={14}
              className={cn('text-white/40 shrink-0 transition-transform duration-200', dropdownOpen && 'rotate-180')}
            />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 bottom-full mb-1.5 w-36 rounded-xl border border-white/15 bg-black/95 backdrop-blur-2xl shadow-2xl p-1 z-50 flex flex-col gap-0.5"
              >
                {RISK_OPTIONS.map((opt) => {
                  const isSelected = opt.value === risk;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onRiskChange(opt.value);
                        setDropdownOpen(false);
                        soundManager.play('click');
                      }}
                      className={cn(
                        'w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors',
                        isSelected
                          ? 'bg-white/15 text-white font-semibold'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', opt.dotColor)} />
                        <span>{opt.label}</span>
                      </div>
                      {isSelected && <Check size={12} className="text-white" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Row 2: Auto & Clear (compact 1 row) */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={onAutoPick}
          className="h-8 rounded-xl border-white/10 bg-white/[0.02] hover:bg-white/10 text-white/80 text-xs font-roobert"
        >
          <Dice5 className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Автовыбор
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || picks.length === 0}
          onClick={onClear}
          className="h-8 rounded-xl border-white/10 bg-white/[0.02] hover:bg-destructive/20 hover:text-destructive text-white/80 text-xs font-roobert"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Сброс
        </Button>
      </div>

      {/* Row 3: Bet Button */}
      <Button
        disabled={!canBet}
        onClick={onBet}
        className={cn(
          'w-full h-11 rounded-xl text-sm font-bold shadow-lg transition-all duration-200',
          canBet
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 hover:brightness-110 active:scale-[0.98]'
            : 'bg-white/10 text-white/40'
        )}
      >
        {phase === 'revealing' ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Идет розыгрыш...
          </span>
        ) : busy ? (
          'Загрузка...'
        ) : (
          `СТАВКА (${picks.length}/${maxPick})`
        )}
      </Button>
    </div>
  );
}
