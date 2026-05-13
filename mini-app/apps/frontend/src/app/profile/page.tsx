'use client';

import { useEffect, useState } from 'react';
import { PageTransition } from '@/components/ui/page-transition';
import { GlassCard } from '@/components/ui/glass-card';
import { BalanceDisplay } from '@/components/ui/balance-display';
import { TransactionList } from '@/components/ui/transaction-list';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { User, LogOut, Settings, History, RefreshCw, Loader2 } from 'lucide-react';
import { useBalance } from '@/hooks/use-balance';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuthStore } from '@/store/auth-store';
import { useWebSocketStore } from '@/store/websocket-store';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const { balance, isLoading: balanceLoading, fetchBalance, syncBalance, switchMode, isDemoMode } = useBalance();
  const { transactions, isLoading: txLoading, fetchTransactions } = useTransactions();
  const { status: wsStatus } = useWebSocketStore();
  const [showTransactions, setShowTransactions] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchBalance(isDemoMode);
    fetchTransactions();
  }, [fetchBalance, fetchTransactions, isDemoMode]);

  const handleSync = async () => {
    setSyncing(true);
    await syncBalance();
    await fetchTransactions();
    setSyncing(false);
  };

  const handleModeSwitch = async () => {
    await switchMode(!isDemoMode);
    await fetchTransactions();
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-32 pt-safe px-safe">
        {/* Header */}
        <header className="p-6">
          <motion.div
            className="flex items-center justify-between"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl font-bold text-white">Profile</h1>
            
            {/* WebSocket Status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-400'
                    : wsStatus === 'connecting' || wsStatus === 'reconnecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span className="text-xs text-white/60">
                {wsStatus === 'connected' ? 'Live' : wsStatus}
              </span>
            </div>
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="px-6 space-y-6">
          {/* Balance Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white/80">Balance</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing || isDemoMode}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              {balanceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-white/40" />
                </div>
              ) : (
                <BalanceDisplay
                  amount={balance?.amount || 0}
                  currency={balance?.currency || 'USD'}
                />
              )}

              {/* Demo Mode Toggle */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={handleModeSwitch}
                  className="flex items-center justify-between w-full"
                >
                  <span className="text-sm text-white/60">Demo Mode</span>
                  <div
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      isDemoMode ? 'bg-emerald-500' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        isDemoMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </GlassCard>
          </motion.div>

          {/* User Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <GlassCard className="p-6">
              <div className="flex items-center gap-4 mb-6">
                {/* Avatar with gradient background and user initial or icon */}
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                  {user?.firstName ? (
                    <span className="text-2xl font-bold text-white">
                      {user.firstName.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User size={32} className="text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {user?.firstName || 'User'}
                    {user?.lastName && ` ${user.lastName}`}
                  </h2>
                  <p className="text-white/60">
                    @{user?.username || `user${user?.telegramId || '0'}`}
                  </p>
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    {transactions.length}
                  </div>
                  <div className="text-sm text-white/60">Games</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    ${transactions
                      .filter((tx) => tx.type === 'bet')
                      .reduce((sum, tx) => sum + tx.amount, 0)
                      .toFixed(0)}
                  </div>
                  <div className="text-sm text-white/60">Wagered</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">
                    ${transactions
                      .filter((tx) => tx.type === 'win')
                      .reduce((sum, tx) => sum + tx.amount, 0)
                      .toFixed(0)}
                  </div>
                  <div className="text-sm text-white/60">Won</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Menu Items */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <GlassCard
              hover
              className="p-4 cursor-pointer"
              onClick={() => setShowTransactions(!showTransactions)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History size={20} className="text-white/60" />
                  <span className="text-white font-medium">Transaction History</span>
                </div>
                <motion.div
                  animate={{ rotate: showTransactions ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="text-white/60"
                  >
                    <path
                      d="M5 7.5L10 12.5L15 7.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>
              </div>
            </GlassCard>

            {/* Transaction List */}
            {showTransactions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TransactionList transactions={transactions} isLoading={txLoading} />
              </motion.div>
            )}
            
            <GlassCard hover className="p-4 cursor-pointer">
              <div className="flex items-center gap-3">
                <Settings size={20} className="text-white/60" />
                <span className="text-white font-medium">Settings</span>
              </div>
            </GlassCard>
            
            <GlassCard hover className="p-4 cursor-pointer">
              <div className="flex items-center gap-3 text-red-400">
                <LogOut size={20} />
                <span className="font-medium">Logout</span>
              </div>
            </GlassCard>
          </motion.div>
        </main>
      </div>
    </PageTransition>
  );
}
