import { Metadata } from 'next';
import { BlackjackClient } from '@/components/game/blackjack/blackjack-client';

export const metadata: Metadata = {
  title: 'Blackjack',
};

export default function BlackjackPage() {
  return <BlackjackClient />;
}
