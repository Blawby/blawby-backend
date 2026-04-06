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
import { registerPracticeClientIntakesListeners } from '@/modules/practice-client-intakes/listeners';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { Event } from '@/shared/events/event';
import { IntakeTriaged } from '@/shared/events/definitions';
import type { Event as StoredEvent } from '@/shared/events/schemas/events.schema';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { intakeHelpers } from '@/test/modules/practice-client-intakes/helpers/intake';
import type {
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

const retryAssert = async (assertion: () => void, retries = 25, delayMs = 20): Promise<void> => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

intakeHelpers.mockStripe();

describe('Practice Client Intakes API', () => {
  let session: BetterAuthInstance['$Infer']['Session'] | null = null;
  let sessionToken = '';
  let org: TestOrganization = { id: '', name: '', slug: '' };
  let intakeId = '';
  let listenersRegistered = false;

  const ensureIntakeListenersRegistered = () => {
    if (listenersRegistered) {
      return;
    }
    Event.clearHandlers();
    registerPracticeClientIntakesListeners();
    listenersRegistered = true;
  };

  beforeAll(async () => {
    ({ org, session, sessionToken } = await createTestContext('owner'));
    await intakeHelpers.seedPublicIntakeOrganization(org.id);

    // Seed a succeeded intake with required fields
    const intake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.succeeded,
      triage_status: intakeHelpers.TriageStatus.pending,
      metadata: { email: 'client@test-blawby.com', name: 'Jane Doe' },
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
        email: 'test@test-blawby.com',
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
      metadata: { email: 'checkout@test-blawby.com', name: 'Checkout User' },
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
      metadata: { email: 'update@test-blawby.com', name: 'Update User', user_id: session!.user.id },
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
    expect(data.metadata?.email).toBe('client@test-blawby.com');
    expect(data.metadata?.name).toBe('Jane Doe');
  });

  it('GET /{uuid}/status returns 401 for unauthenticated user', async () => {
    const res = await authOnlyRequest.get(`/api/practice-client-intakes/${intakeId}/status`);
    expect(res.status).toBe(401);
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

  it('accepted triage event triggers invite and linkage for payment intake flow', async () => {
    ensureIntakeListenersRegistered();

    const paymentIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 5000,
      status: intakeHelpers.IntakeStatus.succeeded,
      triage_status: intakeHelpers.TriageStatus.pending,
      metadata: { email: 'accepted-payment@test-blawby.com', name: 'Accepted Payment' },
    });

    const triggerInvitationSpy = vi
      .spyOn(intakeLifecycleService, 'triggerInvitation')
      .mockResolvedValueOnce({ success: true, data: { success: true, message: 'Magic link sent to client email' } });

    const linkClientSpy = vi.spyOn(clientsCrudService, 'createClientFromIntake').mockImplementationOnce(async () => {
      throw new Error('skip-linkage-write-in-test');
    });

    const eventRecord: StoredEvent = {
      eventId: '11111111-1111-1111-1111-111111111111',
      type: IntakeTriaged.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: session!.user.id,
      actorType: 'user',
      organizationId: org.id,
      payload: {
        intake_id: paymentIntake.id,
        organization_id: org.id,
        organization_name: org.name,
        triage_status: 'accepted',
        triage_reason: null,
        client_email: 'accepted-payment@test-blawby.com',
        client_name: 'Accepted Payment',
      },
      metadata: {
        source: 'test',
        environment: 'test',
      },
      processed: false,
      retryCount: 0,
      lastError: null,
      processedAt: null,
    };

    await Event.dispatch(IntakeTriaged.type, eventRecord);

    await retryAssert(() => {
      expect(triggerInvitationSpy).toHaveBeenCalledWith(
        { uuid: paymentIntake.id },
        expect.objectContaining({ organizationId: org.id, userId: 'system' })
      );
      expect(linkClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intakeId: paymentIntake.id,
            email: 'accepted-payment@test-blawby.com',
            name: 'Accepted Payment',
          }),
        }),
        expect.objectContaining({ organizationId: org.id, userId: 'system' })
      );
    });

    triggerInvitationSpy.mockRestore();
    linkClientSpy.mockRestore();
  });

  it('accepted triage event triggers invite and linkage for non-payment intake flow', async () => {
    ensureIntakeListenersRegistered();

    const nonPaymentIntake = await intakeHelpers.createTestIntake(org.id, {
      amount: 0,
      status: intakeHelpers.IntakeStatus.succeeded,
      triage_status: intakeHelpers.TriageStatus.pending,
      metadata: { email: 'accepted-non-payment@test-blawby.com', name: 'Accepted Non Payment' },
    });

    const triggerInvitationSpy = vi
      .spyOn(intakeLifecycleService, 'triggerInvitation')
      .mockResolvedValueOnce({ success: true, data: { success: true, message: 'Magic link sent to client email' } });

    const linkClientSpy = vi.spyOn(clientsCrudService, 'createClientFromIntake').mockImplementationOnce(async () => {
      throw new Error('skip-linkage-write-in-test');
    });

    const eventRecord: StoredEvent = {
      eventId: '22222222-2222-2222-2222-222222222222',
      type: IntakeTriaged.type,
      eventVersion: '1.0.0',
      createdAt: new Date(),
      actorId: session!.user.id,
      actorType: 'user',
      organizationId: org.id,
      payload: {
        intake_id: nonPaymentIntake.id,
        organization_id: org.id,
        organization_name: org.name,
        triage_status: 'accepted',
        triage_reason: null,
        client_email: 'accepted-non-payment@test-blawby.com',
        client_name: 'Accepted Non Payment',
      },
      metadata: {
        source: 'test',
        environment: 'test',
      },
      processed: false,
      retryCount: 0,
      lastError: null,
      processedAt: null,
    };

    await Event.dispatch(IntakeTriaged.type, eventRecord);

    await retryAssert(() => {
      expect(triggerInvitationSpy).toHaveBeenCalledWith(
        { uuid: nonPaymentIntake.id },
        expect.objectContaining({ organizationId: org.id, userId: 'system' })
      );
      expect(linkClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intakeId: nonPaymentIntake.id,
            email: 'accepted-non-payment@test-blawby.com',
            name: 'Accepted Non Payment',
          }),
        }),
        expect.objectContaining({ organizationId: org.id, userId: 'system' })
      );
    });

    triggerInvitationSpy.mockRestore();
    linkClientSpy.mockRestore();
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
