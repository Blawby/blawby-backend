import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './test'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'test-secret-key-for-testing-only',
    },
    setupFiles: ['./test/setup/setupFiles.ts'],
    globalSetup: ['./test/setup/globalSetup.ts'],
    globalTeardown: ['./test/setup/globalTeardown.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // pool: 'forks' is default in newer Vitest, but let's keep it explicit if needed.
    // However, 'pool' option might be deprecated in Vitest 3 in favor of 'pool' configuration object?
    // Let's check docs or just use simple config first.
    // Vitest 3 uses 'pool' option still.
  },
});
