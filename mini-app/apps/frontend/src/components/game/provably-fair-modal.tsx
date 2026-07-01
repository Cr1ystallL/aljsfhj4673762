'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchAuth } from '@/lib/api/fetch';
import { Loader2, Copy, Check } from 'lucide-react';
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
      fetchAuth(`/api/games/round/${roundId}`)
        .then((res) => res.json())
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#131B2A] border-white/10 text-frost-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-roobert font-medium tracking-tight">
            Честная игра (Provably Fair)
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        ) : data ? (
          <div className="space-y-4 pt-2">
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
          <div className="text-center text-white/50 py-10">Раунд не найден</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onCopy, copied, dim }: { label: string; value: string; onCopy?: () => void; copied?: boolean; dim?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-roobert text-white/50">{label}</div>
      <div className={cn("flex items-center gap-2 p-2 rounded-lg border border-white/5 bg-white/5", dim && "text-white/40")}>
        <div className="flex-1 font-mono text-sm break-all">{value}</div>
        {onCopy && (
          <button onClick={onCopy} className="p-1.5 shrink-0 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
          </button>
        )}
      </div>
    </div>
  );
}
