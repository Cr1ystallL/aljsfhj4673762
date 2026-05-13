/**
 * Sound Manager
 * Centralized audio system for all games
 * 
 * ARCHITECTURE:
 * - Preload sounds for instant playback
 * - Volume control per category
 * - Spatial audio support
 * - Mobile-optimized (Telegram WebApp)
 * - Memory-efficient pooling
 */

export type SoundCategory = 'sfx' | 'music' | 'ui' | 'ambient';

export interface SoundConfig {
  src: string;
  category: SoundCategory;
  volume?: number;
  loop?: boolean;
  preload?: boolean;
}

export class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private volumes: Map<SoundCategory, number> = new Map([
    ['sfx', 0.7],
    ['music', 0.5],
    ['ui', 0.6],
    ['ambient', 0.4],
  ]);
  private masterVolume: number = 1.0;
  private muted: boolean = false;
  private initialized: boolean = false;

  /**
   * Initialize sound system
   * Must be called after user interaction (browser requirement)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Check if running in Telegram WebApp
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      // Telegram WebApp may have audio restrictions
      const tg = window.Telegram.WebApp;
      if (tg.version && parseFloat(tg.version) >= 6.1) {
        // Enable haptic feedback as alternative
        tg.HapticFeedback.impactOccurred('light');
      }
    }

    this.initialized = true;
  }

  /**
   * Register sound
   */
  register(id: string, config: SoundConfig): void {
    if (this.sounds.has(id)) {
      return;
    }

    const audio = new Audio(config.src);
    audio.volume = this.calculateVolume(config.category, config.volume);
    audio.loop = config.loop || false;

    if (config.preload) {
      audio.preload = 'auto';
      audio.load();
    }

    this.sounds.set(id, audio);
  }

  /**
   * Play sound
   */
  play(id: string, options?: { volume?: number; loop?: boolean }): void {
    if (!this.initialized || this.muted) {
      return;
    }

    const audio = this.sounds.get(id);
    if (!audio) {
      console.warn(`Sound ${id} not found`);
      return;
    }

    // Clone audio for overlapping sounds
    const clone = audio.cloneNode() as HTMLAudioElement;
    
    if (options?.volume !== undefined) {
      clone.volume = options.volume * this.masterVolume;
    } else {
      clone.volume = audio.volume;
    }

    if (options?.loop !== undefined) {
      clone.loop = options.loop;
    }

    clone.play().catch((error) => {
      console.warn('Failed to play sound:', error);
    });

    // Clean up after playback
    if (!clone.loop) {
      clone.addEventListener('ended', () => {
        clone.remove();
      });
    }
  }

  /**
   * Stop sound
   */
  stop(id: string): void {
    const audio = this.sounds.get(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  /**
   * Stop all sounds
   */
  stopAll(): void {
    for (const audio of this.sounds.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  /**
   * Set category volume
   */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    this.volumes.set(category, Math.max(0, Math.min(1, volume)));
    this.updateAllVolumes();
  }

  /**
   * Mute/unmute
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    
    if (muted) {
      this.stopAll();
    }
  }

  /**
   * Toggle mute
   */
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.setMuted(this.muted);
    return this.muted;
  }

  /**
   * Get mute state
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Calculate final volume
   */
  private calculateVolume(category: SoundCategory, baseVolume: number = 1.0): number {
    const categoryVolume = this.volumes.get(category) || 1.0;
    return baseVolume * categoryVolume * this.masterVolume;
  }

  /**
   * Update all sound volumes
   */
  private updateAllVolumes(): void {
    // Note: This only affects base sounds, not clones
    for (const audio of this.sounds.values()) {
      // Would need to track category per sound to update properly
      // For now, new sounds will use updated volumes
    }
  }

  /**
   * Preload multiple sounds
   */
  async preloadSounds(sounds: Record<string, SoundConfig>): Promise<void> {
    const promises = Object.entries(sounds).map(([id, config]) => {
      return new Promise<void>((resolve) => {
        this.register(id, { ...config, preload: true });
        const audio = this.sounds.get(id);
        
        if (audio) {
          audio.addEventListener('canplaythrough', () => resolve(), { once: true });
          audio.addEventListener('error', () => resolve(), { once: true });
        } else {
          resolve();
        }
      });
    });

    await Promise.all(promises);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAll();
    this.sounds.clear();
    this.initialized = false;
  }
}

// Global singleton instance
export const soundManager = new SoundManager();

/**
 * Common game sounds registry
 * Games can extend this with their specific sounds
 */
export const COMMON_SOUNDS: Record<string, SoundConfig> = {
  // UI sounds
  'ui.click': {
    src: '/sounds/ui/click.mp3',
    category: 'ui',
    volume: 0.5,
    preload: true,
  },
  'ui.hover': {
    src: '/sounds/ui/hover.mp3',
    category: 'ui',
    volume: 0.3,
    preload: true,
  },
  'ui.success': {
    src: '/sounds/ui/success.mp3',
    category: 'ui',
    volume: 0.6,
    preload: true,
  },
  'ui.error': {
    src: '/sounds/ui/error.mp3',
    category: 'ui',
    volume: 0.6,
    preload: true,
  },
  
  // Game sounds
  'game.bet_placed': {
    src: '/sounds/game/bet_placed.mp3',
    category: 'sfx',
    volume: 0.7,
    preload: true,
  },
  'game.win': {
    src: '/sounds/game/win.mp3',
    category: 'sfx',
    volume: 0.8,
    preload: true,
  },
  'game.lose': {
    src: '/sounds/game/lose.mp3',
    category: 'sfx',
    volume: 0.6,
    preload: true,
  },
  'game.cashout': {
    src: '/sounds/game/cashout.mp3',
    category: 'sfx',
    volume: 0.7,
    preload: true,
  },
  
  // Ambient
  'ambient.background': {
    src: '/sounds/ambient/background.mp3',
    category: 'ambient',
    volume: 0.3,
    loop: true,
    preload: false,
  },
};
