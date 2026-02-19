import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./test/tsconfig.json', './tsconfig.json'] })],
  test: {
    globals: true,
    environment: 'node',
    env: {
      BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'test-secret-key-for-testing-only',
    },
    // No globalSetup or setupFiles to avoid DB connection
    setupFiles: ['./test/setup/setupFiles.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
