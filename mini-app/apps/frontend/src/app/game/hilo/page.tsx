import { Metadata } from 'next';
import { HiloClient } from './hilo-client';

export const metadata: Metadata = {
  title: 'Hi-Lo',
};

export default function HiloPage() {
  return <HiloClient />;
}
