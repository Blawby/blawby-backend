import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/shared/database';
import { practiceDetails } from '@/modules/practice/database/schema/practice.schema';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { upsertPracticeDetails } from '@/modules/practice/services/practice-details.service';
import { eq } from 'drizzle-orm';
import { organizations, users, sessions } from '@/schema/better-auth-schema';
import { createTestContext } from '@test/helpers/auth';

// Mock DB and user data for testing service directly
// Note: Integration testing with Hono's app.request requires setting up the entire auth context mock,
// which is complex. Testing the service layer directly is more reliable for this verification step.

describe('Practice Details Service', () => {
  let context: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    context = await createTestContext('owner');
  });

  afterAll(async () => {
    // Cleanup
    if (context) {
      await db.delete(organizations).where(eq(organizations.id, context.org.id));
      await db.delete(users).where(eq(users.id, context.user.id));
      await db.delete(sessions).where(eq(sessions.userId, context.user.id));
    }
  });

  // Test Creation with Addresses
  it('createPracticeDetailsService splits address data', async () => {
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

    const headers = {
      Authorization: `Bearer ${context.user.sessionToken}`
    };

    // We need a user object compatible with what expected by upsertPracticeDetailsService
    // It likely expects the user from the session or similar.
    // The original test mocked `user` object passed to service.
    // Let's see the signature of upsertPracticeDetailsService in the original test:
    // upsertPracticeDetailsService(orgId, inputData, user, headers);
    // The user object in original test had: id, email, name, emailVerified, createdAt, updatedAt.
    // Our context.user has similar fields.

    const userForService = {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await upsertPracticeDetails(context.org.id, inputData, userForService, headers);

    expect(result).toBeTruthy();
    expect(result.business_phone).toBe(inputData.business_phone);
    expect(result.website).toBe(inputData.website);
    expect(result.address).toMatchObject({
      line1: '123 Main St',
      line2: null, // Default
      city: 'Test City',
      state: null, // nullable in DB
      postal_code: null,
      country: 'US',
    });

    // Verify DB state
    const [details] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, context.org.id));

    expect(details).toBeTruthy();
    expect(details.address_id).toBeTruthy();

    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, details.address_id!));

    expect(address).toBeTruthy();
    expect(address.line1).toBe(inputData.address.line1);
    expect(address.city).toBe(inputData.address.city);
    expect(address.organization_id).toBe(context.org.id);
  });

  it('updatePracticeDetailsService updates existing address', async () => {
    const updateData = {
      intro_message: 'New Intro',
      address: {
        line1: '456 New St', // Changed
      }
    };

    const headers = {
      Authorization: `Bearer ${context.user.sessionToken}`
    };

    const userForService = {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Type assertion or partial match might be needed if updateData matches expected input type
    // The service handles partial updates?
    // Original test: upsertPracticeDetailsService(orgId, updateData, user, headers);
    // Just blindly passing updateData.

    await upsertPracticeDetails(context.org.id, updateData as any, userForService, headers);

    // Verify DB state again
    const [details] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, context.org.id));

    const [address] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, details.address_id!));

    expect(address.line1).toBe('456 New St');
    expect(details.intro_message).toBe('New Intro');
  });
});
