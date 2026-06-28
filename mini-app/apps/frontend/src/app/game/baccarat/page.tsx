import { Metadata } from 'next';
import { BaccaratClient } from './baccarat-client';

export const metadata: Metadata = {
  title: 'Baccarat',
};

export default function BaccaratPage() {
  return <BaccaratClient />;
}
