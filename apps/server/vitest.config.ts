import { defineConfig } from 'vitest/config';

// The tests read `@nestly/shared` from source, not from its built JS (the `source` condition of its exports map), so a
// change to shared is what the server tests exercise, with no build step first. The deployed function has no such
// condition and loads dist/ (packages/shared/package.json).
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
});
