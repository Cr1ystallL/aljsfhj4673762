import { useEffect, useState } from 'react';

/**
 * Hook to prevent SSR hydration mismatches with Zustand persist
 * Use this when accessing persisted Zustand stores
 */
export function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
