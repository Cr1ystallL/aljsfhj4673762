import { Metadata } from 'next';
import { BlackjackMultiplayer } from '@/components/game/blackjack/blackjack-multiplayer';

export const metadata: Metadata = {
  title: 'Blackjack Live',
};

export default function BlackjackPage() {
  return <BlackjackMultiplayer />;
}
