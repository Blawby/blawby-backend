import { config } from '@dotenvx/dotenvx';
import { beforeAll, afterAll } from 'vitest';
config({ path: '.env.test' });

// Optional: Global test hooks
beforeAll(async () => {
});

afterAll(async () => {
});
