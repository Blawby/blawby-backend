import { testDb } from './db';
import { users, organizations } from '@/schema/better-auth-schema';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { auth } from '@/shared/auth/better-auth'; // Factory function
import type { User, Session } from '@/shared/types/BetterAuth'; // Adjust import if needed

// Initialize Better Auth with testDb
const betterAuth = auth(testDb);

export interface TestUser {
  id: string;
  email: string;
  name: string;
  sessionToken: string;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

/**
 * Create a test user with session using Better Auth SDK
 */
export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<TestUser> {
  const email = overrides.email || faker.internet.email();
  const name = overrides.name || faker.person.fullName();
  const password = 'password123'; // Default password

  // Use Better Auth API to sign up
  // This handles password hashing, user creation, and session creation
  const response = await betterAuth.api.signUpEmail({
    body: {
      email,
      password,
      name,
    },
    asResponse: false // Return data directly
  });

  if (!response?.user || !response?.session) {
    throw new Error('Failed to create test user via Better Auth');
  }

  // If ID override was requested, we might need to update it (but usually we accept generated ID)
  // If strict ID control is needed, we'd update DB after creation, but Better Auth handles IDs.
  // For now, return what Better Auth created.

  return {
    id: response.user.id,
    email: response.user.email,
    name: response.user.name,
    sessionToken: response.session.token,
  };
}

/**
 * Create a test organization
 */
export async function createTestOrganization(
  overrides: Partial<typeof organizations.$inferInsert> = {}
): Promise<TestOrganization> {
  const orgId = crypto.randomUUID();
  const slug = overrides.slug || faker.helpers.slugify(faker.company.name()).toLowerCase() + '-' + Date.now();
  const name = overrides.name || faker.company.name();

  await testDb.insert(organizations).values({
    id: orgId,
    name,
    slug,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  return { id: orgId, name, slug };
}

/**
 * Add user as member of organization
 */
export async function addUserToOrganization(
  userId: string,
  orgId: string,
  role: 'owner' | 'admin' | 'member' = 'member'
) {
  await testDb.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Create a full test context (user + org + membership)
 */
export async function createTestContext(role: 'owner' | 'admin' | 'member' = 'owner') {
  const user = await createTestUser();
  const org = await createTestOrganization();
  await addUserToOrganization(user.id, org.id, role);

  return { user, org };
}
