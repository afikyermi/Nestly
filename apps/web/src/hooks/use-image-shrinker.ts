import { createContext, useContext } from 'react';
import type { ImageShrinker } from '@/platform/browser-image';

// The browser's image shrinker (I5), wired in app/App.tsx. The default refuses every file: a screen outside the app shows ERR-039 instead
// of sending an unshrunk picture.
export const ImageShrinkerContext = createContext<ImageShrinker>({ shrink: () => Promise.resolve({ ok: false }) });

export function useImageShrinker(): ImageShrinker {
  return useContext(ImageShrinkerContext);
}
