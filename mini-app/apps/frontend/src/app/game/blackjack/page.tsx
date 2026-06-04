import { Metadata } from 'next';
import { BlackjackClient } from './blackjack-client';

export const metadata: Metadata = {
  title: 'Blackjack',
};

export default function BlackjackPage() {
  return <BlackjackClient />;
}
