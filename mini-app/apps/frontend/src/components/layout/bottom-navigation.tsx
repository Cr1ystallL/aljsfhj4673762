'use client';

import { motion } from 'framer-motion';
import { Menu, Play, User } from 'lucide-react';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
}

/**
 * Bottom Navigation - Monopo Saigon Style
 * 
 * DESIGN:
 * - Floating glass effect with subtle depth
 * - Center Play button dominant with animated pulse
 * - Pill-shaped container
 * - Spacious layout with generous padding
 * - Smooth, premium interactions
 */
export function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      {/* Glassmorphic container */}
      <div className="relative mx-4 mb-4 rounded-pill glass-strong border border-white/20 overflow-hidden">
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent pointer-events-none" />
        
        <div className="relative flex items-center justify-between px-8 py-4">
          {/* Menu Button */}
          <motion.button
            onClick={onMenuClick}
            className="flex flex-col items-center gap-1 text-whisper-gray hover:text-frost-white transition-all duration-300"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            <Menu size={24} strokeWidth={1.5} />
            <span className="text-caption font-roobert">Menu</span>
          </motion.button>
          
          {/* Play Button - Dominant Center with Pulse */}
          <motion.button
            onClick={onPlayClick}
            className="relative -mt-10"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* Soft glow - atmospheric */}
            <div className="absolute inset-0 rounded-full bg-gradient-ocean opacity-25 blur-2xl" />
            
            {/* Animated pulse rings */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white/30"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.6, 0, 0.6],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white/20"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.4, 0, 0.4],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
            />
            
            {/* Button with gradient */}
            <div className="relative w-24 h-24 rounded-full bg-gradient-ocean flex items-center justify-center shadow-2xl">
              <Play size={36} fill="white" strokeWidth={0} className="ml-1" />
            </div>
          </motion.button>
          
          {/* Profile Button */}
          <motion.button
            onClick={onProfileClick}
            className="flex flex-col items-center gap-1 text-whisper-gray hover:text-frost-white transition-all duration-300"
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
          >
            <User size={24} strokeWidth={1.5} />
            <span className="text-caption font-roobert">Profile</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
