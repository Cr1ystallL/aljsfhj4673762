'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageSquare, Sparkles } from 'lucide-react';
import { BJPlayer } from './blackjack-multiplayer';
import { UserAvatar } from '@/components/ui/user-avatar';

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
  players?: BJPlayer[];
}

export function BlackjackTableChat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId,
  players = [],
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

  const mySeat = players.find((p) => p.userId === currentUserId)?.seatId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px]"
          />

          {/* Minimalist Transparent Liquid Glass Drawer */}
          <motion.div
            initial={{ opacity: 0, y: 150, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 150, scale: 0.96 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[52vh] max-h-[460px] min-h-[300px] flex-col rounded-t-3xl border-t border-amber-500/25 bg-black/80 shadow-[0_-15px_50px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(255,255,255,0.12)] backdrop-blur-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[500px] sm:w-[380px] sm:rounded-2xl sm:border sm:border-amber-500/25"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-400/20">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide">ЧАТ СТОЛА</h3>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    {mySeat ? (
                      <span className="text-amber-400 font-bold">Игрок (Место #{mySeat})</span>
                    ) : (
                      <span className="text-white/40">Зритель</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile grab bar */}
              <div className="h-1 w-10 rounded-full bg-white/20 sm:hidden" />

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X size={17} />
              </button>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-white/30">
                  <Sparkles size={24} className="mb-2 text-amber-400/40 animate-pulse" />
                  <p className="text-xs font-medium text-white/60">Сообщений пока нет</p>
                  <p className="text-[10px] text-white/40">Напишите первым за стол!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = currentUserId && msg.userId === currentUserId;
                  const seatedPlayer = players.find((p) => p.userId === msg.userId);
                  const effectiveSeatId = msg.seatId || seatedPlayer?.seatId;
                  const isPlayer = !!effectiveSeatId;
                  const avatarSrc = msg.avatar || seatedPlayer?.avatar;

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* User Avatar with VIP Badge */}
                      <UserAvatar
                        photoUrl={avatarSrc}
                        name={msg.name}
                        size="sm"
                        className="shrink-0"
                      />

                      {/* Message Bubble */}
                      <div
                        className={`flex flex-col max-w-[78%] rounded-2xl p-2.5 shadow-lg backdrop-blur-md ${
                          isMe
                            ? 'bg-amber-500/15 border border-amber-400/35 rounded-tr-xs text-right'
                            : isPlayer
                            ? 'bg-white/[0.07] border border-amber-400/25 rounded-tl-xs text-left'
                            : 'bg-white/[0.04] border border-white/10 rounded-tl-xs text-left'
                        }`}
                      >
                        {/* Header Inside Bubble (Name, Role Badge, Time) */}
                        <div
                          className={`flex items-center gap-1.5 mb-1 ${
                            isMe ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span className="text-[11px] font-bold text-amber-300/90 truncate max-w-[110px]">
                            {isMe ? 'Вы' : msg.name}
                          </span>

                          {isPlayer ? (
                            <span className="rounded-full bg-amber-400/20 border border-amber-400/30 px-1.5 py-0.2 text-[8px] font-black text-amber-300">
                              #{effectiveSeatId}
                            </span>
                          ) : (
                            <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[8px] text-white/40">
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

                        {/* Message Text */}
                        <p className="text-xs text-white/90 leading-relaxed break-words select-text">
                          {msg.text}
                        </p>
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
              className="border-t border-white/10 bg-black/60 p-2.5 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Сообщение за стол..."
                maxLength={200}
                className="flex-1 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-white/30 focus:border-amber-400/60 focus:outline-none backdrop-blur-md"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-black font-bold shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
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
