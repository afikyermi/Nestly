import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isOverlayState, overlayState } from '@/lib/history-overlay';

export interface BackCloses {
  /** Leave for another screen from the open overlay: its entry is replaced, so Back from there returns to this screen, not to the overlay. */
  leaveTo: (path: string) => void;
}

// Back closes an open overlay and stays on the screen (direction.md "דפוסי אינטראקציה"; F3.9 c8, c13). While `open`, one history entry with
// the same address sits on top of the screen's; Back removes it and calls onBack. Closed any other way (Esc, an outside click, an item), the
// entry is taken back. One entry for the whole time something is open, so going from a menu to its confirmation adds nothing.
export function useBackCloses(open: boolean, onBack: () => void): BackCloses {
  const location = useLocation();
  const navigate = useNavigate();
  const pushed = useRef(false);
  const back = useRef(onBack);
  back.current = onBack;
  // The address the overlay entry repeats, read when it is added: only the open state decides when that happens.
  const here = useRef(location);
  here.current = location;

  useEffect(() => {
    if (open && !pushed.current) {
      pushed.current = true;
      const { pathname, search, hash } = here.current;
      const state: unknown = here.current.state;
      void navigate({ pathname, search, hash }, { state: overlayState(state) });
    } else if (!open && pushed.current) {
      pushed.current = false;
      void navigate(-1);
    }
  }, [open, navigate]);

  useEffect(() => {
    if (pushed.current && !isOverlayState(location.state)) {
      pushed.current = false;
      back.current();
    }
  }, [location]);

  const leaveTo = useCallback(
    (path: string) => {
      const replace = pushed.current;
      pushed.current = false;
      void navigate(path, { replace });
    },
    [navigate],
  );

  return { leaveTo };
}
