import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/firestore-rules/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run tests serially to prevent race conditions with shared Firestore emulator
    fileParallelism: false,
    maxConcurrency: 1,
    globalTeardown: './vitest.rules.teardown.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
