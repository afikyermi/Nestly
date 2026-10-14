import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { isSecretKey } from './src/services/auth/secret-key';

// The e2e build (mode `e2e`) has no Vercel values; it gets an unreachable stub origin and a placeholder, so the end-to-end
// tests can intercept the Auth sign-up call. No other mode defines them: preview and production read the real values.
const E2E_AUTH_STUB = {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://e2e-stub.invalid'),
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('e2e-stub-placeholder-not-a-real-key'),
};

export default defineConfig(({ mode }) => {
  // A secret key in the public variable would be inlined into the bundle: stop the build, naming only the variable.
  if (isSecretKey(loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_SUPABASE_PUBLISHABLE_KEY ?? '')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable key.');
  }
  return {
  plugins: [react(), tailwindcss()],
  ...(mode === 'e2e' ? { define: E2E_AUTH_STUB } : {}),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // @nestly/shared from source in dev, tests and Storybook; its built JS is for the Node function only.
    conditions: ['source', ...defaultClientConditions],
  },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
  };
});
