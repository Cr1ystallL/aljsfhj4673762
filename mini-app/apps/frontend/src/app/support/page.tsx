'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ShieldCheck,
  Headphones,
  Check,
  CheckCheck,
  Clock,
  Sparkles,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SupportMessage {
  id: string;
  ticketId: string;
  senderType: 'user' | 'admin' | 'system';
  senderId: string;
  senderName: string | null;
  text: string;
  attachments?: any;
  isRead: boolean;
  createdAt: number;
}

interface SupportTicket {
  id: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  category: string;
  subject: string | null;
  lastMessageAt: number;
  unreadUserCount: number;
  createdAt: number;
}

const QUICK_TOPICS = [
  { id: 'deposit', label: '💳 Проблема с депозитом', hint: 'Не поступил депозит BLIK / Крипто' },
  { id: 'withdrawal', label: '⚡ Вопрос по выводу', hint: 'Статус заявки на вывод' },
  { id: 'bonus', label: '🎁 Бонусы и вейджер', hint: 'Как закрыть или активировать бонус' },
  { id: 'game', label: '🎰 Ошибка в игре', hint: 'Завис раунд или расчет ставки' },
  { id: 'general', label: '💬 Другой вопрос', hint: 'Связаться с дежурным оператором' },
];

export default function SupportPage() {
  const router = useRouter();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeCategory, setActiveCategory] = useState('general');
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const triggerHaptic = (type: 'light' | 'medium' | 'success' | 'warning' = 'light') => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        if (type === 'success' || type === 'warning') {
          tg.HapticFeedback.notificationOccurred(type);
        } else {
          tg.HapticFeedback.impactOccurred(type);
        }
      }
    } catch {}
  };

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  };

  // Fetch ticket and conversation messages
  const loadConversation = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/support/ticket', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка загрузки поддержки');
      }

      setTicket(data.ticket);
      setMessages(data.messages || []);
    } catch (e: any) {
      if (!isSilent) {
        setError(e?.message || 'Не удалось связаться с сервером поддержки');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // Scroll to bottom when messages update
  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length]);

  // Background sync polling every 4 seconds while conversation is active
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversation(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadConversation]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // Send message
  const handleSendMessage = async (customText?: string, categoryOverride?: string) => {
    const textToSend = (customText ?? inputText).trim();
    if (!textToSend || sending) return;

    triggerHaptic('medium');
    setSending(true);
    setError(null);

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: SupportMessage = {
      id: tempId,
      ticketId: ticket?.id || 'temp',
      senderType: 'user',
      senderId: 'me',
      senderName: 'Вы',
      text: textToSend,
      isRead: false,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    if (!customText) {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await fetch('/api/support/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text: textToSend,
          category: categoryOverride || activeCategory,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось отправить сообщение');
      }

      // Replace optimistic message with real message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? json.message : m))
      );
      triggerHaptic('success');
    } catch (err: any) {
      setError(err?.message || 'Ошибка отправки');
      triggerHaptic('warning');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (!customText) {
        setInputText(textToSend);
      }
    } finally {
      setSending(false);
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSelectTopic = (topic: typeof QUICK_TOPICS[0]) => {
    triggerHaptic('light');
    setActiveCategory(topic.id);
    setInputText(`Здравствуйте! У меня вопрос по теме «${topic.label.replace(/^[^\s]+\s/, '')}»: `);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0A0B0E] text-white select-none overflow-hidden">
      {/* ── Top Header ── */}
      <header className="shrink-0 z-20 px-4 py-3 bg-[#0E1015]/90 border-b border-white/[0.08] backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerHaptic('light');
              router.back();
            }}
            className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/10 flex items-center justify-center transition-all cursor-pointer"
            aria-label="Назад"
          >
            <ChevronLeft size={20} className="text-zinc-300" />
          </button>

          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 flex items-center justify-center">
              <Headphones size={18} className="text-amber-400" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0A0B0E]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white">
                Поддержка MACVBET
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Операторы на связи • Ответ ~2 мин
            </p>
          </div>
        </div>

        {/* Telegram Direct Fallback Button */}
        <a
          href="https://t.me/MacvBetSupport"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => triggerHaptic('light')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-all"
        >
          <span>@MacvBetSupport</span>
          <ExternalLink size={12} className="text-zinc-400" />
        </a>
      </header>

      {/* ── Chat Messages Container ── */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 overscroll-contain">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500">
            <RefreshCw size={24} className="animate-spin text-amber-400" />
            <span className="text-xs">Загрузка безопасного канала поддержки...</span>
          </div>
        ) : (
          <>
            {/* System Greeting Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] backdrop-blur-md relative overflow-hidden"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck size={18} className="text-amber-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400">
                      Верифицированный диалог
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      ID: #{ticket?.id ? ticket.id.slice(0, 8).toUpperCase() : 'AUTH'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    Ваш аккаунт подтвержден. Саппорт видит статус ваших транзакций,
                    депозитов и ставок. Вы можете задать любой вопрос ниже.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Quick Category Suggestion Pills (if few messages) */}
            {messages.length <= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-2 pt-1"
              >
                <span className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase px-1">
                  Частые темы обращений:
                </span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TOPICS.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => handleSelectTopic(topic)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer text-left active:scale-95',
                        activeCategory === topic.id
                          ? 'bg-amber-400/15 border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                          : 'bg-white/[0.03] border-white/10 text-zinc-300 hover:border-white/20 hover:text-white'
                      )}
                    >
                      {topic.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Message Stream */}
            <div className="space-y-3 pt-2">
              {messages.map((m) => {
                const isUser = m.senderType === 'user';
                const isSystem = m.senderType === 'system';

                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full text-[11px] bg-white/[0.04] border border-white/10 text-zinc-400 text-center max-w-[90%]">
                        {m.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      'flex flex-col max-w-[85%] sm:max-w-[75%]',
                      isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                    )}
                  >
                    {/* Specialist / User Header Tag */}
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                          <ShieldCheck size={13} className="text-amber-400" />
                          {m.senderName || 'Специалист MACVBET'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {formatTime(m.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words relative backdrop-blur-md',
                        isUser
                          ? 'bg-gradient-to-br from-amber-500/20 via-white/[0.06] to-white/[0.02] border border-amber-500/30 text-white rounded-tr-xs shadow-[0_2px_12px_rgba(0,0,0,0.3)]'
                          : 'bg-[#151821]/90 border border-white/[0.12] text-zinc-100 rounded-tl-xs shadow-[0_2px_15px_rgba(0,0,0,0.4)]'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {/* Footer time and checkmarks for user */}
                      {isUser && (
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
                          <span>{formatTime(m.createdAt)}</span>
                          {m.isRead ? (
                            <CheckCheck size={13} className="text-emerald-400" />
                          ) : (
                            <Check size={13} className="text-zinc-400" />
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </main>

      {/* ── Error Banner if any ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-rose-500/20 border-t border-rose-500/30 text-rose-300 text-xs flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs underline text-rose-200"
            >
              Закрыть
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Input Dock (Anti-AI-Slop Engineered Cluster) ── */}
      <footer className="shrink-0 p-3 bg-[#0A0B0E]/95 border-t border-white/[0.08] backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto">
          <div
            className={cn(
              'flex items-end gap-2 p-1.5 pl-3 rounded-2xl bg-[#13161F] border transition-all duration-200',
              inputText.trim()
                ? 'border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/20'
                : 'border-white/10 hover:border-white/20'
            )}
          >
            {/* Auto-growing clean textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Напишите ваш вопрос поддержке..."
              className="flex-1 max-h-28 min-h-[38px] py-2 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
            />

            {/* Tactile Engineered Action Button (Strictly Anti-AI Slop) */}
            <AnimatePresence mode="wait">
              {inputText.trim() ? (
                <motion.button
                  key="active-send"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  disabled={sending}
                  onClick={() => handleSendMessage()}
                  className="h-10 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_14px_rgba(245,158,11,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  aria-label="Отправить сообщение"
                >
                  {sending ? (
                    <RefreshCw size={14} className="animate-spin text-black" />
                  ) : (
                    <>
                      <span>Отправить</span>
                      {/* Refined geometric upward accent indicator */}
                      <span className="font-mono text-sm leading-none font-black">↑</span>
                    </>
                  )}
                </motion.button>
              ) : (
                <motion.div
                  key="idle-topics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 pr-1 pb-1"
                >
                  <a
                    href="https://t.me/MacvBetSupport"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => triggerHaptic('light')}
                    title="Написать в Telegram @MacvBetSupport"
                    className="h-8 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-all border border-white/5"
                  >
                    <span>В Telegram</span>
                    <ExternalLink size={10} className="text-zinc-500" />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-1.5 px-2 flex items-center justify-between text-[10px] text-zinc-500">
            <span>Enter для отправки • Shift+Enter новая строка</span>
            <span>Диалог сохраняется в вашем профиле</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
