#!/usr/bin/env tsx
// oxlint-disable import/first

/**
 * Generate or rotate the Worker API Key used by the CF Worker queue consumer.
 *
 * The key is owned by a designated system user whose email is set via
 * SYSTEM_USER_EMAIL env var. The --email arg must match that env var as a
 * safety check so you can't accidentally issue keys for arbitrary users.
 *
 * Usage:
 *   pnpm tsx src/scripts/generate-worker-api-key.ts --email system@blawby.com
 *
 * After running, set the printed key as a wrangler secret:
 *   wrangler secret put WORKER_EVENT_SECRET --env staging
 */

import { config } from '@dotenvx/dotenvx';
config();

import { users, apikeys } from '@/schema/better-auth-schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { db } from '@/shared/database';
import { and, eq } from 'drizzle-orm';

const KEY_NAME = 'worker-intake-events';

const main = async (): Promise<void> => {
  const systemEmail = process.env.SYSTEM_USER_EMAIL;
  if (!systemEmail) {
    console.error('SYSTEM_USER_EMAIL env var is not set.');
    process.exit(1);
  }

  const idx = process.argv.indexOf('--email');
  const emailArg =
    process.argv.find((a) => a.startsWith('--email='))?.split('=')[1] ??
    (idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined);

  if (!emailArg) {
    console.error('Usage: generate-worker-api-key.ts --email <email>');
    process.exit(1);
  }

  if (emailArg !== systemEmail) {
    console.error(`Email mismatch. Expected SYSTEM_USER_EMAIL (${systemEmail}), got ${emailArg}.`);
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, emailArg))
    .limit(1);

  if (!user) {
    console.error(`No user found with email: ${emailArg}`);
    process.exit(1);
  }

  const auth = createBetterAuthInstance(db);

  // Rotate: delete existing key with same name if present (query DB directly — listApiKeys requires session)
  const [existingKey] = await db
    .select({ id: apikeys.id })
    .from(apikeys)
    .where(and(eq(apikeys.referenceId, user.id), eq(apikeys.name, KEY_NAME)))
    .limit(1);

  if (existingKey) {
    await db.delete(apikeys).where(eq(apikeys.id, existingKey.id));
    console.log('Existing key deleted (rotating).');
  }

  const apiKey = await auth.api.createApiKey({
    body: {
      name: KEY_NAME,
      userId: user.id,
    },
  });

  console.log(`\nAPI key ${existingKey ? 'rotated' : 'created'} for ${user.email}\n`);
  console.log('Set this as WORKER_EVENT_SECRET wrangler secret:\n');
  console.log(`  ${apiKey.key}\n`);
  console.log('Run:');
  console.log('  wrangler secret put WORKER_EVENT_SECRET --env staging');
  console.log('  (paste the key above when prompted)\n');

  process.exit(0);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
