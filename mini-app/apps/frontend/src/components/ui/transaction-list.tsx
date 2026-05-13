'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react';
import { GlassCard } from './glass-card';
import { Body, Caption } from './typography';

/**
 * Transaction List Component
 * Displays transaction history with animations
 */

interface Transaction {
  id: string;
  type: string;
  amount: number;
  createdAt: Date;
  gameType?: string | null;
}

interface TransactionListProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

export function TransactionList({ transactions, isLoading }: TransactionListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <Body className="text-white/40">No transactions yet</Body>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx, index) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    tx.type === 'win' || tx.type === 'deposit'
                      ? 'bg-emerald-500/20'
                      : 'bg-red-500/20'
                  }`}
                >
                  {tx.type === 'win' || tx.type === 'deposit' ? (
                    <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5 text-red-400" />
                  )}
                </div>
                <div>
                  <Body className="font-medium">
                    {tx.gameType ? tx.gameType : tx.type}
                  </Body>
                  <Caption className="text-white/40">
                    {new Date(tx.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Caption>
                </div>
              </div>
              <Body
                className={`font-semibold ${
                  tx.type === 'win' || tx.type === 'deposit'
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {tx.type === 'win' || tx.type === 'deposit' ? '+' : '-'}$
                {Math.abs(tx.amount).toFixed(2)}
              </Body>
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
}
