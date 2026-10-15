import { browserStorage } from '@/platform/browser-storage';
import { createAuthPort } from './auth-client';

// The one real Auth port of the deployed app. Registration (through AuthPortContext) and the session source share it, so
// there is a single Auth client and a single stored session.
export const browserAuthPort = createAuthPort(undefined, { keyValueStorage: browserStorage() });
