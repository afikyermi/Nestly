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
  // Two entries of the same app (F3.6 c7, BR-067): post.html differs from index.html only in its fixed link-preview tags, and vercel.json
  // serves it for every /posts/* address, so a crawler sees one page whatever the post (no SSR, no per-post content).
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), post: fileURLToPath(new URL('./post.html', import.meta.url)) } } },
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
