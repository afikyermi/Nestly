import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccountKind } from '@nestly/shared';
import { fetchAccountKind } from '@/services/api/professionals';
import { useSessionAccount } from './use-session-account';

/** loading · the account's kind · unknown (the answer did not come: the screens behave as for a Regular account). */
export type AccountKindState = 'loading' | AccountKind | 'unknown';

// Asks the server once per mount which product the signed-in account gets (I11: a Professional's home, menu and composer). Presentation only:
// every call is checked again by the database, and an unanswered question shows the Regular screens, which the server refuses where they do not apply.
export function useAccountKindQuery(): AccountKindState {
  const account = useSessionAccount();
  const [state, setState] = useState<AccountKindState>('loading');
  useEffect(() => {
    let current = true;
    void (async () => {
      const token = account === null ? null : await account.getAccessToken().catch(() => null);
      const result = token === null ? ({ kind: 'failed' } as const) : await fetchAccountKind(token);
      if (current) setState(result.kind === 'ok' ? result.value : 'unknown');
    })();
    return () => {
      current = false;
    };
  }, [account]);
  return state;
}

const AccountKindContext = createContext<AccountKindState>('unknown');

/** The protected layout asks once and shares the answer with the menu and the screens. */
export function AccountKindProvider({ value, children }: { value: AccountKindState; children: ReactNode }) {
  return createElement(AccountKindContext.Provider, { value }, children);
}

/** The shared answer (from AccountKindProvider). */
export function useAccountKind(): AccountKindState {
  return useContext(AccountKindContext);
}
