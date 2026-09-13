'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Headphones,
  X,
  ShieldCheck,
  Check,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Minimize2,
} from 'lucide-react';
import { useSupportStore } from '@/store/support-store';
import { useAuthStore } from '@/store/auth-store';
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
  { id: 'deposit', label: '💳 Депозит / BLIK' },
  { id: 'withdrawal', label: '⚡ Вывод средств' },
  { id: 'bonus', label: '🎁 Бонусы и вейджер' },
  { id: 'game', label: '🎰 Ошибка в игре' },
];

export function SupportChatWidget() {
  const pathname = usePathname() ?? '';
  const { isOpen, open, close, unreadCount, setUnreadCount } = useSupportStore();
  const token = useAuthStore((s) => s.token);

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
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

  // Poll unread counter when widget is closed
  const checkUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/support/unread-count', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok && typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }, [token, setUnreadCount]);

  // Load ticket conversation
  const loadConversation = useCallback(async (isSilent = false) => {
    if (!token) return;
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
      setUnreadCount(0);
    } catch (e: any) {
      if (!isSilent) {
        setError(e?.message || 'Не удалось связаться с поддержкой');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [token, setUnreadCount]);

  // When widget opens, load messages
  useEffect(() => {
    if (isOpen) {
      loadConversation();
    } else {
      checkUnreadCount();
    }
  }, [isOpen, loadConversation, checkUnreadCount]);

  // Interval polling
  useEffect(() => {
    const interval = setInterval(() => {
      if (isOpen) {
        loadConversation(true);
      } else {
        checkUnreadCount();
      }
    }, isOpen ? 3500 : 15000);
    return () => clearInterval(interval);
  }, [isOpen, loadConversation, checkUnreadCount]);

  // Scroll to bottom on message updates
  useEffect(() => {
    if (isOpen) {
      scrollToBottom(false);
    }
  }, [messages.length, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  };

  const handleSendMessage = async (customText?: string) => {
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
          category: activeCategory,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось отправить сообщение');
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? json.message : m))
      );
      triggerHaptic('success');
    } catch (err: any) {
      setError(err?.message || 'Ошибка отправки');
      triggerHaptic('warning');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (!customText) setInputText(textToSend);
    } finally {
      setSending(false);
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  const handleSelectTopic = (topic: typeof QUICK_TOPICS[0]) => {
    triggerHaptic('light');
    setActiveCategory(topic.id);
    setInputText(`Здравствуйте! Вопрос по теме «${topic.label.replace(/^[^\s]+\s/, '')}»: `);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Hide widget completely on admin console or standalone support page
  const isConsole = pathname.startsWith('/system/console');
  const isStandaloneSupport = pathname === '/support';
  if (isConsole || isStandaloneSupport) return null;

  return (
    <>
      {/* ── Floating Launcher Trigger Bubble ── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="support-bubble"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              triggerHaptic('medium');
              open();
            }}
            className="fixed bottom-24 lg:bottom-6 right-3 lg:right-6 z-40 p-3 rounded-2xl bg-[#0E1015]/95 border border-amber-400/30 hover:border-amber-400/60 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex items-center gap-2 cursor-pointer transition-colors group"
            aria-label="Открыть поддержку"
          >
            <div className="relative">
              <Headphones size={20} className="text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0E1015] animate-pulse" />
            </div>

            <span className="hidden sm:inline text-xs font-bold text-white tracking-tight pr-1">
              Поддержка 24/7
            </span>

            {/* Unread badge */}
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-bounce">
                {unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Backdrop for mobile ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close()}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Floating Chat Widget Overlay ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="support-widget-panel"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={cn(
              'fixed z-50 bg-[#0A0B0E]/98 border border-white/15 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden',
              // Mobile: Bottom Sheet
              'inset-x-0 bottom-0 h-[88dvh] max-h-[88dvh] rounded-t-3xl',
              // Desktop: Floating Window
              'lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[410px] lg:h-[630px] lg:max-h-[85vh] lg:rounded-3xl'
            )}
          >
            {/* Mobile Drag Indicator Handle */}
            <div className="lg:hidden w-full pt-2 pb-1 flex justify-center cursor-pointer" onClick={() => close()}>
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* ── Widget Header ── */}
            <div className="px-4 py-3 bg-[#0E1015] border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 flex items-center justify-center">
                    <Headphones size={16} className="text-amber-400" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0E1015]" />
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white tracking-tight">Поддержка MACVBET</span>
                    <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    Операторы онлайн • Ответ ~2 мин
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <a
                  href="https://t.me/MacvBetSupport"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => triggerHaptic('light')}
                  className="px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] text-zinc-300 flex items-center gap-1 transition-all"
                  title="Открыть диалог в Telegram"
                >
                  <span>В Telegram</span>
                  <ExternalLink size={10} className="text-zinc-500" />
                </a>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    close();
                  }}
                  className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
                  aria-label="Свернуть поддержку"
                >
                  <Minimize2 size={15} className="hidden lg:block" />
                  <X size={16} className="lg:hidden" />
                </button>
              </div>
            </div>

            {/* ── Widget Message Stream ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                  <RefreshCw size={20} className="animate-spin text-amber-400" />
                  <span>Загрузка защищенного канала...</span>
                </div>
              ) : (
                <>
                  {/* System greeting card */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-amber-400 flex items-center gap-1 text-[11px]">
                        <ShieldCheck size={13} />
                        Верифицированная сессия
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        #{ticket?.id ? ticket.id.slice(0, 8).toUpperCase() : 'AUTH'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Оператор видит данные вашего аккаунта и баланс. Напишите ваш вопрос ниже.
                    </p>
                  </div>

                  {/* Quick Topics if conversation is just beginning */}
                  {messages.length <= 2 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                        Частые темы:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TOPICS.map((topic) => (
                          <button
                            key={topic.id}
                            onClick={() => handleSelectTopic(topic)}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-amber-400/10 border border-white/10 hover:border-amber-400/30 text-[11px] text-zinc-300 hover:text-amber-300 transition-all cursor-pointer text-left"
                          >
                            {topic.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="space-y-2.5 pt-1">
                    {messages.map((m) => {
                      const isUser = m.senderType === 'user';
                      const isSystem = m.senderType === 'system';

                      if (isSystem) {
                        return (
                          <div key={m.id} className="flex justify-center my-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-white/[0.04] border border-white/10 text-zinc-400 text-center">
                              {m.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex flex-col max-w-[85%]',
                            isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                          )}
                        >
                          {!isUser && (
                            <div className="flex items-center gap-1 mb-0.5 px-1 text-[10px] text-amber-400 font-semibold">
                              <ShieldCheck size={11} />
                              <span>{m.senderName || 'Специалист MACVBET'}</span>
                              <span className="text-zinc-500 font-normal ml-1">{formatTime(m.createdAt)}</span>
                            </div>
                          )}

                          <div
                            className={cn(
                              'px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-sm',
                              isUser
                                ? 'bg-gradient-to-br from-amber-500/20 via-white/[0.06] to-white/[0.02] border border-amber-500/30 text-white rounded-tr-xs'
                                : 'bg-[#151821] border border-white/10 text-zinc-100 rounded-tl-xs'
                            )}
                          >
                            <p className="whitespace-pre-wrap">{m.text}</p>
                            {isUser && (
                              <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] text-zinc-400">
                                <span>{formatTime(m.createdAt)}</span>
                                {m.isRead ? (
                                  <CheckCheck size={11} className="text-emerald-400" />
                                ) : (
                                  <Check size={11} className="text-zinc-400" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="px-3 py-1.5 bg-rose-500/20 border-t border-rose-500/30 text-rose-300 text-[11px] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  <span>{error}</span>
                </div>
                <button onClick={() => setError(null)} className="underline text-[10px]">
                  Ок
                </button>
              </div>
            )}

            {/* ── Widget Input Dock (Anti-AI Slop) ── */}
            <div className="p-2.5 bg-[#0E1015] border-t border-white/10 shrink-0">
              <div
                className={cn(
                  'flex items-end gap-2 p-1 pl-2.5 rounded-2xl bg-[#13161F] border transition-all duration-200',
                  inputText.trim()
                    ? 'border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.12)]'
                    : 'border-white/10'
                )}
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Задайте вопрос оператору..."
                  className="flex-1 max-h-24 min-h-[34px] py-1.5 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
                />

                <AnimatePresence mode="wait">
                  {inputText.trim() ? (
                    <motion.button
                      key="send-btn"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      disabled={sending}
                      onClick={() => handleSendMessage()}
                      className="h-8 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold text-xs flex items-center gap-1 shadow-[0_2px_10px_rgba(245,158,11,0.3)] active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {sending ? (
                        <RefreshCw size={12} className="animate-spin text-black" />
                      ) : (
                        <>
                          <span>Отправить</span>
                          <span className="font-mono text-xs font-black">↑</span>
                        </>
                      )}
                    </motion.button>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="mt-1 px-1 flex items-center justify-between text-[9px] text-zinc-500">
                <span>Enter для отправки</span>
                <span>История синхронизируется</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
