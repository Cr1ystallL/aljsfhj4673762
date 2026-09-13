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
  CreditCard,
  Zap,
  Gift,
  Gamepad2,
  MessageSquare,
  Paperclip,
  FileText,
  X,
} from 'lucide-react';
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
  { id: 'deposit', label: 'Проблема с депозитом', icon: CreditCard, hint: 'Не поступил депозит BLIK / Крипто' },
  { id: 'withdrawal', label: 'Вопрос по выводу', icon: Zap, hint: 'Статус заявки на вывод' },
  { id: 'bonus', label: 'Бонусы и вейджер', icon: Gift, hint: 'Как закрыть или активировать бонус' },
  { id: 'game', label: 'Ошибка в игре', icon: Gamepad2, hint: 'Завис раунд или расчет ставки' },
  { id: 'general', label: 'Другой вопрос', icon: MessageSquare, hint: 'Связаться с дежурным оператором' },
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
          category: categoryOverride || activeCategory,
          attachments: uploadedAttachments,
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
    setInputText(`Здравствуйте! У меня вопрос по теме «${topic.label}»: `);
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

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Headphones size={18} className="text-amber-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-white">
                Поддержка MACVBET
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Ответ ~2-30 мин.
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
                  {QUICK_TOPICS.map((topic) => {
                    const Icon = topic.icon;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => handleSelectTopic(topic)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer text-left active:scale-95',
                          activeCategory === topic.id
                            ? 'bg-amber-400/15 border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                            : 'bg-white/[0.03] border-white/10 text-zinc-300 hover:border-white/20 hover:text-white'
                        )}
                      >
                        <Icon size={14} className="text-amber-400 shrink-0" />
                        <span>{topic.label}</span>
                      </button>
                    );
                  })}
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

                      {/* Attachments rendering */}
                      {m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          {m.attachments.map((att: any, idx: number) => {
                            const isImg =
                              att.type?.startsWith('image/') ||
                              /\.(png|jpe?g|webp)$/i.test(att.url || att.name);
                            if (isImg) {
                              return (
                                <div
                                  key={idx}
                                  className="relative group rounded-xl overflow-hidden border border-white/15 bg-black/40 max-w-[280px]"
                                >
                                  <img
                                    src={att.url}
                                    alt={att.name || 'Прикрепленный чек'}
                                    className="w-full max-h-56 object-contain rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
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
                                className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors group cursor-pointer max-w-[300px]"
                              >
                                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                                  <FileText size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12px] font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
                                    {att.name || 'Чек / квитанция PDF'}
                                  </p>
                                  <p className="text-[10px] text-zinc-400">
                                    PDF • {formatFileSize(att.size)}
                                  </p>
                                </div>
                                <ExternalLink size={13} className="text-zinc-500 group-hover:text-white shrink-0 mr-1" />
                              </a>
                            );
                          })}
                        </div>
                      )}

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
      <footer className="shrink-0 p-3 bg-[#0C0E17] border-t border-white/10 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto">
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
            <div className="mb-2.5 p-2.5 rounded-2xl bg-[#131620] border border-white/10 space-y-1.5 shadow-lg">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span className="font-semibold text-zinc-300">
                  Прикрепленные чеки / файлы ({pendingFiles.length}/5):
                </span>
                <span className="text-[10px] text-zinc-500">макс. 3 МБ</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                {pendingFiles.map((p) => (
                  <div
                    key={p.id}
                    className="relative shrink-0 group rounded-xl overflow-hidden border border-white/15 bg-black/40 p-1 flex items-center gap-2"
                  >
                    {p.isImage ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black shrink-0">
                        <img
                          src={p.previewUrl}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-rose-500/15 border border-rose-500/20 flex flex-col items-center justify-center text-rose-400 shrink-0">
                        <FileText size={18} />
                        <span className="text-[8px] font-bold mt-0.5">PDF</span>
                      </div>
                    )}

                    <div className="max-w-[110px] pr-5">
                      <p className="text-[11px] font-medium text-white truncate">{p.name}</p>
                      <p className="text-[9.5px] text-zinc-400">{formatFileSize(p.size)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removePendingFile(p.id)}
                      className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500/80 hover:bg-rose-500 text-white flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                      aria-label="Удалить файл"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}

                {pendingFiles.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-12 px-3 rounded-xl border border-dashed border-white/20 hover:border-amber-400/50 hover:bg-white/[0.03] text-zinc-400 hover:text-amber-400 flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0 cursor-pointer"
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
              'flex items-end gap-2 p-1.5 pl-2.5 rounded-2xl bg-[#13161F] border transition-all duration-200',
              inputText.trim() || pendingFiles.length > 0
                ? 'border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/20'
                : 'border-white/10 hover:border-white/20'
            )}
          >
            {/* Paperclip attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || uploadingFiles || pendingFiles.length >= 5}
              className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] text-zinc-400 hover:text-amber-400 flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 cursor-pointer"
              title="Прикрепить чек или файл (PDF, PNG, JPG до 3 МБ)"
              aria-label="Прикрепить чек"
            >
              <Paperclip size={18} />
            </button>

            {/* Auto-growing clean textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder="Напишите ваш вопрос или прикрепите чек..."
              className="flex-1 max-h-28 min-h-[38px] py-2 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
            />

            {/* Tactile Engineered Action Button (Strictly Anti-AI Slop) */}
            <AnimatePresence mode="wait">
              {inputText.trim() || pendingFiles.length > 0 ? (
                <motion.button
                  key="active-send"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  disabled={sending || uploadingFiles}
                  onClick={() => handleSendMessage()}
                  className="h-10 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_14px_rgba(245,158,11,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  aria-label="Отправить сообщение"
                >
                  {sending || uploadingFiles ? (
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
            <span>📎 Чеки PDF, PNG, JPG, WEBP (до 3 МБ, до 5 шт.)</span>
            <span>Enter для отправки • Shift+Enter новая строка</span>
          </div>
        </div>
      </footer>

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
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                title="Открыть в новом окне"
              >
                <ExternalLink size={18} />
              </a>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Закрыть"
              >
                <X size={20} />
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
    </div>
  );
}
