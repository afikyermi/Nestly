import { defaultClientConditions, defaultServerConditions } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

// Lets `npx vitest run <file>` work from the repo root for every workspace. The web project keeps its own config
// (the `@/` alias, jsdom, setup file). The server has none: its package script is `vitest run --exclude "tests/db/**"`
// (the database suite needs a database), so the same exclusion is stated here. `npm test --workspaces` still runs each
// workspace's own `vitest run` and does not read this file.
export default defineConfig({
  test: {
    projects: [
      'apps/web',
      'packages/shared',
      {
        resolve: { conditions: ['source', ...defaultClientConditions] },
        ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
        test: {
          name: 'server',
          root: 'apps/server',
          exclude: [...configDefaults.exclude, 'tests/db/**'],
        },
      },
    ],
  },
});
