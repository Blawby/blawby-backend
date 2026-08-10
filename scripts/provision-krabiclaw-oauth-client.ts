#!/usr/bin/env tsx
// oxlint-disable import/first

/**
 * Provision or rotate the single fixed KrabiClaw OAuth client used for the
 * legal-facade machine-to-machine grant (client_credentials, audience
 * urn:blawby:legal-api). Must be run by an existing staff super_admin —
 * the account authenticates with its own email/password so the request
 * goes through the exact same Better Auth privilege path a real dashboard
 * session would use (see checkOAuthClientPrivileges).
 *
 * The client secret is only ever shown once, at creation or rotation time —
 * Better Auth stores it hashed. Capture it immediately into your secrets
 * manager; there is no way to retrieve it again later.
 *
 * Usage:
 *   pnpm run krabiclaw:provision-oauth-client -- create \
 *     --email admin@blawby.com --password '<staff password>' \
 *     --redirect-uri https://<real-krabiclaw-host>/oauth/callback
 *
 *   pnpm run krabiclaw:provision-oauth-client -- rotate \
 *     --email admin@blawby.com --password '<staff password>' \
 *     --client-id <existing client_id>
 */

import { config as loadEnv } from '@dotenvx/dotenvx';
loadEnv();

import { users } from '@/schema/better-auth-schema';
import { oauthClients } from '@/schema/oauth.schema';
import { createBetterAuthInstance } from '@/shared/auth/better-auth';
import { KRABICLAW_LEGAL_SCOPES, KRABICLAW_OAUTH_CLIENT_REFERENCE } from '@/shared/auth/krabiclaw-oauth';
import { getStaffRoles } from '@/shared/auth/permissions';
import { config } from '@/shared/config';
import { db } from '@/shared/database';
import { getActiveTx, uow } from '@/shared/database/uow';
import { eq, sql } from 'drizzle-orm';

const getArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const exitWithError = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/**
 * Exactly one KrabiClaw OAuth client may exist (R2). config.krabiclaw.oauthClientId
 * is set once, by hand, after the first successful `create` (see the runbook) — its
 * presence is what this script uses to tell "not provisioned yet" from "already provisioned".
 */
export const checkCreateAllowed = (configuredClientId: string | undefined): string | null => {
  if (configuredClientId) {
    return `KRABICLAW_OAUTH_CLIENT_ID is already set to ${configuredClientId}. Exactly one KrabiClaw OAuth client may exist for this environment — run "rotate --client-id ${configuredClientId}" instead of creating a second one.`;
  }
  return null;
};

/**
 * KRABICLAW_OAUTH_CLIENT_ID is only a fast, process-local pre-check — it can be
 * unset in this shell while a client already exists in the database (wrong
 * machine, forgot to export it, config drift). The database row is the
 * authoritative source of truth for "does a KrabiClaw client already exist",
 * so this is what actually gates creation, inside the advisory lock below.
 */
const findExistingKrabiClawClient = async (): Promise<{ clientId: string } | undefined> => {
  const [existing] = await getActiveTx()
    .select({ clientId: oauthClients.clientId })
    .from(oauthClients)
    .where(eq(oauthClients.referenceId, KRABICLAW_OAUTH_CLIENT_REFERENCE));
  return existing;
};

/**
 * Serializes concurrent `create` runs so two processes can't both pass the
 * "no existing client" check before either has written one. Mirrors the
 * pg_advisory_xact_lock pattern in trust.service.ts's withTrustLock.
 */
const withKrabiClawProvisioningLock = async <T>(execute: () => Promise<T>): Promise<T> =>
  uow.transaction(async () => {
    const trx = getActiveTx();
    await trx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('krabiclaw-oauth-client-provision'))`);
    return execute();
  });

export const checkRotateAllowed = (clientId: string, configuredClientId: string | undefined): string | null => {
  if (!configuredClientId) {
    return 'KRABICLAW_OAUTH_CLIENT_ID is not configured in this environment — nothing to rotate. Run "create" first, then set KRABICLAW_OAUTH_CLIENT_ID.';
  }
  if (clientId !== configuredClientId) {
    return `--client-id ${clientId} does not match the configured KRABICLAW_OAUTH_CLIENT_ID (${configuredClientId}). Refusing to rotate an unrelated client.`;
  }
  return null;
};

const main = async (): Promise<void> => {
  const mode = process.argv.find((arg) => arg === 'create' || arg === 'rotate');
  if (mode !== 'create' && mode !== 'rotate') {
    exitWithError(
      'Usage: provision-krabiclaw-oauth-client.ts <create|rotate> --email <email> --password <password> [--redirect-uri <uri> | --client-id <id>]'
    );
  }

  const email = getArg('email');
  const password = getArg('password');
  if (!email || !password) {
    exitWithError('Both --email and --password are required.');
  }

  const [staffUser] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));
  if (!staffUser) {
    exitWithError(`No user found with email: ${email}`);
  }
  if (!getStaffRoles(staffUser.role).includes('super_admin')) {
    exitWithError(`${email} is not a super_admin. Run: pnpm run staff:grant --email ${email} --role super_admin`);
  }

  const auth = createBetterAuthInstance(db);
  const signIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const setCookie = signIn.headers.get('set-cookie');
  if (!setCookie) {
    exitWithError('Sign-in did not return a session cookie. Check the password.');
  }
  const cookie = setCookie.split(';')[0];
  const headers = new Headers({ cookie });

  if (mode === 'create') {
    const createBlocked = checkCreateAllowed(config.krabiclaw.oauthClientId);
    if (createBlocked) {
      exitWithError(createBlocked);
    }

    const redirectUri = getArg('redirect-uri');
    if (!redirectUri) {
      exitWithError('--redirect-uri is required for create (the real KrabiClaw callback URL for this environment).');
    }

    const client = await withKrabiClawProvisioningLock(async () => {
      const existing = await findExistingKrabiClawClient();
      if (existing) {
        exitWithError(
          `A KrabiClaw OAuth client already exists in the database (client_id: ${existing.clientId}), even though KRABICLAW_OAUTH_CLIENT_ID wasn't set to it in this process's environment. Exactly one may exist — run "rotate --client-id ${existing.clientId}" instead.`
        );
      }

      return auth.api.adminCreateOAuthClient({
        headers,
        body: {
          redirect_uris: [redirectUri],
          grant_types: ['client_credentials'],
          token_endpoint_auth_method: 'client_secret_basic',
          type: 'web',
          scope: KRABICLAW_LEGAL_SCOPES.join(' '),
          client_name: 'krabiclaw-legal-facade',
          require_pkce: false,
        },
      });
    });

    console.log('\nKrabiClaw OAuth client created. Store these now — the secret is shown only once:\n');
    console.log(`  client_id:     ${client.client_id}`);
    console.log(`  client_secret: ${client.client_secret}\n`);
    console.log('Next steps:');
    console.log("  1. Set KRABICLAW_OAUTH_CLIENT_ID in this environment's Blawby config to the client_id above.");
    console.log("  2. Give the client_id and client_secret to KrabiClaw for this environment's config.");
    console.log('  3. Record the provisioning in the runbook (docs/runbooks/krabiclaw-oauth-client.md).');
  } else {
    const clientId = getArg('client-id');
    if (!clientId) {
      exitWithError('--client-id is required for rotate.');
    }

    const rotateBlocked = checkRotateAllowed(clientId, config.krabiclaw.oauthClientId);
    if (rotateBlocked) {
      exitWithError(rotateBlocked);
    }

    const rotated = await auth.api.rotateClientSecret({ headers, body: { client_id: clientId } });
    console.log('\nKrabiClaw OAuth client secret rotated. Store this now — it is shown only once:\n');
    console.log(`  client_id:     ${rotated.client_id}`);
    console.log(`  client_secret: ${rotated.client_secret}\n`);
    console.log("The previous secret stops working immediately. Update KrabiClaw's config before traffic depends on it.");
  }

  process.exit(0);
};

// Only run the CLI when this file is executed directly (tsx), not when imported
// for its testable exports (checkCreateAllowed, checkRotateAllowed).
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}
