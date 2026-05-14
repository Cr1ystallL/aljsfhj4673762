'use client';

import { motion } from 'framer-motion';
import { Menu, Play, User } from 'lucide-react';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
}

/**
 * Bottom Navigation - Premium Modern Style
 * 
 * DESIGN:
 * - Dark glassmorphic effect with depth and shadows
 * - Center Play button with gradient and glow
 * - Rounded container with border glow
 * - Spacious layout with generous padding
 * - Smooth, premium interactions with hover effects
 */
export function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none">
      {/* Glassmorphic container with glow */}
      <div className="relative mx-3 mb-3 pointer-events-auto">
        {/* Outer glow effect */}
        <div className="absolute inset-0 rounded-[28px] bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 blur-xl" />
        
        {/* Main container */}
        <div className="relative rounded-[28px] bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-visible">
          {/* Subtle gradient overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-white/5 via-transparent to-white/5 pointer-events-none rounded-[28px]" />
          
          <div className="relative flex items-center justify-between px-6 py-3">
            {/* Menu Button */}
            <motion.button
              onClick={onMenuClick}
              className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-all duration-300 relative group min-w-[60px]"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
            >
              {/* Hover glow */}
              <div className="absolute inset-0 rounded-2xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
              
              <div className="relative">
                <Menu size={22} strokeWidth={2} />
              </div>
              <span className="text-[10px] font-medium tracking-wide relative">Menu</span>
            </motion.button>
            
            {/* Play Button - Compact Center with Gradient & Glow */}
            <motion.button
              onClick={onPlayClick}
              className="relative -mt-8"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Multi-layer glow effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 opacity-30 blur-2xl" />
              
              {/* Animated pulse rings */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-emerald-400/30"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              
              {/* Button with premium gradient */}
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-600 flex items-center justify-center shadow-2xl">
                {/* Inner shine effect */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                
                {/* Icon */}
                <div className="relative">
                  <Play size={32} fill="white" strokeWidth={0} className="ml-1 drop-shadow-lg" />
                </div>
              </div>
            </motion.button>
            
            {/* Profile Button */}
            <motion.button
              onClick={onProfileClick}
              className="flex flex-col items-center gap-1 text-white/60 hover:text-white transition-all duration-300 relative group min-w-[60px]"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
            >
              {/* Hover glow */}
              <div className="absolute inset-0 rounded-2xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
              
              <div className="relative">
                <User size={22} strokeWidth={2} />
              </div>
              <span className="text-[10px] font-medium tracking-wide relative">Profile</span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
