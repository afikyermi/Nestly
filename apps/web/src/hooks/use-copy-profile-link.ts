import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { userProfilePath } from '@/lib/profile-link';
import { readOwnUserId } from '@/services/session/own-user-id';
import type { BrowserClipboard } from '@/platform/browser-clipboard';
import { useSessionAccount } from './use-session-account';

/** Where the app lives and the clipboard: App provides the real ones, a test or story its own. */
export interface LinkCopier extends BrowserClipboard {
  origin(): string;
}

// Without a provider nothing can be copied and the app's address is unknown: the button then shows its failure text.
export const LinkCopierContext = createContext<LinkCopier>({ origin: () => '', writeText: () => Promise.resolve(false) });

/** idle · copied: on the clipboard · shown: the clipboard refused, the link is shown to be selected · failed: no link could be made. */
export type CopyLinkState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'shown'; link: string } | { kind: 'failed' };

export interface CopyProfileLink {
  state: CopyLinkState;
  busy: boolean;
  copy: () => void;
}

// The copy-my-profile-link button's state (F2.4c2 c26, DR-1 A). The link is the absolute address of the caller's own profile page and
// holds the user id only. The id comes from Auth for the held session (else the access token's `sub`); nothing is trusted because of it (the server decides by
// the token on every open). A second press while copying does nothing (the guard is a ref).
export function useCopyProfileLink(): CopyProfileLink {
  const account = useSessionAccount();
  const copier = useContext(LinkCopierContext);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<CopyLinkState>({ kind: 'idle' });

  const copy = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    void (async () => {
      try {
        const userId = await readOwnUserId(account);
        const origin = copier.origin();
        if (userId === null || origin === '') {
          setState({ kind: 'failed' });
          return;
        }
        const link = origin + userProfilePath(userId);
        setState((await copier.writeText(link)) ? { kind: 'copied' } : { kind: 'shown', link });
      } finally {
        running.current = false;
        setBusy(false);
      }
    })();
  }, [account, copier]);

  return { state, busy, copy };
}
