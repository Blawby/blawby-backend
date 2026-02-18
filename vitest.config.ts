import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./test/tsconfig.json', './tsconfig.json'] })],
  resolve: {
  },
  test: {
    globals: true,
    environment: 'node',
    env: {
      BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'test-secret-key-for-testing-only',
    },
    globalSetup: ['./test/setup/globalSetup.ts'],
    setupFiles: ['./test/setup/setupFiles.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // pool: 'forks' is default in newer Vitest, but let's keep it explicit if needed.
    // However, 'pool' option might be deprecated in Vitest 3 in favor of 'pool' configuration object?
    // Let's check docs or just use simple config first.
    // Vitest 3 uses 'pool' option still.
  },
});
