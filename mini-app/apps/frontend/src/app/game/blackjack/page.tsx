import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blackjack',
};

export default function BlackjackPage() {
  return (
    <main className="min-h-screen bg-midnight-canvas text-frost-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="font-roobert text-[22px]">BLACKJACK</p>
        <p className="font-roobert text-[14px] text-whisper-gray">Скоро здесь появится игра.</p>
      </div>
    </main>
  );
}
