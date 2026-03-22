import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const TEST_TIMEOUT = Number.parseInt(process.env.VITEST_TEST_TIMEOUT ?? '60000', 10);
const HOOK_TIMEOUT = Number.parseInt(process.env.VITEST_HOOK_TIMEOUT ?? '120000', 10);

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
    // No globalSetup to avoid DB connection for unit tests
    setupFiles: ['./test/setup/setupFiles.ts'],
    testTimeout: TEST_TIMEOUT,
    hookTimeout: HOOK_TIMEOUT,
  },
});
