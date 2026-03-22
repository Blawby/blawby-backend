import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const DEFAULT_TEST_TIMEOUT = 30_000;
const DEFAULT_HOOK_TIMEOUT = 100_000;

const parseTimeout = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const TEST_TIMEOUT = parseTimeout(process.env.VITEST_TEST_TIMEOUT, DEFAULT_TEST_TIMEOUT);
const HOOK_TIMEOUT = parseTimeout(process.env.VITEST_HOOK_TIMEOUT, DEFAULT_HOOK_TIMEOUT);

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
