'use client';

import { useEffect, useState } from 'react';
import { PageTransition } from '@/components/ui/page-transition';
import { motion } from 'framer-motion';
import { User, Dice1, TrendingUp, Trophy, X } from 'lucide-react';
import { useBalance } from '@/hooks/use-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuthStore } from '@/store/auth-store';
import type { Transaction } from '@casino/shared/types/balance';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { balance, isDemoMode } = useBalance();
  const { transactions, isLoading: txLoading, fetchTransactions } = useTransactions();
  const [activeTab, setActiveTab] = useState<'game' | 'bet'>('game');

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Calculate stats
  const totalBets = transactions.filter((tx: Transaction) => tx.type === 'bet').length;
  const totalWagered = transactions
    .filter((tx: Transaction) => tx.type === 'bet')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalWon = transactions
    .filter((tx: Transaction) => tx.type === 'win')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const maxWin = Math.max(
    ...transactions.filter((tx: Transaction) => tx.type === 'win').map((tx) => tx.amount),
    0
  );
  const maxMultiplier = Math.max(
    ...transactions
      .filter((tx: Transaction) => tx.type === 'win' && tx.metadata?.multiplier)
      .map((tx) => (tx.metadata?.multiplier as number) || 0),
    0
  );

  // Get user initials
  const getInitials = () => {
    if (user?.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    }
    return 'U';
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black pb-24 overflow-y-auto">
        {/* Header with Balance */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/20 border border-blue-500/40 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className="text-white font-semibold text-sm">{balance?.amount || 0}</span>
              <span className="text-white/60 text-xs">₽</span>
            </div>
          </div>
          <h1 className="text-white font-semibold text-lg">Аккаунт</h1>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 px-4 py-4 border-b border-white/10">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 rounded-full text-white text-sm font-medium">
            <User size={16} />
            Аккаунт
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-transparent text-white/60 text-sm font-medium">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            История
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-transparent text-white/60 text-sm font-medium">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Настройки
          </button>
        </div>

        {/* User ID */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <span className="text-white/40 text-xs font-mono">
            # {user?.telegramId || 'unknown'}
          </span>
          <button className="text-white/40 text-xs">Копировать</button>
        </div>

        {/* Avatar Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6"
        >
          <div className="flex flex-col items-center">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-3">
              <span className="text-3xl font-bold text-white">{getInitials()}</span>
            </div>

            {/* Name */}
            <h2 className="text-white font-semibold text-lg mb-1">
              {user?.firstName || 'User'} {user?.lastName || ''}
            </h2>

            {/* Registration Date */}
            <p className="text-white/40 text-xs mb-6">
              Зарегистрирован {new Date().toLocaleDateString('ru-RU')}
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 w-full">
              {/* Total Bets */}
              <div className="bg-gray-800/30 rounded-lg p-4 flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-2">
                  <Dice1 size={20} className="text-blue-400" />
                </div>
                <span className="text-white/40 text-xs mb-1">ВСЕГО СТАВОК</span>
                <span className="text-white font-bold text-lg">{totalBets}</span>
              </div>

              {/* Total Won */}
              <div className="bg-gray-800/30 rounded-lg p-4 flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-2">
                  <TrendingUp size={20} className="text-emerald-400" />
                </div>
                <span className="text-white/40 text-xs mb-1">СУММА ВЫИГРЫШЕЙ</span>
                <span className="text-white font-bold text-lg">{totalWon.toFixed(0)} ₽</span>
              </div>

              {/* Max Win */}
              <div className="bg-gray-800/30 rounded-lg p-4 flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-2">
                  <Trophy size={20} className="text-purple-400" />
                </div>
                <span className="text-white/40 text-xs mb-1">МАКС ВЫИГРЫШ</span>
                <span className="text-white font-bold text-lg">{maxWin.toFixed(0)} ₽</span>
              </div>

              {/* Max Multiplier */}
              <div className="bg-gray-800/30 rounded-lg p-4 flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center mb-2">
                  <X size={20} className="text-orange-400" />
                </div>
                <span className="text-white/40 text-xs mb-1">МАКС КОЭФФ</span>
                <span className="text-white font-bold text-lg">x {maxMultiplier.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recent Bets */}
        <div className="px-4 mt-6">
          <h3 className="text-white font-semibold text-lg mb-4">Последние ставки</h3>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            <button
              onClick={() => setActiveTab('game')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'game'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/40'
              }`}
            >
              ИГРА И ДАТА
            </button>
            <button
              onClick={() => setActiveTab('bet')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'bet'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/40'
              }`}
            >
              СТАВКА / ВЫИГРЫШ
            </button>
          </div>

          {/* Bets List */}
          {txLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-white" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Dice1 size={48} className="text-white/20 mb-3" />
              <p className="text-white/40 text-sm mb-2">Ставки отсутствуют</p>
              <p className="text-white/30 text-xs text-center max-w-xs">
                Самое время чтобы сыграть. Мы используем доказуемо честный принцип работы, а наш RTP от 97% и более.
              </p>
              <button className="mt-6 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors">
                Играть
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 10).map((tx: Transaction, index: number) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-800/30 backdrop-blur-sm border border-white/5 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Dice1 size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {(tx.metadata?.gameType as string) || tx.gameType || 'Game'}
                      </p>
                      <p className="text-white/40 text-xs">
                        {new Date(tx.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm font-semibold">
                      {tx.type === 'win' ? '+' : '-'}
                      {tx.amount.toFixed(2)} ₽
                    </p>
                    {tx.metadata?.multiplier && (
                      <p className="text-white/60 text-xs">
                        {(tx.metadata.multiplier as number).toFixed(2)}x
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
