import { Metadata } from 'next';
import { CardsClient } from './cards-client';

export const metadata: Metadata = {
  title: 'Card Games',
};

export default function CardsPage() {
  return <CardsClient />;
}
