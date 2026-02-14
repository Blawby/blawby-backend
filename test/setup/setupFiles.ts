import { config } from '@dotenvx/dotenvx';
import { beforeAll, afterAll } from 'vitest';

// Load test environment variables before all tests
config({ path: '.env.test' });

// Optional: Global test hooks
beforeAll(async () => {
  // Any additional setup per test file
});

afterAll(async () => {
  // Any cleanup per test file
});
