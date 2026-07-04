'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useBlackjackGame } from '@/hooks/useBlackjackGame';
import { PlayingCard, CardData } from '@/components/game/hilo/playing-card';
import { calculateHandValue } from '@/hooks/useBlackjackGame';
import { useState } from 'react';

function HandValueIndicator({ hand, isDealer = false, hidden = false }: { hand: CardData[], isDealer?: boolean, hidden?: boolean }) {
  if (hand.length === 0 || hidden) return null;
  const { total, isSoft } = calculateHandValue(hand);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white font-bold text-sm z-10"
    >
      {isSoft && !isDealer && total !== 21 ? `${total - 10}/${total}` : total}
    </motion.div>
  );
}

function PlayerSeatComponent({ 
  seat, 
  index, 
  isActive, 
  onSit, 
  onBet,
  gameState
}: { 
  seat: any; 
  index: number; 
  isActive: boolean; 
  onSit: () => void; 
  onBet: (amount: number) => void;
  gameState: string;
}) {
  const [betAmount, setBetAmount] = useState(10);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'WON': case 'BLACKJACK': return 'text-green-400 border-green-500/50 bg-green-500/20';
      case 'LOST': case 'BUSTED': return 'text-red-400 border-red-500/50 bg-red-500/20';
      case 'PUSH': return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/20';
      default: return 'text-white border-white/10 bg-black/40';
    }
  };

  const statusText = {
    WON: 'Победа',
    LOST: 'Поражение',
    BUSTED: 'Перебор',
    BLACKJACK: 'Blackjack!',
    PUSH: 'Ничья',
  }[seat.status as string];

  return (
    <div className={`relative flex flex-col items-center justify-end w-32 h-48 transition-all duration-300 ${isActive ? 'scale-110 z-20' : 'scale-100 z-10'}`}>
      {/* Hand Value */}
      <HandValueIndicator hand={seat.hand} />
      
      {/* Cards */}
      <div className="relative w-full h-24 mb-4 flex justify-center items-end">
        <AnimatePresence>
          {seat.hand.map((card: CardData, i: number) => (
            <div key={`${card.rank}-${card.suit}-${i}`} className="absolute" style={{ left: `calc(50% + ${(i - (seat.hand.length-1)/2) * 20}px)`, transform: 'translateX(-50%)' }}>
               <PlayingCard card={card} direction="none" className="w-16 h-24 shadow-2xl" />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Seat Area */}
      <div className={`relative w-24 h-24 rounded-full flex flex-col items-center justify-center border-2 backdrop-blur-md transition-all ${getStatusColor(seat.status)} ${isActive ? 'ring-4 ring-macvbet-yellow/50 shadow-[0_0_20px_rgba(255,172,46,0.3)]' : ''}`}>
        
        {statusText && (
          <div className="absolute -top-10 whitespace-nowrap font-bold text-sm px-3 py-1 rounded-full bg-black/80 backdrop-blur-md">
            {statusText}
          </div>
        )}

        {seat.status === 'EMPTY' && gameState === 'WAITING' && (
          <button onClick={onSit} className="text-xs font-bold uppercase tracking-wider hover:text-macvbet-yellow transition-colors">
            Сесть
          </button>
        )}
        
        {seat.status === 'WAITING' && gameState === 'BETTING' && (
          <div className="flex flex-col items-center gap-1">
             <span className="text-xs text-white/50">Ставка</span>
             <div className="flex gap-1 items-center">
               <button onClick={() => setBetAmount(Math.max(1, betAmount - 10))} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">-</button>
               <span className="font-bold">{betAmount}</span>
               <button onClick={() => setBetAmount(betAmount + 10)} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">+</button>
             </div>
             <button onClick={() => onBet(betAmount)} className="mt-1 text-[10px] uppercase font-bold bg-macvbet-yellow text-black px-2 py-0.5 rounded-full hover:brightness-110">
               Поставить
             </button>
          </div>
        )}

        {(seat.status === 'BETTING' || seat.bet > 0) && (
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-macvbet-yellow to-orange-500 border-2 border-white/20 flex items-center justify-center shadow-lg mb-1">
              <span className="text-black font-bold text-xs">{seat.bet}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BlackjackClient() {
  const { state, sitDown, placeBet, hit, stand, doubleDown } = useBlackjackGame();

  return (
    <div className="min-h-screen bg-midnight-canvas text-white flex flex-col font-roobert overflow-hidden">
      {/* Top bar / Dealer Area */}
      <div className="relative flex-1 flex flex-col items-center justify-start pt-20">
        
        {/* Table Felt */}
        <div className="absolute inset-0 top-1/4 rounded-t-[100%] bg-gradient-ocean opacity-20 blur-3xl pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 top-[30%] bg-emerald-900/40 border-t border-emerald-500/20 shadow-[inset_0_20px_50px_rgba(0,0,0,0.5)] rounded-t-[40%] sm:rounded-t-[50%] pointer-events-none" />

        <div className="z-10 flex flex-col items-center">
          <div className="mb-2 text-white/50 text-sm tracking-[0.2em] uppercase font-semibold">Dealer</div>
          
          <div className="relative w-full h-32 flex justify-center items-center">
             <HandValueIndicator 
               hand={state.dealerHand} 
               isDealer={true} 
               hidden={state.status !== 'DEALER_TURN' && state.status !== 'PAYOUT' && state.dealerHand.length === 2} 
             />
             <AnimatePresence>
              {state.dealerHand.map((card, i) => (
                <div key={i} className="absolute" style={{ left: `calc(50% + ${(i - (state.dealerHand.length-1)/2) * 25}px)`, transform: 'translateX(-50%)' }}>
                   {i === 1 && state.status !== 'DEALER_TURN' && state.status !== 'PAYOUT' ? (
                     <PlayingCard card={null} direction="none" className="w-20 h-28 shadow-2xl" /> // Hidden card
                   ) : (
                     <PlayingCard card={card} direction="none" className="w-20 h-28 shadow-2xl" />
                   )}
                </div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Info Banner */}
        {state.notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-1/3 left-1/2 -translate-x-1/2 z-30 px-6 py-2 bg-red-500/80 backdrop-blur-md rounded-full text-white font-bold text-xl shadow-2xl border border-white/20"
          >
            {state.notification}
          </motion.div>
        )}

        {state.status === 'BETTING' && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute top-[35%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10"
          >
            <span className="text-white/60 text-sm mb-1 uppercase tracking-wider">Ожидание ставок</span>
            <span className="text-3xl font-bold font-mono text-macvbet-yellow">{state.bettingTimeLeft}s</span>
          </motion.div>
        )}
      </div>

      {/* Players Area */}
      <div className="relative h-64 flex justify-center items-end pb-12 z-20 gap-2 sm:gap-6">
        {state.seats.map((seat, i) => (
          <PlayerSeatComponent 
            key={seat.id}
            seat={seat}
            index={i}
            isActive={state.activeSeatIndex === i}
            onSit={() => sitDown(i)}
            onBet={(amount) => placeBet(i, amount)}
            gameState={state.status}
          />
        ))}
      </div>

      {/* Action Controls */}
      <div className="h-24 bg-black/80 backdrop-blur-xl border-t border-white/10 flex items-center justify-center gap-4 z-30 relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
         <AnimatePresence>
           {state.status === 'PLAYER_TURN' && state.activeSeatIndex !== -1 && (
             <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 20, opacity: 0 }}
               className="flex gap-4"
             >
               <button onClick={hit} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105 transition-all text-white font-bold tracking-wider">
                 ЕЩЕ
               </button>
               <button onClick={stand} className="px-6 py-3 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 hover:scale-105 transition-all text-red-200 font-bold tracking-wider">
                 ХВАТИТ
               </button>
               {state.seats[state.activeSeatIndex]?.hand.length === 2 && (
                  <button onClick={doubleDown} className="px-6 py-3 rounded-full bg-macvbet-yellow/20 border border-macvbet-yellow/50 hover:bg-macvbet-yellow/30 hover:scale-105 transition-all text-macvbet-yellow font-bold tracking-wider flex items-center gap-2">
                    <span>X2</span> УДВОИТЬ
                  </button>
               )}
             </motion.div>
           )}
         </AnimatePresence>

         {state.status === 'WAITING' && (
           <div className="text-white/40 tracking-widest uppercase text-sm font-semibold">
              Займите свободное место
           </div>
         )}
      </div>

    </div>
  );
}
