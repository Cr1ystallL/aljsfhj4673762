'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Copy, Check } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface ProvablyFairModalProps {
  roundId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RoundData {
  id: string;
  gameType: string;
  state: string;
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string | null;
  nonce: number;
}

export function ProvablyFairModal({ roundId, open, onOpenChange }: ProvablyFairModalProps) {
  const [data, setData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (open && roundId) {
      setLoading(true);
      apiClient.get<RoundData>(`/api/games/round/${roundId}`)
        .then((json) => {
          if (json.id) setData(json);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [open, roundId]);

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const onClose = () => onOpenChange(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute inset-0 bg-midnight-canvas/85 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-[420px] rounded-card border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-11 h-11 rounded-pill border border-white/15 bg-white/[0.04] flex items-center justify-center text-frost-white/80 hover:text-frost-white hover:border-white/25 active:scale-95 transition-all"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.8} />
            </button>

            <h2 className="font-roobert text-frost-white text-[22px] font-normal leading-tight pr-8">
              Честная игра (Provably Fair)
            </h2>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-white/50" />
              </div>
            ) : data ? (
              <div className="mt-4 space-y-4">
                <Field label="ID раунда" value={data.id} onCopy={() => copy(data.id, 'id')} copied={copiedField === 'id'} />
                <Field label="Server Seed Hash" value={data.serverSeedHash} onCopy={() => copy(data.serverSeedHash, 'hash')} copied={copiedField === 'hash'} />
                
                <Field 
                  label="Server Seed (Раскрывается после игры)" 
                  value={data.serverSeed || 'Скрыт (игра еще идет)'} 
                  onCopy={data.serverSeed ? () => copy(data.serverSeed!, 'seed') : undefined} 
                  copied={copiedField === 'seed'} 
                  dim={!data.serverSeed}
                />

                <Field 
                  label="Client Seed" 
                  value={data.clientSeed || 'Не используется'} 
                  onCopy={data.clientSeed ? () => copy(data.clientSeed!, 'client') : undefined} 
                  copied={copiedField === 'client'} 
                  dim={!data.clientSeed}
                />

                <Field label="Nonce" value={String(data.nonce)} onCopy={() => copy(String(data.nonce), 'nonce')} copied={copiedField === 'nonce'} />

                <div className="mt-6 pt-4 border-t border-white/10 text-xs text-white/50 font-roobert">
                  <p className="mb-2">
                    Вы можете проверить честность этого раунда. Хэш серверного сида (Server Seed Hash) генерируется до начала раунда, доказывая, что мы не меняем результат во время игры.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center text-white/50 py-10 font-roobert">Раунд не найден</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, value, onCopy, copied, dim }: { label: string; value: string; onCopy?: () => void; copied?: boolean; dim?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-roobert text-white/50">{label}</div>
      <div className={cn("flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-white/5", dim && "text-white/40")}>
        <div className="flex-1 font-mono text-[13px] break-all text-frost-white/85">{value}</div>
        {onCopy && (
          <button onClick={onCopy} className="p-1.5 shrink-0 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
          </button>
        )}
      </div>
    </div>
  );
}
