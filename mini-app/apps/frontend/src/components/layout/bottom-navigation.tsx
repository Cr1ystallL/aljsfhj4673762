'use client';

import { motion } from 'framer-motion';
import { Menu, Play, User } from 'lucide-react';

interface BottomNavigationProps {
  onMenuClick: () => void;
  onPlayClick: () => void;
  onProfileClick: () => void;
}

/**
 * Bottom Navigation - Ultra Compact Style
 * 
 * DESIGN:
 * - Minimal height and padding
 * - Smaller buttons and icons
 * - Compact center Play button
 * - Tight spacing
 */
export function BottomNavigation({
  onMenuClick,
  onPlayClick,
  onProfileClick,
}: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe pointer-events-none">
      {/* Ultra compact container */}
      <div className="relative mx-2 mb-2 pointer-events-auto">
        {/* Subtle glow */}
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 blur-lg" />
        
        {/* Main container - compact */}
        <div className="relative rounded-[20px] bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-visible">
          <div className="relative flex items-center justify-between px-4 py-2">
            {/* Menu Button - Compact */}
            <motion.button
              onClick={onMenuClick}
              className="flex flex-col items-center gap-0.5 text-white/60 hover:text-white transition-all min-w-[50px]"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
            >
              <Menu size={18} strokeWidth={2} />
              <span className="text-[9px] font-medium">Menu</span>
            </motion.button>
            
            {/* Play Button - Compact Center */}
            <motion.button
              onClick={onPlayClick}
              className="relative -mt-6"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {/* Glow */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 opacity-20 blur-xl" />
              
              {/* Button - smaller */}
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                <Play size={24} fill="white" strokeWidth={0} className="ml-0.5 drop-shadow-lg" />
              </div>
            </motion.button>
            
            {/* Profile Button - Compact */}
            <motion.button
              onClick={onProfileClick}
              className="flex flex-col items-center gap-0.5 text-white/60 hover:text-white transition-all min-w-[50px]"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
            >
              <User size={18} strokeWidth={2} />
              <span className="text-[9px] font-medium">Profile</span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
