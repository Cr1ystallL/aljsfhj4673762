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
  LogIn,
  CreditCard,
  Zap,
  Gift,
  Gamepad2,
  Paperclip,
  FileText,
} from 'lucide-react';
import { useSupportStore } from '@/store/support-store';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

export interface MessageAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  isImage: boolean;
  name: string;
  size: number;
  type: string;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SupportMessage {
  id: string;
  ticketId: string;
  senderType: 'user' | 'admin' | 'system';
  senderId: string;
  senderName: string | null;
  text: string;
  attachments?: MessageAttachment[];
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
  { id: 'deposit', label: 'Депозит / BLIK', icon: CreditCard },
  { id: 'withdrawal', label: 'Вывод средств', icon: Zap },
  { id: 'bonus', label: 'Бонусы и вейджер', icon: Gift },
  { id: 'game', label: 'Ошибка в игре', icon: Gamepad2 },
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

  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
  const MAX_FILES = 5;
  const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];

  const addFiles = (filesToAdd: File[]) => {
    const currentCount = pendingFiles.length;
    if (currentCount >= MAX_FILES) {
      setError(`Можно прикрепить максимум ${MAX_FILES} файлов.`);
      triggerHaptic('warning');
      return;
    }

    const validNew: PendingAttachment[] = [];
    let sizeError = false;
    let formatError = false;
    let countExceeded = false;

    for (const file of filesToAdd) {
      if (currentCount + validNew.length >= MAX_FILES) {
        countExceeded = true;
        break;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAllowedExt = ALLOWED_EXTS.includes(ext);
      const isAllowedMime = file.type === 'application/pdf' || file.type.startsWith('image/');

      if (!isAllowedExt && !isAllowedMime) {
        formatError = true;
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        sizeError = true;
        continue;
      }

      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
      const previewUrl = isImage ? URL.createObjectURL(file) : '';

      validNew.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl,
        isImage,
        name: file.name,
        size: file.size,
        type: file.type || (isImage ? 'image/png' : 'application/pdf'),
      });
    }

    if (validNew.length > 0) {
      setPendingFiles((prev) => [...prev, ...validNew]);
      triggerHaptic('light');
    }

    if (countExceeded) {
      setError(`Максимально можно прикрепить до ${MAX_FILES} файлов за раз.`);
      triggerHaptic('warning');
    } else if (sizeError) {
      setError('Размер файла превышает 3 МБ. Допустимы только чеки и фото до 3 МБ.');
      triggerHaptic('warning');
    } else if (formatError) {
      setError('Неподдерживаемый формат. Допустимы только чеки: PDF, PNG, JPG, WEBP.');
      triggerHaptic('warning');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    addFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
    triggerHaptic('light');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/') || items[i].type === 'application/pdf') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

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
    if (!token) return;
    const interval = setInterval(() => {
      if (isOpen) {
        loadConversation(true);
      } else {
        checkUnreadCount();
      }
    }, isOpen ? 3500 : 15000);
    return () => clearInterval(interval);
  }, [isOpen, token, loadConversation, checkUnreadCount]);

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
    const hasPending = pendingFiles.length > 0;
    if ((!textToSend && !hasPending) || sending || uploadingFiles) return;

    triggerHaptic('medium');
    setSending(true);
    setError(null);

    // 1. Upload files first if any
    let uploadedAttachments: MessageAttachment[] = [];
    if (hasPending) {
      setUploadingFiles(true);
      try {
        const formData = new FormData();
        pendingFiles.forEach((p) => {
          formData.append('files', p.file, p.name);
        });

        const uploadRes = await fetch('/api/support/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadJson.error || 'Не удалось загрузить файлы чеков');
        }
        uploadedAttachments = uploadJson.files || [];
      } catch (upErr: any) {
        setError(upErr?.message || 'Ошибка загрузки чеков');
        setSending(false);
        setUploadingFiles(false);
        triggerHaptic('warning');
        return;
      } finally {
        setUploadingFiles(false);
      }
    }

    // Clean up local blob URLs and pending state
    pendingFiles.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setPendingFiles([]);

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: SupportMessage = {
      id: tempId,
      ticketId: ticket?.id || 'temp',
      senderType: 'user',
      senderId: 'me',
      senderName: 'Вы',
      text: textToSend || (uploadedAttachments.length === 1 ? '📎 Чек / вложение' : `📎 Вложения (${uploadedAttachments.length})`),
      attachments: uploadedAttachments,
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
          attachments: uploadedAttachments,
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
    setInputText(`Здравствуйте! Вопрос по теме «${topic.label}»: `);
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
            className="fixed bottom-24 lg:bottom-6 right-3 lg:right-6 z-[9990] p-3 rounded-2xl bg-[#0E1015] border border-amber-400/40 hover:border-amber-400/80 shadow-[0_4px_24px_rgba(0,0,0,0.85)] flex items-center gap-2 cursor-pointer transition-colors group"
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

      {/* ── Backdrop for mobile (Solid deep dimming to prevent see-through) ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="support-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close()}
            className="fixed inset-0 z-[9998] bg-black/85 backdrop-blur-sm lg:hidden"
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
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            className={cn(
              'fixed z-[9999] flex flex-col overflow-hidden',
              // Solid dark opaque foundation that never becomes transparent in Telegram WebViews:
              'bg-[#0B0D14] border border-white/15 shadow-[0_-16px_50px_rgba(0,0,0,0.95)]',
              // Mobile Bottom Sheet: full width, 88dvh height, rounded top, border-t specular
              'inset-x-0 bottom-0 h-[88dvh] max-h-[92dvh] rounded-t-[28px] border-x-0 border-b-0 border-t border-white/20',
              // Desktop Floating Window:
              'lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[420px] lg:h-[640px] lg:max-h-[85vh] lg:rounded-3xl lg:border lg:border-white/15'
            )}
          >
            {/* Top specular glossy reflection line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent pointer-events-none z-20" />

            {/* Mobile Drag Indicator Handle */}
            <div
              className="lg:hidden w-full pt-2.5 pb-1 flex justify-center cursor-pointer bg-[#121522] active:opacity-70 transition-opacity shrink-0"
              onClick={() => close()}
            >
              <div className="w-12 h-1.5 rounded-full bg-white/30" />
            </div>

            {/* ── Widget Header ── */}
            <div className="px-4 py-3 bg-gradient-to-r from-[#161928] via-[#121522] to-[#161928] border-b border-white/10 flex items-center justify-between shrink-0 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Headphones size={16} className="text-amber-400" />
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white tracking-tight">Поддержка MACVBET</span>
                  </div>
                  <p className="text-[10.5px] text-zinc-400">
                    Ответ ~2-30 мин.
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
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[10px] text-zinc-300 flex items-center gap-1 transition-all"
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
                  className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
                  aria-label="Свернуть поддержку"
                >
                  <Minimize2 size={15} className="hidden lg:block" />
                  <X size={16} className="lg:hidden" />
                </button>
              </div>
            </div>

            {/* ── Widget Message Stream (Explicit solid background) ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain bg-[#0B0D14]">
              {!token ? (
                /* Unauthorized state */
                <div className="h-full flex flex-col items-center justify-center p-6 text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                    <Headphones size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-white">Персональная поддержка 24/7</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
                    Для просмотра истории обращений войдите в аккаунт, либо свяжитесь с нашим оператором напрямую в Telegram:
                  </p>
                  <a
                    href="https://t.me/MacvBetSupport"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold text-xs flex items-center gap-1.5 shadow-[0_2px_12px_rgba(245,158,11,0.3)] hover:brightness-110 active:scale-95 transition-all"
                  >
                    <span>Открыть @MacvBetSupport</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              ) : loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs">
                  <RefreshCw size={22} className="animate-spin text-amber-400" />
                  <span>Загрузка защищенного канала...</span>
                </div>
              ) : (
                <>
                  {/* System greeting card */}
                  <div className="p-3.5 rounded-2xl bg-[#121522] border border-white/10 text-xs shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-amber-400 flex items-center gap-1 text-[11px]">
                        <ShieldCheck size={14} />
                        Верифицированная сессия
                      </span>
                      <span className="text-[9px] text-zinc-500 font-mono">
                        #{ticket?.id ? ticket.id.slice(0, 8).toUpperCase() : 'AUTH'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Оператор видит данные вашего аккаунта и баланс. Напишите ваш вопрос ниже — дежурный специалист ответит в ближайшее время.
                    </p>
                  </div>

                  {/* Quick Topics if conversation is just beginning */}
                  {messages.length <= 2 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">
                        Частые темы:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TOPICS.map((topic) => {
                          const Icon = topic.icon;
                          return (
                            <button
                              key={topic.id}
                              onClick={() => handleSelectTopic(topic)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#151926] hover:bg-[#1D2235] border border-white/10 hover:border-amber-400/30 text-[11px] text-zinc-300 hover:text-amber-300 transition-all cursor-pointer text-left active:scale-95"
                            >
                              <Icon size={13} className="text-amber-400 shrink-0" />
                              <span>{topic.label}</span>
                            </button>
                          );
                        })}
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
                            <span className="px-3 py-1 rounded-full text-[10px] bg-white/[0.05] border border-white/10 text-zinc-400 text-center">
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
                              'px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-sm',
                              isUser
                                ? 'bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-[#1c1708] border border-amber-500/40 text-white rounded-tr-xs'
                                : 'bg-[#141824] border border-white/10 text-zinc-100 rounded-tl-xs shadow-[0_2px_10px_rgba(0,0,0,0.3)]'
                            )}
                          >
                            <p className="whitespace-pre-wrap">{m.text}</p>

                            {/* Attachments rendering */}
                            {m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {m.attachments.map((att: any, idx: number) => {
                                  const isImg =
                                    att.type?.startsWith('image/') ||
                                    /\.(png|jpe?g|webp)$/i.test(att.url || att.name);
                                  if (isImg) {
                                    return (
                                      <div
                                        key={idx}
                                        className="relative group rounded-xl overflow-hidden border border-white/15 bg-black/40 max-w-[240px]"
                                      >
                                        <img
                                          src={att.url}
                                          alt={att.name || 'Прикрепленный чек'}
                                          className="w-full max-h-48 object-contain rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                                          onClick={() => setPreviewImageModal(att.url)}
                                          loading="lazy"
                                        />
                                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] text-zinc-300 font-mono">
                                          {formatFileSize(att.size)}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <a
                                      key={idx}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors group cursor-pointer max-w-[260px]"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                                        <FileText size={16} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
                                          {att.name || 'Чек / квитанция PDF'}
                                        </p>
                                        <p className="text-[9.5px] text-zinc-400">
                                          PDF • {formatFileSize(att.size)}
                                        </p>
                                      </div>
                                      <ExternalLink size={12} className="text-zinc-500 group-hover:text-white shrink-0 mr-0.5" />
                                    </a>
                                  );
                                })}
                              </div>
                            )}

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

            {/* Error message bar with retry button */}
            {error && (
              <div className="px-3 py-2 bg-rose-500/15 border-t border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                  <AlertCircle size={14} className="shrink-0 text-rose-400" />
                  <span className="truncate">{error}</span>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    loadConversation();
                  }}
                  className="px-2 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 text-[11px] font-semibold text-rose-200 transition-colors shrink-0"
                >
                  Повторить
                </button>
              </div>
            )}

            {/* ── Widget Input Dock (Safe area padded for iPhone / Android Telegram) ── */}
            <div className="p-3 bg-[#10121A] border-t border-white/10 shrink-0 pb-[max(14px,env(safe-area-inset-bottom))]">
              {/* Hidden Native File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Pending Attachments Tray */}
              {pendingFiles.length > 0 && (
                <div className="mb-2 p-2 rounded-xl bg-[#141824] border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
                    <span className="font-semibold text-zinc-300">
                      Прикрепленные чеки / файлы ({pendingFiles.length}/5):
                    </span>
                    <span className="text-[9px] text-zinc-500">макс. 3 МБ</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                    {pendingFiles.map((p) => (
                      <div
                        key={p.id}
                        className="relative shrink-0 group rounded-xl overflow-hidden border border-white/15 bg-black/40 p-1 flex items-center gap-1.5"
                      >
                        {p.isImage ? (
                          <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-black shrink-0">
                            <img
                              src={p.previewUrl}
                              alt={p.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-rose-500/15 border border-rose-500/20 flex flex-col items-center justify-center text-rose-400 shrink-0">
                            <FileText size={16} />
                            <span className="text-[7.5px] font-bold mt-0.5">PDF</span>
                          </div>
                        )}

                        <div className="max-w-[95px] pr-5">
                          <p className="text-[10px] font-medium text-white truncate">{p.name}</p>
                          <p className="text-[9px] text-zinc-400">{formatFileSize(p.size)}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => removePendingFile(p.id)}
                          className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500/80 hover:bg-rose-500 text-white flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                          aria-label="Удалить файл"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}

                    {pendingFiles.length < 5 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-11 px-2.5 rounded-xl border border-dashed border-white/20 hover:border-amber-400/50 hover:bg-white/[0.03] text-zinc-400 hover:text-amber-400 flex items-center gap-1 text-[11px] font-medium transition-colors shrink-0 cursor-pointer"
                      >
                        <span className="text-sm font-bold">+</span>
                        <span>Еще</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div
                className={cn(
                  'flex items-end gap-2 p-1.5 pl-2.5 rounded-2xl bg-[#151926] border transition-all duration-200',
                  inputText.trim() || pendingFiles.length > 0
                    ? 'border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/20'
                    : 'border-white/10 hover:border-white/20'
                )}
              >
                {/* Paperclip button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!token || sending || uploadingFiles || pendingFiles.length >= 5}
                  className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] text-zinc-400 hover:text-amber-400 flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
                  title="Прикрепить чек или файл (PDF, PNG, JPG до 3 МБ)"
                  aria-label="Прикрепить чек"
                >
                  <Paperclip size={16} />
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  disabled={!token}
                  value={inputText}
                  onChange={handleInputChange}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={token ? "Задайте вопрос или прикрепите чек..." : "Войдите для отправки сообщений"}
                  className="flex-1 max-h-24 min-h-[34px] py-1.5 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed disabled:opacity-50"
                />

                <AnimatePresence mode="wait">
                  {inputText.trim() || pendingFiles.length > 0 ? (
                    <motion.button
                      key="send-btn"
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.85, opacity: 0 }}
                      disabled={sending || uploadingFiles || !token}
                      onClick={() => handleSendMessage()}
                      className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-extrabold text-xs flex items-center gap-1 shadow-[0_2px_12px_rgba(245,158,11,0.35)] active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {sending || uploadingFiles ? (
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

              <div className="mt-1.5 px-1 flex items-center justify-between text-[9px] text-zinc-500">
                <span>📎 Чеки PDF, PNG, JPG (до 3 МБ, до 5 шт.)</span>
                <span>Enter для отправки</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-Screen Image Lightbox Modal ── */}
      <AnimatePresence>
        {previewImageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImageModal(null)}
            className="fixed inset-0 z-[10000] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <a
                href={previewImageModal}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                title="Открыть в новом окне"
              >
                <ExternalLink size={16} />
              </a>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <img
              src={previewImageModal}
              alt="Увеличенный чек"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[95vw] rounded-2xl object-contain shadow-2xl border border-white/20"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
