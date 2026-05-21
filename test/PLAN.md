# E2E API Testing Suite Implementation Plan

**Strategy**: Drop/recreate test database on each run to test migrations + ensure clean state

**Stack**: Vitest + Supertest + Fresh PostgreSQL Database

---

## Overview

This plan outlines implementing a robust E2E testing suite for the Blawby backend API, similar to how Cypress works for frontend testing. The approach focuses on:

- **Real HTTP requests** via Supertest (no mocking)
- **Real database operations** with PostgreSQL (no SQLite/in-memory DB)
- **Migration testing** by dropping and recreating the test database on each run
- **Zero mocking** - test the actual integration between components

---

## Test Lifecycle

```
1. Before all tests (global setup):
   - Drop `blawby_test` database if exists
   - Create fresh `blawby_test` database
   - Run Drizzle migrations (tests your migration files!)
   - Optionally seed minimal required data (system configs, etc.)

2. Run all test suites:
   - Each test file makes real HTTP requests via Supertest
   - Hits real Hono app → real database queries
   - Tests can create/modify data freely

3. After all tests (global teardown):
   - Drop `blawby_test` database
   - Close database connections
   - Clean exit
```

---

## Implementation Steps

### 1. Install Dependencies

```bash
pnpm add -D vitest @vitest/ui supertest @types/supertest
```

Remove old dependencies:
```bash
pnpm remove tap @tapjs/test ts-node cross-env
```

**Dependencies explained:**
- `vitest`: Modern test runner with TypeScript/ESM support
- `@vitest/ui`: Optional browser-based UI for visualizing test results
- `supertest`: HTTP assertion library for testing APIs
- `@types/supertest`: TypeScript types for Supertest

---

### 2. Create Configuration Files

#### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup/setupFiles.ts'],
    globalSetup: ['./test/setup/globalSetup.ts'],
    globalTeardown: ['./test/setup/globalTeardown.ts'],
    testTimeout: 30000, // 30 seconds for E2E tests
    hookTimeout: 60000, // 60 seconds for setup/teardown
    pool: 'forks', // Isolate tests in separate processes
    poolOptions: {
      forks: {
        singleFork: true, // Use single fork for shared DB
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

#### `.env.test`

```bash
# Test Database Configuration
DATABASE_URL=postgresql://127.0.0.1/blawby_test

# Better Auth Configuration
BETTER_AUTH_SECRET=test-secret-key-for-testing-only
BETTER_AUTH_BASE_URL=http://localhost:3000

# Backend URL
BACKEND_URL=http://localhost:3000

# Server Configuration
PORT=3000
SERVER_HOSTNAME=0.0.0.0
NODE_ENV=test
REDIS_HOST=localhost
ENABLE_QUEUE=false

# Stripe Configuration (use Stripe test mode keys)
STRIPE_SECRET_KEY=sk_test_your-stripe-test-key
STRIPE_WEBHOOK_SECRET=whsec_test_your-webhook-secret
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_test_your-connect-webhook-secret

# Disable external services during tests (optional)
SKIP_EXTERNAL_SERVICES=true
```

---

### 3. Create Global Setup Files

#### `test/setup/globalSetup.ts`

```typescript
import { execSync } from 'child_process';
import { config } from '@dotenvx/dotenvx';
import pg from 'pg';

// Load test environment variables
config({ path: '.env.test' });

export default async function globalSetup() {
  console.log('🧪 Setting up test database...');

  const dbUrl = process.env.DATABASE_URL!;
  const testDbName = 'blawby_test';

  // Connect to postgres database to manage test database
  const { Client } = pg;
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Drop test database if exists
    console.log(`  → Dropping ${testDbName} database if exists...`);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    // Create fresh test database
    console.log(`  → Creating fresh ${testDbName} database...`);
    await client.query(`CREATE DATABASE ${testDbName}`);

    await client.end();

    // Run Drizzle migrations
    console.log('  → Running Drizzle migrations...');
    execSync('pnpm drizzle-kit migrate', {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'inherit',
    });

    console.log('✅ Test database setup complete!\n');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
}
```

#### `test/setup/globalTeardown.ts`

```typescript
import pg from 'pg';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up test database...');

  const testDbName = 'blawby_test';
  const { Client } = pg;
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Drop test database
    console.log(`  → Dropping ${testDbName} database...`);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);

    await client.end();
    console.log('✅ Test database cleanup complete!');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
    // Don't throw - allow tests to complete even if cleanup fails
  }
}
```

#### `test/setup/setupFiles.ts`

```typescript
import { config } from '@dotenvx/dotenvx';
import { beforeAll, afterAll } from 'vitest';

// Load test environment variables before all tests
config({ path: '.env.test' });

// Optional: Global test hooks
beforeAll(async () => {
  // Any additional setup per test file
});

afterAll(async () => {
  // Any cleanup per test file
});
```

---

### 4. Create Test Helpers

#### `test/helpers/db.ts`

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@/schema/better-auth-schema';

const { Pool } = pg;

// Test database connection
export const testPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const testDb = drizzle(testPool, { schema });
```

#### `test/helpers/app.ts`

```typescript
import app from '@/hono-app';

// Export the configured Hono app instance for Supertest
export { app };
```

#### `test/helpers/request.ts`

```typescript
import supertest from 'supertest';
import { app } from './app';

// Create supertest instance
export const request = supertest(app.fetch);

// Helper for authenticated requests
export function authenticatedRequest(sessionToken: string) {
  return request.set('Cookie', `better-auth.session-token=${sessionToken}`);
}

// Helper for API requests with JSON
export function apiRequest(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  return request[method](path)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json');
}
```

#### `test/helpers/auth.ts`

```typescript
import { testDb } from './db';
import { users, sessions, organizations, members } from '@/schema/better-auth-schema';
import crypto from 'crypto';

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
 * Create a test user with session
 */
export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<TestUser> {
  const userId = crypto.randomUUID();
  const email = overrides.email || `test-${Date.now()}@example.com`;
  const name = overrides.name || 'Test User';

  await testDb.insert(users).values({
    id: userId,
    email,
    name,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  // Create session
  const sessionToken = crypto.randomUUID();
  await testDb.insert(sessions).values({
    id: crypto.randomUUID(),
    token: sessionToken,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    id: userId,
    email,
    name,
    sessionToken,
  };
}

/**
 * Create a test organization
 */
export async function createTestOrganization(
  overrides: Partial<typeof organizations.$inferInsert> = {}
): Promise<TestOrganization> {
  const orgId = crypto.randomUUID();
  const slug = overrides.slug || `test-org-${Date.now()}`;
  const name = overrides.name || 'Test Organization';

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
```

#### `test/helpers/factories.ts`

```typescript
import { testDb } from './db';
import crypto from 'crypto';

/**
 * Factory functions for creating test data
 */

// Add more factories as needed for invoices, matters, etc.
export const factories = {
  // Example: Create test invoice
  async createInvoice(orgId: string, overrides = {}) {
    // Implementation based on your invoice schema
    return {};
  },

  // Example: Create test matter
  async createMatter(orgId: string, overrides = {}) {
    // Implementation based on your matter schema
    return {};
  },
};
```

---

### 5. Migrate Existing Tests

Convert existing tap tests to Vitest format.

#### Before (tap): `test/modules/practice/details.test.ts`

```typescript
import { test } from 'tap';
// ... tap syntax
```

#### After (Vitest):

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { testDb } from '@/test/helpers/db';
import { createTestContext } from '@/test/helpers/auth';
import { authenticatedRequest } from '@/test/helpers/request';

describe('Practice Details Service', () => {
  let context: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    context = await createTestContext('owner');
  });

  it('should create practice details with address', async () => {
    const inputData = {
      business_phone: '+15555555555',
      website: 'https://practice.com',
      address: {
        line1: '123 Main St',
        city: 'Test City',
        country: 'US',
      },
    };

    const response = await authenticatedRequest(context.user.sessionToken)
      .post(`/api/practice/${context.org.id}/details`)
      .send(inputData)
      .expect(200);

    expect(response.body).toMatchObject({
      business_phone: inputData.business_phone,
      website: inputData.website,
    });
    expect(response.body.address).toMatchObject({
      line1: '123 Main St',
      city: 'Test City',
      country: 'US',
    });
  });
});
```

---

### 6. Create New E2E Test Suites

#### Example: `test/e2e/auth.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { request } from '@/test/helpers/request';

describe('Authentication E2E', () => {
  it('should signup a new user', async () => {
    const response = await request
      .post('/api/auth/signup')
      .send({
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Test User',
      })
      .expect(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user).toHaveProperty('email');
  });

  it('should login with valid credentials', async () => {
    // First create a user
    const email = `test-${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    await request
      .post('/api/auth/signup')
      .send({ email, password, name: 'Test User' });

    // Then login
    const response = await request
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user.email).toBe(email);
  });

  it('should reject invalid credentials', async () => {
    const response = await request
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});
```

#### Example: `test/e2e/invoices.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestContext } from '@/test/helpers/auth';
import { authenticatedRequest } from '@/test/helpers/request';

describe('Invoices E2E', () => {
  let context: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    context = await createTestContext('owner');
  });

  it('should create a new invoice', async () => {
    const invoiceData = {
      client_id: 'client_123',
      amount: 5000,
      due_date: '2026-03-15',
      description: 'Legal services',
    };

    const response = await authenticatedRequest(context.user.sessionToken)
      .post(`/api/invoices`)
      .send(invoiceData)
      .expect(201);

    expect(response.body).toMatchObject({
      amount: 5000,
      description: 'Legal services',
    });
    expect(response.body).toHaveProperty('id');
  });

  it('should list invoices for organization', async () => {
    const response = await authenticatedRequest(context.user.sessionToken)
      .get(`/api/invoices?org_id=${context.org.id}`)
      .expect(200);

    expect(Array.isArray(response.body.invoices)).toBe(true);
  });
});
```

#### Example: `test/e2e/webhooks/stripe.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { request } from '@/test/helpers/request';
import crypto from 'crypto';

describe('Stripe Webhooks E2E', () => {
  it('should validate and process invoice.payment_succeeded webhook', async () => {
    const webhookPayload = {
      id: 'evt_test_123',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_123',
          customer: 'cus_test_123',
          amount_paid: 5000,
        },
      },
    };

    // Note: In real tests, you'd generate proper Stripe signatures
    // For now, this tests the basic flow
    const response = await request
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'test_signature')
      .send(webhookPayload)
      .expect(200);

    expect(response.body).toHaveProperty('received', true);
  });
});
```

---

### 7. Update Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

Remove old tap scripts:
```json
{
  "scripts": {
    // Remove this:
    "test": "cross-env TS_NODE_FILES=true tap test/**/*.test.ts"
  }
}
```

---

## Running Tests

### Local Development

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (re-runs on file changes)
pnpm test:watch

# Run tests with browser UI
pnpm test:ui

# Run specific test file
pnpm test test/e2e/auth.test.ts

# Run tests matching pattern
pnpm test --grep "invoice"
```

### CI/CD

Tests will automatically:
1. Drop and recreate `blawby_test` database
2. Run all migrations
3. Execute all test suites
4. Clean up database after completion

---

## Test Organization

```
test/
├── PLAN.md                          # This file
├── README.md                        # Testing guidelines
├── setup/
│   ├── globalSetup.ts              # Database initialization
│   ├── globalTeardown.ts           # Database cleanup
│   └── setupFiles.ts               # Per-file setup
├── helpers/
│   ├── db.ts                       # Test database connection
│   ├── app.ts                      # Hono app instance
│   ├── request.ts                  # Supertest helpers
│   ├── auth.ts                     # Auth helpers & factories
│   └── factories.ts                # Data factories
├── e2e/
│   ├── auth.test.ts                # Authentication flow tests
│   ├── invoices.test.ts            # Invoice API tests
│   ├── matters.test.ts             # Matter management tests
│   ├── uploads.test.ts             # File upload tests
│   └── webhooks/
│       └── stripe.test.ts          # Stripe webhook tests
└── modules/
    ├── practice/
    │   └── details.test.ts         # Practice details tests
    └── middleware/
        └── requireCaptcha.test.ts  # Middleware tests
```

---

## Best Practices

### 1. Test Isolation
- Each test should be independent and not rely on other tests
- Use `beforeEach` or `beforeAll` to set up test data
- The global setup ensures a fresh database for every test run

### 2. Meaningful Assertions
```typescript
// ✅ Good - specific assertions
expect(response.body).toHaveProperty('id');
expect(response.body.email).toBe('test@example.com');

// ❌ Avoid - too generic
expect(response.body).toBeTruthy();
```

### 3. Use Factories for Complex Data
```typescript
// ✅ Good - reusable factory
const invoice = await factories.createInvoice(org.id, {
  amount: 5000,
});

// ❌ Avoid - inline data creation everywhere
await testDb.insert(invoices).values({ /* lots of fields */ });
```

### 4. Test Real Integrations
```typescript
// ✅ Good - tests actual Stripe integration
await request.post('/api/invoices/charge')
  .send({ invoice_id: 'inv_123' });

// ❌ Avoid - mocking everything
jest.mock('stripe');
```

### 5. Descriptive Test Names
```typescript
// ✅ Good
it('should reject invoice creation without required amount field', async () => {

// ❌ Avoid
it('test invoice', async () => {
```

---

## Migration Testing Benefits

By dropping and recreating the database on each run, we automatically test that:

1. **Migrations are complete** - All schema changes are applied correctly
2. **Migrations are idempotent** - Can run multiple times safely
3. **Seeds work** - Any seed data is properly created
4. **No missing migrations** - Schema matches the application code

This catches migration issues early, before they hit production!

---

## Next Steps After Implementation

1. **Add more E2E test coverage** for critical flows
2. **Set up CI/CD integration** (GitHub Actions, etc.)
3. **Add test coverage reporting** with `vitest --coverage`
4. **Document testing patterns** for the team
5. **Consider parallel test execution** with Testcontainers if needed

---

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running locally
- Check `DATABASE_URL` in `.env.test`
- Verify database user has permissions to CREATE/DROP databases

### Migration Failures
- Run `pnpm db:generate` to ensure latest migrations are generated
- Check migration files in `drizzle/` directory
- Manually test migrations with `pnpm db:migrate`

### Slow Tests
- Check if database setup is taking too long
- Consider adding indexes for frequently queried fields
- Use `--reporter=verbose` to identify slow tests

### Import Path Issues
- Ensure `vitest.config.ts` has correct path aliases
- Check that `@/` maps to `./src/`
- Verify `tsconfig.json` includes test directory

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [Drizzle ORM Testing Guide](https://orm.drizzle.team/docs/guides/testing)
- [Hono Testing Guide](https://hono.dev/guides/testing)
