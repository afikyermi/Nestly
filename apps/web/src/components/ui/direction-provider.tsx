import type { ReactNode } from 'react';
import { Direction } from 'radix-ui';

interface DirectionProviderProps {
  children: ReactNode;
}

// The one place Radix is told the reading direction (Hebrew, right to left), so
// every Radix primitive opens, positions and moves focus the right way round.
// The document root carries the same direction (index.html).
export function DirectionProvider({ children }: DirectionProviderProps) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>;
}
