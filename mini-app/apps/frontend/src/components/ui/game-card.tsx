'use client';

import { motion } from 'framer-motion';
import { GlassCard } from './glass-card';
import { Play } from 'lucide-react';

interface GameCardProps {
  id: string;
  name: string;
  icon: string;
  description?: string;
  players?: number;
  onClick?: () => void;
}

/**
 * Game card component with hover effects
 * Used in game grid and featured sections
 */
export function GameCard({ 
  id, 
  name, 
  icon, 
  description,
  players,
  onClick 
}: GameCardProps) {
  return (
    <GlassCard 
      hover 
      onClick={onClick}
      className="cursor-pointer group relative overflow-hidden"
    >
      <div className="p-6">
        {/* Icon */}
        <div className="text-5xl mb-4">{icon}</div>
        
        {/* Name */}
        <h3 className="text-xl font-bold text-white mb-1">{name}</h3>
        
        {/* Description */}
        {description && (
          <p className="text-sm text-white/60 mb-3">{description}</p>
        )}
        
        {/* Players count */}
        {players !== undefined && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span>{players} playing</span>
          </div>
        )}
        
        {/* Play button overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          initial={false}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play size={28} fill="white" strokeWidth={0} className="ml-1" />
          </div>
        </motion.div>
      </div>
    </GlassCard>
  );
}
