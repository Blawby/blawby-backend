import { test } from 'tap';
import { db } from '@/shared/database';
import { practiceDetails } from '@/modules/practice/database/schema/practice.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { upsertPracticeDetailsService } from '@/modules/practice/services/practice-details.service';
import { eq } from 'drizzle-orm';
import { organizations, users, members, sessions } from '@/schema/better-auth-schema';
import * as schema from '@/schema/better-auth-schema';

// Mock DB and user data for testing service directly
// Note: Integration testing with Hono's app.request requires setting up the entire auth context mock,
// which is complex. Testing the service layer directly is more reliable for this verification step.

test('Practice Details Service', async (t) => {
  // Create test dependencies
  const user = {
    id: crypto.randomUUID(),
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const orgId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();

  // Setup: Create Organization and User in DB
  await db.insert(users).values({
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });

  await db.insert(organizations).values({
    id: orgId,
    name: 'Test Practice',
    slug: 'test-practice-' + crypto.randomUUID(), // Ensure distinct slug
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Authorize user as member
  await db.insert(schema.members).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: user.id,
    role: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create Session
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    token: sessionToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    ipAddress: '127.0.0.1',
    userAgent: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const headers = {
    Authorization: `Bearer ${sessionToken}`,
  };

  // Test Creation with Addresses
  await t.test('createPracticeDetailsService splits address data', async (t) => {
    const inputData = {
      business_phone: '+15555555555',
      website: 'https://practice.com',
      // Nested Address
      address: {
        line1: '123 Main St',
        city: 'Test City',
        country: 'US',
      },
    };

    const result = await upsertPracticeDetailsService(orgId, inputData, user, headers);

    t.ok(result, 'Result returned');
    t.equal(result.business_phone, inputData.business_phone);
    t.equal(result.website, inputData.website);
    t.same(result.address, {
      line1: '123 Main St',
      line2: null, // Default
      city: 'Test City',
      state: null, // nullable in DB
      postal_code: null,
      country: 'US',
    } as any, 'Address returned correctly');

    // Verify DB state
    const [details] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, orgId));

    t.ok(details, 'Practice details saved');
    t.ok(details.address_id, 'Address ID linked');

    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, details.address_id!));

    t.ok(address, 'Address saved');
    t.equal(address.line1, inputData.address.line1);
    t.equal(address.city, inputData.address.city);
    t.equal(address.organization_id, orgId);
  });

  await t.test('updatePracticeDetailsService updates existing address', async (t) => {
    const updateData = {
      intro_message: 'New Intro',
      address: {
        line1: '456 New St', // Changed
      }
    };

    await upsertPracticeDetailsService(orgId, updateData, user, headers);

    // Verify DB state again
    const [details] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, orgId));

    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, details.address_id!));

    t.equal(address.line1, '456 New St', 'Address updated');
    t.equal(details.intro_message, 'New Intro', 'Details updated');
  });

  // Cleanup
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
});
