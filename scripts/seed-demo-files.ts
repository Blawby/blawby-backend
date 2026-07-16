/**
 * Seed two deterministic, synthetic files for a dedicated demo practice.
 *
 * The command is idempotent and only upserts the two fixture upload rows plus
 * the matter-file link it owns. It never resets or deletes other demo data.
 *
 * Usage:
 *   pnpm run seed:demo-files -- --practice-slug=demo-owner-local \
 *     --owner-email=owner@example.test --client-email=client@example.test
 *   pnpm run seed:demo-files -- --practice-slug=demo-owner-local \
 *     --owner-email=owner@example.test --client-email=client@example.test \
 *     --apply --confirm-demo-files
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { clients } from '../src/modules/clients/database/schema/clients.schema';
import { matterFiles } from '../src/modules/matters/database/schema/matter-files.schema';
import { matters } from '../src/modules/matters/database/schema/matters.schema';
import { members, organizations, users } from '../src/schema/better-auth-schema';
import { config } from '../src/shared/config';
import { db, pool } from '../src/shared/database';
import { keyGeneratorService } from '../src/shared/uploads/services/key-generator.service';
import { uploads } from '../src/shared/uploads/schema/uploads.schema';
import { demoFileFixtures, type DemoFileFixture } from './demo-files.fixtures';

interface Args {
  apply: boolean;
  confirm: boolean;
  practiceSlug: string;
  ownerEmail: string;
  clientEmail: string;
}

interface DemoContext {
  organizationId: string;
  ownerUserId: string;
  clientUserId: string;
  matterId: string;
}

const output = (message = ''): void => {
  process.stdout.write(`${message}\n`);
};

const printUsage = (): void => {
  output('Seed safe synthetic files for a dedicated demo practice.');
  output('Required: --practice-slug, --owner-email, --client-email');
  output('Apply: --apply --confirm-demo-files');
};

const optionValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};

const requiredOption = (name: string, environmentValue?: string): string => {
  const value = optionValue(name) ?? environmentValue;
  if (!value?.trim()) {
    throw new Error(`Missing --${name}. Use a dedicated synthetic demo identity.`);
  }
  return value.trim();
};

const parseArgs = (): Args => ({
  apply: process.argv.includes('--apply'),
  confirm: process.argv.includes('--confirm-demo-files'),
  practiceSlug: requiredOption('practice-slug', process.env.E2E_PRACTICE_SLUG?.split('/').filter(Boolean).at(-1)),
  ownerEmail: requiredOption('owner-email', process.env.E2E_OWNER_EMAIL),
  clientEmail: requiredOption('client-email', process.env.E2E_CLIENT_EMAIL),
});

const isSyntheticEmail = (email: string): boolean => {
  const normalized = email.toLowerCase();
  return normalized.endsWith('.test') || normalized.endsWith('@test-blawby.com');
};

const assertSyntheticTarget = (args: Args): void => {
  const slug = args.practiceSlug.toLowerCase();
  if (!slug.includes('demo') && !slug.includes('launch-test')) {
    throw new Error('Practice slug must identify a dedicated demo or launch-test practice.');
  }
  if (!isSyntheticEmail(args.ownerEmail) || !isSyntheticEmail(args.clientEmail)) {
    throw new Error('Owner and client emails must use .test or test-blawby.com synthetic identities.');
  }
  if (args.ownerEmail.toLowerCase() === args.clientEmail.toLowerCase()) {
    throw new Error('Owner and client demo identities must be different.');
  }
  if (args.apply && !args.confirm) {
    throw new Error('Refusing to apply without --confirm-demo-files.');
  }
};

const resolveDemoContext = async (args: Args): Promise<DemoContext> => {
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, args.practiceSlug))
    .limit(1);
  if (!organization) {
    throw new Error(`Demo practice not found: ${args.practiceSlug}`);
  }

  const [owner] = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(
      members,
      and(eq(members.userId, users.id), eq(members.organizationId, organization.id), eq(members.role, 'owner'))
    )
    .where(eq(users.email, args.ownerEmail))
    .limit(1);
  if (!owner) {
    throw new Error('Synthetic owner is not an owner of the demo practice.');
  }

  const [client] = await db
    .select({ id: clients.id, userId: clients.user_id })
    .from(clients)
    .innerJoin(users, eq(users.id, clients.user_id))
    .where(
      and(eq(clients.organization_id, organization.id), eq(users.email, args.clientEmail), isNull(clients.deleted_at))
    )
    .limit(1);
  if (!client?.userId) {
    throw new Error('Synthetic client is not linked to a client record in the demo practice.');
  }

  const [matter] = await db
    .select({ id: matters.id })
    .from(matters)
    .where(
      and(eq(matters.organization_id, organization.id), eq(matters.client_id, client.id), isNull(matters.deleted_at))
    )
    .orderBy(desc(matters.created_at))
    .limit(1);
  if (!matter) {
    throw new Error('Demo client needs at least one matter before files can be seeded.');
  }

  return {
    organizationId: organization.id,
    ownerUserId: owner.userId,
    clientUserId: client.userId,
    matterId: matter.id,
  };
};

const getStorageConfig = (): { client: S3Client; bucket: string } => {
  const { accountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName } = config.cloudflare;
  if (!accountId || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
    throw new Error('R2 storage configuration is required to seed downloadable demo files.');
  }
  return {
    bucket: r2BucketName,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  };
};

const uploaderIdFor = (fixture: DemoFileFixture, context: DemoContext): string =>
  fixture.audience === 'client' ? context.clientUserId : context.ownerUserId;

const assertFixtureIdsAvailable = async (context: DemoContext): Promise<void> => {
  const existing = await db
    .select({ id: uploads.id, organizationId: uploads.organization_id })
    .from(uploads)
    .where(
      inArray(
        uploads.id,
        demoFileFixtures.map((fixture) => fixture.id)
      )
    );

  const collision = existing.find((upload) => upload.organizationId !== context.organizationId);
  if (collision) {
    throw new Error(`Fixture upload ID ${collision.id} already belongs to another practice.`);
  }
};

const seedFiles = async (context: DemoContext): Promise<void> => {
  await assertFixtureIdsAvailable(context);
  const storage = getStorageConfig();
  const encodedFixtures = demoFileFixtures.map((fixture) => {
    const scopeId = context.matterId;
    const body = new TextEncoder().encode(fixture.content);
    const storageKey = keyGeneratorService.generateStorageKey({
      organizationId: context.organizationId,
      scopeType: fixture.scopeType,
      scopeId,
      uploadId: fixture.id,
      fileName: fixture.fileName,
    });
    return { fixture, scopeId, body, storageKey };
  });

  for (const item of encodedFixtures) {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: item.storageKey,
        Body: item.body,
        ContentType: item.fixture.mimeType,
      })
    );
  }

  const now = new Date();
  await db.transaction(async (transaction) => {
    for (const item of encodedFixtures) {
      const updateValues = {
        user_id: uploaderIdFor(item.fixture, context),
        organization_id: context.organizationId,
        file_name: item.fixture.fileName,
        file_type: 'txt',
        file_size: item.body.byteLength,
        mime_type: item.fixture.mimeType,
        storage_provider: 'r2',
        storage_key: item.storageKey,
        public_url: null,
        scope_type: item.fixture.scopeType,
        scope_id: item.scopeId,
        status: 'verified',
        is_privileged: true,
        verified_at: now,
        expires_at: null,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
      };
      await transaction
        .insert(uploads)
        .values({ id: item.fixture.id, ...updateValues })
        .onConflictDoUpdate({
          target: uploads.id,
          set: updateValues,
        });

      await transaction
        .insert(matterFiles)
        .values({
          matter_id: context.matterId,
          upload_id: item.fixture.id,
          linked_by: context.ownerUserId,
        })
        .onConflictDoNothing({ target: [matterFiles.matter_id, matterFiles.upload_id] });
    }
  });
};

const main = async (): Promise<void> => {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const args = parseArgs();
  assertSyntheticTarget(args);

  try {
    const context = await resolveDemoContext(args);
    output(`Demo file seed: ${args.apply ? 'APPLY' : 'DRY RUN'}`);
    output(`Practice: ${args.practiceSlug}`);
    for (const fixture of demoFileFixtures) {
      output(`- ${fixture.fileName} (${fixture.audience}, ${fixture.scopeType})`);
    }

    if (!args.apply) {
      output('Dry run complete. Add --apply --confirm-demo-files to upload and upsert these fixtures.');
      return;
    }

    await seedFiles(context);
    output('Seed complete. Only the two deterministic synthetic fixture records were upserted.');
  } finally {
    await pool.end();
  }
};

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
