import { config } from '@dotenvx/dotenvx';
import { beforeAll, afterAll } from 'vitest';
config({ path: '.env.test', override: true });

// Optional: Global test hooks
beforeAll(async () => {
});

afterAll(async () => {
});
