import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PermissionKey } from '@nestly/shared';
import { fetchStaffAccess } from '@/services/api/admin';
import { useAdminCall } from './use-admin-call';

/** loading · none (not a staff account, or the answer did not come) · staff (the role and the Permission Keys it holds). */
export type StaffAccessState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'staff'; role: 'admin' | 'moderator'; permissions: readonly PermissionKey[] };

// Asks the server once per mount whether the signed-in account is an Admin or a Moderator, and which keys it holds (FR-ADMIN-004). Presentation only:
// every admin call is checked again by the database, and an unanswered question shows no admin entry and never grants anything.
export function useStaffAccessQuery(): StaffAccessState {
  const call = useAdminCall();
  const [state, setState] = useState<StaffAccessState>({ kind: 'loading' });
  useEffect(() => {
    let current = true;
    void (async () => {
      const outcome = await call(fetchStaffAccess);
      if (!current) return;
      if (outcome.kind === 'ok' && outcome.value.staff) setState({ kind: 'staff', role: outcome.value.role, permissions: outcome.value.permissions });
      else setState({ kind: 'none' });
    })();
    return () => {
      current = false;
    };
  }, [call]);
  return state;
}

const StaffAccessContext = createContext<StaffAccessState>({ kind: 'loading' });

/** The protected layout asks once and shares the answer with the menu and the admin screens (one access call, not one per screen). */
export function StaffAccessProvider({ value, children }: { value: StaffAccessState; children: ReactNode }) {
  return createElement(StaffAccessContext.Provider, { value }, children);
}

/** The shared answer (from StaffAccessProvider). */
export function useStaffAccess(): StaffAccessState {
  return useContext(StaffAccessContext);
}
