'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageSquare, Smile, User, Sparkles } from 'lucide-react';
import Image from 'next/image';

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
  onSendMessage: (text: string, emoji?: string) => void;
  currentUserId?: string;
  userSeatId?: number | null;
}

const QUICK_EMOJIS = ['🔥', '👏', '💰', '😱', '🃏', '👍', '🎯', '🍀'];

export function BlackjackTableChat({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId,
  userSeatId,
}: BlackjackTableChatProps) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
    setShowEmojiPicker(false);
  };

  const handleQuickEmoji = (emoji: string) => {
    onSendMessage(emoji, emoji);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-x-3 bottom-4 top-16 z-50 flex flex-col rounded-2xl border border-white/10 bg-[#0c0e14]/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:top-20 sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <MessageSquare size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Чат стола</h3>
                <p className="text-[11px] text-white/40">
                  {userSeatId ? (
                    <span className="text-emerald-400 font-medium">Вы за столом (Место {userSeatId})</span>
                  ) : (
                    <span className="text-amber-400 font-medium">Режим зрителя</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Emoji Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-white/[0.02] px-3 py-2 scrollbar-none">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleQuickEmoji(emoji)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-base transition-transform hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-white/30">
                <Sparkles size={28} className="mb-2 opacity-50" />
                <p className="text-xs">Здесь пока нет сообщений.</p>
                <p className="text-[11px]">Напишите первым или отправьте реакцию!</p>
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
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-medium text-white/70">
                        {isMe ? 'Вы' : msg.name}
                      </span>
                      {isPlayer ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                          Место {msg.seatId}
                        </span>
                      ) : (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/40">
                          Зритель
                        </span>
                      )}
                      <span className="text-[9px] text-white/30">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        isMe
                          ? 'bg-emerald-600 text-white rounded-tr-xs'
                          : isPlayer
                          ? 'bg-white/10 text-white border border-emerald-500/30 rounded-tl-xs'
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
            className="border-t border-white/10 bg-[#080a0f] p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Написать за стол..."
              maxLength={200}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-black font-bold transition-opacity disabled:opacity-30"
            >
              <Send size={15} />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
