'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageSquare, Sparkles } from 'lucide-react';

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  avatar?: string;
  text: string;
  emoji?: string;
  seatId?: number | null;
  timestamp: number;
}

interface BlackjackTableChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUserId?: string;
  userSeatId?: number | null;
}

export function BlackjackTableChat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId,
  userSeatId,
}: BlackjackTableChatProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop (light tint so table is still visible) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Minimalist Slide-up Container */}
          <motion.div
            initial={{ opacity: 0, y: 150 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 150 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[48vh] max-h-[420px] min-h-[280px] flex-col rounded-t-3xl border-t border-white/15 bg-[#0a0d14]/95 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[460px] sm:w-[360px] sm:rounded-2xl sm:border sm:border-white/15"
          >
            {/* Header / Drag Bar */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                  <MessageSquare size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Чат стола</h3>
                  <p className="text-[10px] text-white/40">
                    {userSeatId ? (
                      <span className="text-emerald-400 font-semibold">Место {userSeatId}</span>
                    ) : (
                      <span className="text-amber-400">Зритель</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Mobile grab handle */}
              <div className="h-1 w-10 rounded-full bg-white/20 sm:hidden" />

              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-white/30">
                  <Sparkles size={22} className="mb-1.5 opacity-40" />
                  <p className="text-xs font-medium">Сообщений пока нет</p>
                  <p className="text-[10px] text-white/40">Напишите первым за стол!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = currentUserId && msg.userId === currentUserId;
                  const isPlayer = !!msg.seatId;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5 px-1">
                        <span className="text-[10px] font-semibold text-white/70">
                          {isMe ? 'Вы' : msg.name}
                        </span>
                        {isPlayer ? (
                          <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[8px] font-bold text-emerald-300">
                            #{msg.seatId}
                          </span>
                        ) : (
                          <span className="rounded bg-white/10 px-1 py-0.2 text-[8px] text-white/40">
                            Зритель
                          </span>
                        )}
                        <span className="text-[8px] text-white/30">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${
                          isMe
                            ? 'bg-emerald-600 text-white rounded-tr-xs shadow-md font-medium'
                            : isPlayer
                            ? 'bg-white/10 text-white border border-emerald-500/30 rounded-tl-xs shadow-sm'
                            : 'bg-white/5 text-white/90 rounded-tl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-white/10 bg-[#06080d] p-2.5 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Сообщение за стол..."
                maxLength={200}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-black font-bold transition-opacity disabled:opacity-30 active:scale-95"
              >
                <Send size={14} />
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

