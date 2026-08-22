export const STREAK_MARKS = 3;

export function StreakPips({ n, marks = STREAK_MARKS }: { n: number; marks?: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: marks }, (_, i) => (
        <span
          key={i}
          className={
            i < n
              ? 'h-1 w-5 rounded-full bg-[#F4E8C8]'
              : 'h-1 w-5 rounded-full bg-white/12'
          }
        />
      ))}
    </div>
  );
}
