import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      // To make getRandomValues work correctly
      protocolImports: true,
    }),
    react(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    css: true,
<<<<<<< HEAD
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/tests/firestore-rules/**', '**/.{idea,git,cache,output,temp}/**'],
=======
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.{idea,git,cache,output,temp}/**'],
>>>>>>> feat/admin-hardening-docs
    // Allow .cjs test files for server tests
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    env: {
      DISABLE_VERTEX_AI: 'true',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
