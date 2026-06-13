#!/usr/bin/env tsx

/**
 * Generate Worker API Key
 *
 * Creates a Better Auth API key for the CF worker to authenticate with the backend.
 * Run once per environment, then set the output as WORKER_EVENT_SECRET wrangler secret.
 *
 * Usage:
 *   pnpm tsx src/scripts/generate-worker-api-key.ts
 *   pnpm tsx src/scripts/generate-worker-api-key.ts --userId <uuid>
 */

import { config } from '@dotenvx/dotenvx';
config();

import { db } from '@/shared/database';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { users } from '@/schema/better-auth-schema';
import { eq } from 'drizzle-orm';

const main = async (): Promise<void> => {
  const userIdArg = process.argv.find((a) => a.startsWith('--userId='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--userId') + 1];

  let userId = userIdArg;

  if (!userId) {
    const [adminUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    if (!adminUser) {
      console.error('No admin user found. Pass --userId <uuid> explicitly.');
      process.exit(1);
    }

    userId = adminUser.id;
    console.log(`Using admin user: ${adminUser.email} (${adminUser.id})`);
  }

  const auth = createBetterAuthInstance(db);

  const apiKey = await auth.api.createApiKey({
    body: {
      name: 'worker-intake-events',
      userId,
    },
  });

  console.log('\nAPI key created successfully.');
  console.log('\nSet this as WORKER_EVENT_SECRET wrangler secret:');
  console.log(`\n  ${apiKey.key}\n`);
  console.log('Run:');
  console.log('  wrangler secret put WORKER_EVENT_SECRET --env staging');
  console.log('  (paste the key above when prompted)\n');

  process.exit(0);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
