import type { SessionSource } from './session-source';

// The source the deployed app uses until sign-in exists (F1.2, Q1): always signed-out. F1.5 replaces it with
// the Supabase-backed source behind the same SessionSource contract.
export const productionSessionSource: SessionSource = {
  getState: () => 'signed-out',
  subscribe: () => () => undefined,
  signOut: () => Promise.resolve(),
};
