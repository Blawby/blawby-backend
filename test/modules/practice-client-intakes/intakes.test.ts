import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { SuccessResponse, TestOrganization } from '@/test/types/shared';
import { toTypedResponse } from '@/test/helpers/response';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import practiceClientIntakesApp from '@/modules/practice-client-intakes/http';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type {
  ClaimPracticeClientIntakeResponse,
  ConvertIntakeResponse,
  CreateCheckoutSessionResponse,
  CreateIntakeResponse,
  IntakePostPayStatusResponse,
  IntakeSettingsResponse,
  IntakeStatusResponse,
  ListIntakeItem,
  TriggerIntakeInvitationResponse,
  UpdateIntakeTriageStatusResponse,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';

// Mock Stripe to prevent real API calls — must be in the test file so it is hoisted before any module loads
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

// Mock user details service to avoid nested db.transaction inside the outer FOR UPDATE transaction
vi.mock('@/modules/user-details/services/user-details-crud.service', () => ({
  userDetailsService: {
    createUserDetailsFromIntake: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'mock-ud-id', organization_id: 'mock-org', user_id: 'mock-user', status: 'active' },
    }),
  },
  userDetailsCrudService: {
    createUserDetailsFromIntake: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'mock-ud-id', organization_id: 'mock-org', user_id: 'mock-user', status: 'active' },
    }),
  },
}));

// Mock events to prevent side effects
vi.mock('@/shared/events/definitions', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    IntakePaymentCreated: {
      dispatch: vi.fn(),
    },
  };
});

const { createTestContext } = authHelpers;

const publicApp = new Hono();
publicApp.route('/api/practice-client-intakes', practiceClientIntakesApp);

const authOnlyApp = new Hono();
authOnlyApp.use('/api/*', requireAuth());
authOnlyApp.route('/api/practice-client-intakes', practiceClientIntakesApp);

const request = createRequest(publicApp.fetch);
const authOnlyRequest = createRequest(authOnlyApp.fetch);
const orgProtectedApp = new Hono();
orgProtectedApp.use('/api/*', requireAuth());
orgProtectedApp.use('/api/*', requireOrgMembership());
orgProtectedApp.route('/api/practice-client-intakes', practiceClientIntakesApp);
const orgProtectedRequest = createRequest(orgProtectedApp.fetch);

// Helper for authenticated requests
const authenticatedClientRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(authOnlyApp.fetch, sessionToken);

const authenticatedOrgRequest = (sessionToken: string): ReturnType<typeof createAuthenticatedRequest> =>
  createAuthenticatedRequest(orgProtectedApp.fetch, sessionToken);

intakeHelpers.mockStripe();

describe('Practice Client Intakes API', () => {
  let session: BetterAuthInstance['$Infer']['Session'] | null = null;
  let sessionToken = '';
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let intakeId = '';

  beforeAll(async () => {
    ({ org, session, sessionToken } = await createTestContext('owner'));
    await intakeHelpers.seedPublicIntakeOrganization(org.id);

    // Seed a succeeded intake with required fields
    const intake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.succeeded,
      triage_status: intakeHelpers.TriageStatus.pending,
      metadata: { email: 'client@example.com', name: 'Jane Doe' },
    });

    intakeId = intake.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== PUBLIC ENDPOINTS ====================

  it('GET /{slug}/intake returns 200 with valid org slug', async () => {
    const res = await toTypedResponse<SuccessResponse<IntakeSettingsResponse>>(
      request.get(`/api/practice-client-intakes/${org.slug}/intake`)
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.organization.id).toBe(org.id);
    expect(data.organization.name).toBe(org.name);
    expect(data.organization.slug).toBe(org.slug);
    expect(typeof data.settings.payment_link_enabled).toBe('boolean');
  });

  it('GET /{slug}/intake returns 404 for unknown slug', async () => {
    const res = await request.get('/api/practice-client-intakes/unknown-slug/intake');
    expect(res.status).toBe(404);
  });

  it('POST /create creates intake with zero amount (no payment)', async () => {
    const res = await toTypedResponse<SuccessResponse<CreateIntakeResponse>>(
      request.post('/api/practice-client-intakes/create').send({
        slug: org.slug,
        amount: 0,
        email: 'test@example.com',
        name: 'Test User',
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.status).toBe(intakeHelpers.IntakeStatus.succeeded);
    expect(data.payment_link_url).toBeNull();
    expect(data.amount).toBe(0);
    expect(typeof data.currency).toBe('string');
    expect(data.organization.name).toBe(org.name);
  });

  it('POST /create returns 400 for missing required email', async () => {
    const res = await request.post('/api/practice-client-intakes/create').send({
      slug: org.slug,
      amount: 0,
      name: 'Test User',
    });

    expect(res.status).toBe(400);
  });

  it('POST /create returns 400 for invalid email format', async () => {
    const res = await request.post('/api/practice-client-intakes/create').send({
      slug: org.slug,
      amount: 0,
      email: 'invalid-email',
      name: 'Test User',
    });

    expect(res.status).toBe(400);
  });

  it('GET /post-pay/status returns 200 with valid session_id query param', async () => {
    intakeHelpers.mockStripeSessionRetrieve({
      id: 'cs_test_xxx',
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: intakeId },
    });

    const res = await toTypedResponse<SuccessResponse<IntakePostPayStatusResponse>>(
      request.get('/api/practice-client-intakes/post-pay/status?session_id=cs_test_xxx')
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.paid).toBe(true);
    expect(res.body.data.intake_uuid).toBe(intakeId);
    expect(res.body.data.organization_id).toBe(org.id);
  });

  it('GET /post-pay/status returns 400 for missing session_id', async () => {
    const res = await request.get('/api/practice-client-intakes/post-pay/status');
    expect(res.status).toBe(400);
  });

  // ==================== CLIENT ENDPOINTS ====================

  it('POST /{uuid}/checkout-session returns 201 for authenticated user', async () => {
    // Create an open intake for checkout
    const openIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 5000,
      status: intakeHelpers.IntakeStatus.open,
      metadata: { email: 'checkout@example.com', name: 'Checkout User' },
    });

    intakeHelpers.mockStripeSessionCreate({
      id: 'cs_test_checkout',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
      paymentStatus: 'unpaid',
    });

    const res = await toTypedResponse<SuccessResponse<CreateCheckoutSessionResponse>>(
      authenticatedClientRequest(sessionToken).post(`/api/practice-client-intakes/${openIntake.id}/checkout-session`)
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toMatch(/^https?:\/\//);
    expect(typeof res.body.data.session_id).toBe('string');
  });

  it('POST /{uuid}/checkout-session returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.post(`/api/practice-client-intakes/${intakeId}/checkout-session`);
    expect(res.status).toBe(401);
  });

  it('PUT /{uuid} returns 200 for authenticated user with valid fields', async () => {
    const openIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.open,
      metadata: { email: 'update@example.com', name: 'Update User', user_id: session!.user.id },
    });

    const res = await toTypedResponse<{ success: boolean; message: string }>(
      authenticatedClientRequest(sessionToken)
        .put(`/api/practice-client-intakes/${openIntake.id}`)
        .send({
          urgency: 'time_sensitive',
          court_date: new Date('2026-06-01').toISOString(),
        })
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe('string');
  });

  it('PUT /{uuid} returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.put(`/api/practice-client-intakes/${intakeId}`).send({
      urgency: 'emergency',
    });
    expect(res.status).toBe(401);
  });

  it('GET /{uuid}/status returns 200 for authenticated owner with full metadata', async () => {
    const res = await toTypedResponse<SuccessResponse<IntakeStatusResponse>>(
      authenticatedClientRequest(sessionToken).get(`/api/practice-client-intakes/${intakeId}/status`)
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.uuid).toBe(intakeId);
    expect(data.organization_id).toBe(org.id);
    expect(data.status).toBe(intakeHelpers.IntakeStatus.succeeded);
    expect(typeof data.triage_status).toBe('string');
    expect(data.amount).toBe(0);
    expect(typeof data.currency).toBe('string');
    expect(data.metadata?.email).toBe('client@example.com');
    expect(data.metadata?.name).toBe('Jane Doe');
  });

  it('GET /{uuid}/status returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.get(`/api/practice-client-intakes/${intakeId}/status`);
    expect(res.status).toBe(401);
  });

  it('POST /claim returns 200 with valid body and authenticated user', async () => {
    const paidIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 5000,
      status: intakeHelpers.IntakeStatus.succeeded,
      metadata: { email: 'claim@example.com', name: 'Claim User' },
      stripe_checkout_session_id: 'cs_test_claim',
    });

    intakeHelpers.mockStripeSessionRetrieve({
      id: 'cs_test_claim',
      paymentStatus: 'paid',
      status: 'complete',
      metadata: { intake_uuid: paidIntake.id },
    });

    const res = await toTypedResponse<SuccessResponse<ClaimPracticeClientIntakeResponse>>(
      authenticatedClientRequest(sessionToken)
        .post('/api/practice-client-intakes/claim')
        .send({ session_id: 'cs_test_claim' })
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intake_uuid).toBe(paidIntake.id);
    expect(res.body.data.organization_id).toBe(org.id);
  });

  it('POST /claim returns 400 for missing session_id', async () => {
    const res = await authenticatedClientRequest(sessionToken).post('/api/practice-client-intakes/claim').send({});

    expect(res.status).toBe(400);
  });

  it('POST /{uuid}/claim returns 200 for authenticated user with succeeded non-payment intake', async () => {
    const freeIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.succeeded,
      metadata: { email: session!.user.email, name: session!.user.name ?? 'Test User' },
    });

    const res = await toTypedResponse<SuccessResponse<ClaimPracticeClientIntakeResponse>>(
      authenticatedClientRequest(sessionToken).post(`/api/practice-client-intakes/${freeIntake.id}/claim`)
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intake_uuid).toBe(freeIntake.id);
    expect(res.body.data.organization_id).toBe(org.id);
  });

  it('POST /{uuid}/claim returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.post(`/api/practice-client-intakes/${intakeId}/claim`);
    expect(res.status).toBe(401);
  });

  it('POST /{uuid}/claim returns 404 for unknown intake UUID', async () => {
    const unknownUuid = '00000000-0000-0000-0000-000000000000';
    const res = await authenticatedClientRequest(sessionToken).post(
      `/api/practice-client-intakes/${unknownUuid}/claim`
    );
    expect(res.status).toBe(404);
  });

  it('POST /{uuid}/claim returns 400 when intake status is not succeeded', async () => {
    const openIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 5000,
      status: intakeHelpers.IntakeStatus.open,
      metadata: { email: 'open@example.com', name: 'Open User' },
    });

    const res = await authenticatedClientRequest(sessionToken).post(
      `/api/practice-client-intakes/${openIntake.id}/claim`
    );
    expect(res.status).toBe(400);
  });

  // ==================== STAFF ENDPOINTS ====================

  it('GET /{practice_id} returns 200 with paginated intakes for staff', async () => {
    interface ListIntakesResponseBody {
      intakes: ListIntakeItem[];
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    }

    const res = await toTypedResponse<ListIntakesResponseBody>(
      authenticatedOrgRequest(sessionToken).get(`/api/practice-client-intakes/${org.id}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.intakes).toBeInstanceOf(Array);
    expect(res.body.intakes.length).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.limit).toBe('number');
    expect(typeof res.body.total_pages).toBe('number');
    const [firstIntake] = res.body.intakes;
    expect(firstIntake.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstIntake.organization_id).toBe(org.id);
    expect(typeof firstIntake.status).toBe('string');
    expect(typeof firstIntake.amount).toBe('number');
  });

  it('GET /{practice_id} returns 401 for unauthenticated user', async () => {
    const res = await orgProtectedRequest.get(`/api/practice-client-intakes/${org.id}`);
    expect(res.status).toBe(401);
  });

  // It('GET /{practice_id} returns 403 for wrong-org member', async () => {
  //   Const { user: otherUser } = await createTestContext('owner');

  //   Const res = await authenticatedOrgRequest(sessionToken).get(`/api/practice-client-intakes/${org.id}`);

  //   Expect(res.status).toBe(403);
  // });

  it('GET /{practice_id}/{id} returns 200 for authenticated staff', async () => {
    const res = await toTypedResponse<SuccessResponse<IntakeStatusResponse>>(
      authenticatedOrgRequest(sessionToken).get(`/api/practice-client-intakes/${org.id}/${intakeId}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uuid).toBe(intakeId);
    expect(res.body.data.organization_id).toBe(org.id);
  });

  it('PATCH /{uuid}/status returns 200 for accept action', async () => {
    const res = await toTypedResponse<SuccessResponse<UpdateIntakeTriageStatusResponse>>(
      authenticatedClientRequest(sessionToken)
        .patch(`/api/practice-client-intakes/${intakeId}/status`)
        .send({ status: 'accepted' })
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uuid).toBe(intakeId);
    expect(res.body.data.triage_status).toBe('accepted');
    expect(res.body.data.triage_decided_at).not.toBeNull();
  });

  it('PATCH /{uuid}/status returns 400 for invalid status value', async () => {
    const res = await authenticatedClientRequest(sessionToken)
      .patch(`/api/practice-client-intakes/${intakeId}/status`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('PATCH /{uuid}/status returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest
      .patch(`/api/practice-client-intakes/${intakeId}/status`)
      .send({ status: 'accepted' });

    expect(res.status).toBe(401);
  });

  it('PATCH /{uuid}/convert returns 201 for accepted + succeeded intake', async () => {
    await getTestDb()
      .update(practiceClientIntakes)
      .set({ triage_status: 'accepted', triage_decided_at: new Date() })
      .where(eq(practiceClientIntakes.id, intakeId));

    const res = await toTypedResponse<ConvertIntakeResponse>(
      authenticatedClientRequest(sessionToken).patch(`/api/practice-client-intakes/${intakeId}/convert`).send({
        title: 'Test Matter from Intake',
        billing_type: 'fixed',
      })
    );

    expect(res.status).toBe(201);
    expect(res.body.matter_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.matter.id).toBe(res.body.matter_id);
    expect(res.body.matter.title).toBe('Test Matter from Intake');
    expect(res.body.matter.billing_type).toBe('fixed');
    expect(res.body.matter.organization_id).toBe(org.id);
  });

  it('POST /{uuid}/invite returns 200 for valid intake', async () => {
    const res = await toTypedResponse<TriggerIntakeInvitationResponse>(
      authenticatedClientRequest(sessionToken).post(`/api/practice-client-intakes/${intakeId}/invite`)
    );

    expect(res.status).toBe(200);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});
