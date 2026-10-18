import { createContext, useContext } from 'react';
import { POST_AUDIENCES, type PostAudience } from '@nestly/shared';
import type { StorageLike } from '@/platform/browser-storage';

/** Where the last audience choice is kept: App provides the browser's storage (read when used, so a blocked one is met there); a test its own. */
export const AudienceStorageContext = createContext<() => StorageLike | undefined>(() => undefined);

export interface AudienceMemory {
  /** The last audience posted with by this user on this device; null when none is stored, it is invalid, or storage fails. */
  read(): PostAudience | null;
  /** Remembers `audience`; a blocked or full storage is ignored (the choice is a convenience, Afik 1א). */
  write(audience: PostAudience): void;
}

const keyOf = (userId: string): string => `nestly.post-audience.${userId}`;
const isAudience = (value: string | null): value is PostAudience => POST_AUDIENCES.some((audience) => audience === value);

// The last audience a user posted with (OP-033, Afik 1א), per user id on the device: no schema, no new personal data. Presentation
// only: the server checks the audience of every post. Without a user id nothing is read or stored.
export function useAudienceMemory(userId: string | null): AudienceMemory {
  const storage = useContext(AudienceStorageContext);
  return {
    read() {
      if (userId === null) return null;
      try {
        const stored = storage()?.getItem(keyOf(userId)) ?? null;
        return isAudience(stored) ? stored : null;
      } catch {
        return null;
      }
    },
    write(audience) {
      if (userId === null) return;
      try {
        storage()?.setItem(keyOf(userId), audience);
      } catch {
        // storage blocked or full: the next composer opens on "everyone"
      }
    },
  };
}
