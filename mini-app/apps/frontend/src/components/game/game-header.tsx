'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Info, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { H3, Caption } from '@/components/ui/typography';
import { soundManager } from '@/lib/sound/sound-manager';

/**
 * Game Header Component
 * Reusable header for all game screens
 * 
 * Features:
 * - Back navigation
 * - Game title
 * - Round ID display
 * - Sound toggle
 * - Provably fair info
 */

interface GameHeaderProps {
  title: string;
  roundId?: string;
  onShowProvablyFair?: () => void;
}

export function GameHeader({ title, roundId, onShowProvablyFair }: GameHeaderProps) {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(soundManager.isMuted());

  const handleBack = () => {
    router.push('/');
  };

  const handleToggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        {/* Left: Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {/* Center: Title & Round */}
        <div className="flex-1 text-center">
          <H3 className="mb-0">{title}</H3>
          {roundId && (
            <Caption className="text-white/40">
              Round: {roundId.substring(0, 8)}...
            </Caption>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {onShowProvablyFair && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowProvablyFair}
              className="hidden sm:flex"
            >
              <Info className="h-4 w-4" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleSound}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
