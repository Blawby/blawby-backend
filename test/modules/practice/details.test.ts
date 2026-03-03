import { test } from 'tap';
import { config } from '@dotenvx/dotenvx';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '@/shared/database';
import { organizations, users, members } from '@/schema/better-auth-schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceDetails } from '@/modules/practice/database/schema/practice.schema';
import { upsertAddressTx } from '@/modules/practice/database/queries/address.repository';

config();

await db.execute(sql`SELECT 1`).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`DB not available — cannot run integration tests: ${message}`);
});

const closePoolSafely = async (): Promise<void> => {
  const rawPool = pool as any;
  try {
    await Promise.race([
      rawPool.end?.(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // ignore teardown errors
  }

  const clients = Array.isArray(rawPool._clients) ? rawPool._clients : [];
  for (const client of clients) {
    try {
      client.end?.();
      client.release?.(true);
    } catch {
      // ignore forced close failures
    }
  }
};

test('Practice Details DB Integration', async (t) => {
  t.teardown(async () => {
    await closePoolSafely();
  });

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();

  await db.insert(users).values({
    id: userId,
    email: 'details-db-test@example.com',
    name: 'Details DB Test',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(organizations).values({
    id: orgId,
    name: 'Practice DB Test',
    slug: `practice-db-test-${crypto.randomUUID()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await t.test('create flow stores details and linked address', async (t) => {
    await db.transaction(async (tx) => {
      const addr = await upsertAddressTx(tx, {
        organizationId: orgId,
        addressData: {
          line1: '123 Main St',
          city: 'Test City',
          country: 'US',
        },
      });

      await tx.insert(practiceDetails).values({
        id: crypto.randomUUID(),
        organization_id: orgId,
        user_id: userId,
        address_id: addr?.id ?? null,
        business_phone: '+15555555555',
        website: 'https://practice.com',
      });
    });

    const [details] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, orgId));

    t.ok(details, 'practice details row exists');
    t.equal(details.business_phone, '+15555555555');
    t.equal(details.website, 'https://practice.com');
    t.ok(details.address_id, 'address is linked');

    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, details.address_id!));

    t.ok(address, 'address row exists');
    t.equal(address.line1, '123 Main St');
    t.equal(address.city, 'Test City');
    t.equal(address.country, 'US');
  });

  await t.test('update flow mutates existing details and address', async (t) => {
    const [existing] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, orgId));

    t.ok(existing?.address_id, 'existing address id available');
    if (!existing?.address_id) return;

    await db.transaction(async (tx) => {
      await upsertAddressTx(tx, {
        organizationId: orgId,
        addressId: existing.address_id!,
        addressData: {
          line1: '456 New St',
        },
      });

      await tx
        .update(practiceDetails)
        .set({
          intro_message: 'New Intro',
          updated_at: new Date(),
        })
        .where(eq(practiceDetails.organization_id, orgId));
    });

    const [updatedDetails] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, orgId));

    const [updatedAddress] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, updatedDetails.address_id!));

    t.equal(updatedAddress.line1, '456 New St');
    t.equal(updatedDetails.intro_message, 'New Intro');
  });

  await db.delete(practiceDetails).where(eq(practiceDetails.organization_id, orgId));
  await db.delete(addresses).where(eq(addresses.organization_id, orgId));
  await db.delete(members).where(and(eq(members.organizationId, orgId), eq(members.userId, userId)));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});
