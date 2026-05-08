import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';
import practiceClientIntakesApp from '@/modules/practice-client-intakes/http';
import {
  practiceClientIntakes,
  type InsertPracticeClientIntake,
} from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations, subscriptions } from '@/schema/better-auth-schema';
import { requireAuth } from '@/shared/middleware/requireAuth';

vi.mock('@/shared/utils/stripe-client', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test_mock' }),
    },
    paymentLinks: {
      create: vi.fn(),
    },
  },
  getStripeInstance: () => ({
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test_mock' }),
    },
    paymentLinks: {
      create: vi.fn(),
    },
  }),
}));

vi.mock('@/shared/uploads/services/r2.service', () => ({
  r2Service: {
    generatePresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.com/presigned'),
    getFileMetadata: vi.fn().mockResolvedValue({
      exists: true,
      contentType: 'application/pdf',
      contentLength: 1024,
    }),
    generatePresignedDownloadUrl: vi.fn().mockResolvedValue('https://r2.example.com/download'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/shared/config', async (importOriginal) => {
  const actual = await importOriginal<{ config: Record<string, unknown> }>();
  return {
    ...actual,
    config: {
      ...actual.config,
      env: {
        ...(actual.config.env as Record<string, unknown>),
        app: 'test',
        node: 'test',
        isTest: true,
      },
      cloudflare: {
        r2BucketName: 'test-bucket',
        r2AccessKeyId: 'test-key',
        r2SecretAccessKey: 'test-secret',
        accountId: 'test-account',
        r2PublicUrl: 'https://r2.example.com',
        imagesAccountHash: null,
        imagesApiToken: null,
      },
    },
  };
});

const seedPublicIntakeOrganization = async (orgId: string): Promise<void> => {
  const db = getTestDb();
  const subscriptionId = randomUUID();

  await db.insert(subscriptions).values({
    id: subscriptionId,
    plan: 'platform',
    referenceId: orgId,
    status: 'active',
  });

  await db.update(organizations).set({ activeSubscriptionId: subscriptionId }).where(eq(organizations.id, orgId));
  await db.insert(stripeConnectedAccounts).values({
    id: randomUUID(),
    organization_id: orgId,
    stripe_account_id: `acct_test_${orgId.replace(/-/g, '').slice(0, 16)}`,
    account_type: 'custom',
    country: 'US',
    email: 'test@test-blawby.com',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
  });
};

const createTestIntake = async (
  orgId: string,
  intake: Partial<InsertPracticeClientIntake>
): Promise<typeof practiceClientIntakes.$inferSelect> => {
  const [result] = await getTestDb()
    .insert(practiceClientIntakes)
    .values({
      organization_id: orgId,
      amount: 0,
      currency: 'usd',
      status: 'succeeded',
      triage_status: 'pending_review',
      metadata: { email: 'test@test-blawby.com', name: 'Test User' },
      ...intake,
    })
    .returning();

  return result;
};

const authApp = new Hono();
authApp.use('/api/*', requireAuth());
authApp.route('/api/practice-client-intakes', practiceClientIntakesApp);

const unauthRequest = createRequest(authApp.fetch);

describe('Intake File Uploads API', () => {
  let staffSessionToken = '';
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let intakeId = '';
  let clientSessionToken = '';
  let clientUserId = '';

  beforeAll(async () => {
    ({ org, sessionToken: staffSessionToken } = await authHelpers.createTestContext('owner'));
    await seedPublicIntakeOrganization(org.id);

    const { user: clientUser, sessionToken } = await authHelpers.createNonOrgUserSession();
    clientSessionToken = sessionToken;
    clientUserId = clientUser.id;

    const intake = await createTestIntake(org.id, {
      amount: 0,
      status: 'succeeded',
      triage_status: 'pending_review',
      metadata: { email: 'client@test-blawby.com', name: 'Jane Doe', user_id: clientUserId },
    });
    intakeId = intake.id;
  });

  describe('POST /:uuid/files/presign', () => {
    it('staff can generate presigned URL for intake file', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const res = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'contract.pdf', mime_type: 'application/pdf', file_size: 1024 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        upload_id: expect.any(String),
        presigned_url: 'https://r2.example.com/presigned',
        method: 'PUT',
        storage_key: expect.stringContaining(`intakes/${intakeId}`),
      });
    });

    it('accepted client can generate presigned URL', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, clientSessionToken);
      const res = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'id-document.jpg', mime_type: 'image/jpeg', file_size: 512 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        upload_id: expect.any(String),
        presigned_url: 'https://r2.example.com/presigned',
        method: 'PUT',
      });
    });

    it('unauthenticated request returns 401', async () => {
      const res = await unauthRequest
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'x.pdf', mime_type: 'application/pdf', file_size: 100 });

      expect(res.status).toBe(401);
    });

    it('user without intake access returns 403', async () => {
      const { sessionToken: otherToken } = await authHelpers.createNonOrgUserSession();
      const req = createAuthenticatedRequest(authApp.fetch, otherToken);
      const res = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'x.pdf', mime_type: 'application/pdf', file_size: 100 });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /:uuid/files', () => {
    it('staff can list intake files', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const res = await req.get(`/api/practice-client-intakes/${intakeId}/files`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ uploads: expect.any(Array), total: expect.any(Number) });
    });

    it('accepted client can list intake files', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, clientSessionToken);
      const res = await req.get(`/api/practice-client-intakes/${intakeId}/files`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ uploads: expect.any(Array) });
    });

    it('supports pagination query params', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const res = await req.get(`/api/practice-client-intakes/${intakeId}/files?page=2&limit=1`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ uploads: expect.any(Array), page: 2, limit: 1 });
    });
  });

  describe('POST /:uuid/files/:upload_id/confirm', () => {
    it('can confirm a pending upload', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const presignRes = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'evidence.pdf', mime_type: 'application/pdf', file_size: 2048 });
      const { upload_id: uploadId } = presignRes.body as { upload_id: string };

      const confirmRes = await req.post(`/api/practice-client-intakes/${intakeId}/files/${uploadId}/confirm`);

      expect(presignRes.status).toBe(201);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body).toMatchObject({ upload_id: uploadId, status: 'verified' });
    });

    it('cannot confirm upload belonging to different intake', async () => {
      const otherIntake = await createTestIntake(org.id, {
        amount: 0,
        status: 'succeeded',
        triage_status: 'pending_review',
        metadata: { email: 'other@test-blawby.com', name: 'Other Client' },
      });

      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const presignRes = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'cross-intake.pdf', mime_type: 'application/pdf', file_size: 512 });
      const { upload_id: uploadId } = presignRes.body as { upload_id: string };

      const confirmRes = await req.post(`/api/practice-client-intakes/${otherIntake.id}/files/${uploadId}/confirm`);

      expect(presignRes.status).toBe(201);
      expect(confirmRes.status).toBe(403);
    });
  });

  describe('DELETE /:uuid/files/:upload_id', () => {
    it('staff can soft delete an intake file', async () => {
      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const presignRes = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'to-delete.pdf', mime_type: 'application/pdf', file_size: 256 });
      const { upload_id: uploadId } = presignRes.body as { upload_id: string };

      await req.post(`/api/practice-client-intakes/${intakeId}/files/${uploadId}/confirm`);
      const deleteRes = await req
        .delete(`/api/practice-client-intakes/${intakeId}/files/${uploadId}`)
        .send({ reason: 'Test cleanup' });

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toMatchObject({ id: uploadId, status: 'deleted' });
    });

    it('cannot delete upload belonging to different intake', async () => {
      const otherIntake = await createTestIntake(org.id, {
        amount: 0,
        status: 'succeeded',
        triage_status: 'pending_review',
        metadata: { email: 'another@test-blawby.com', name: 'Another Client' },
      });

      const req = createAuthenticatedRequest(authApp.fetch, staffSessionToken);
      const presignRes = await req
        .post(`/api/practice-client-intakes/${intakeId}/files/presign`)
        .send({ file_name: 'cross-delete.pdf', mime_type: 'application/pdf', file_size: 128 });
      const { upload_id: uploadId } = presignRes.body as { upload_id: string };

      const deleteRes = await req
        .delete(`/api/practice-client-intakes/${otherIntake.id}/files/${uploadId}`)
        .send({ reason: 'Should fail' });

      expect(presignRes.status).toBe(201);
      expect(deleteRes.status).toBe(403);
    });
  });
});
