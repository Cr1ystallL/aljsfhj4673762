'use client';

import { useState, useEffect, useCallback } from 'react';
import type { VipStatusDto, CashbackStatusDto } from '@/lib/vip';
import { toast } from '@/store/toast-store';
import { soundManager } from '@/lib/sound/sound-manager';
import { haptics } from '@/lib/haptics';

export function useVip() {
  const [status, setStatus] = useState<VipStatusDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [claiming, setClaiming] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/status', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.status) {
        setStatus(json.status);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const claimReward = async (level: number) => {
    if (claiming) return;
    setClaiming(true);
    haptics.impact('heavy');
    try {
      const res = await fetch('/api/vip/claim-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ level }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Не удалось получить награду');
        return false;
      }
      soundManager.play('game.win');
      haptics.notification('success');
      toast.success(json.message || 'Награда успешно получена!');
      if (json.status) {
        setStatus(json.status);
      } else {
        void fetchStatus();
      }
      return true;
    } catch {
      toast.error('Ошибка сети при получении награды');
      return false;
    } finally {
      setClaiming(false);
    }
  };

  return {
    status,
    loading,
    claiming,
    refetch: fetchStatus,
    claimReward,
  };
}

export function useCashback() {
  const [cashback, setCashback] = useState<CashbackStatusDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [claiming, setClaiming] = useState<boolean>(false);

  const fetchCashback = useCallback(async () => {
    try {
      const res = await fetch('/api/vip/cashback/status', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && json.status) {
        setCashback(json.status);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCashback();
  }, [fetchCashback]);

  const claimCashback = async () => {
    if (claiming) return;
    setClaiming(true);
    haptics.impact('heavy');
    try {
      const res = await fetch('/api/vip/cashback/claim', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Не удалось забрать кэшбэк');
        return false;
      }
      soundManager.play('game.cashout');
      haptics.notification('success');
      toast.success(json.message || 'Кэшбэк успешно начислен на баланс!');
      if (json.status) {
        setCashback(json.status);
      } else {
        void fetchCashback();
      }
      return true;
    } catch {
      toast.error('Ошибка сети при получении кэшбэка');
      return false;
    } finally {
      setClaiming(false);
    }
  };

  return {
    cashback,
    loading,
    claiming,
    refetch: fetchCashback,
    claimCashback,
  };
}
