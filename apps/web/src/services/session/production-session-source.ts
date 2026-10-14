import { createMemorySessionSource } from './memory-session-source';

// The source the deployed app uses until login exists (F1.5): signed-out until registration signs the user in.
export const productionSessionSource = createMemorySessionSource();
