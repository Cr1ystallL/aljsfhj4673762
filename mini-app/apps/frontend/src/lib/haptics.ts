'use client';

/**
 * Telegram WebApp Haptic Feedback Utility
 * 
 * Provides tactile feedback on mobile devices for game actions:
 * - Impact: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
 * - Notification: 'success' | 'warning' | 'error'
 * - Selection: selection change tick
 */

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'success' | 'warning' | 'error';

class HapticsService {
  private get haptic() {
    if (typeof window === 'undefined') return null;
    return (window as any).Telegram?.WebApp?.HapticFeedback ?? null;
  }

  /**
   * Triggers an impact tactile pulse (card flip, coin toss, dice roll, button press)
   */
  impact(style: ImpactStyle = 'medium') {
    try {
      this.haptic?.impactOccurred(style);
    } catch {
      // Ignore if not supported or outside Telegram
    }
  }

  /**
   * Triggers a notification tactile pattern (win, cashout, loss, alert)
   */
  notification(type: NotificationType) {
    try {
      this.haptic?.notificationOccurred(type);
    } catch {
      // Ignore
    }
  }

  /**
   * Triggers a light selection tick (wheel sector tick, number pick, slider step)
   */
  selection() {
    try {
      this.haptic?.selectionChanged();
    } catch {
      // Ignore
    }
  }
}

export const haptics = new HapticsService();
