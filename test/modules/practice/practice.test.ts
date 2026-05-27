import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { addresses } from '@/modules/practice/database/schema/addresses.schema';
import { practiceDetails, practiceServices } from '@/modules/practice/database/schema/practice.schema';
import practiceApp from '@/modules/practice/http';
import type { PracticeResponse } from '@/modules/practice/types/practice.types';
import { organizations } from '@/schema/better-auth-schema';
import {
  PracticeCreated,
  PracticeDetailsCreated,
  PracticeDetailsUpdated,
  PracticeUpdated,
} from '@/shared/events/definitions';
import { requireAuth } from '@/shared/middleware/requireAuth';
import { requireOrgMembership } from '@/shared/middleware/requireOrgMembership';
import { authHelpers } from '@/test/helpers/auth';
import { getTestDb } from '@/test/helpers/db';
import { createAuthenticatedRequest, createRequest } from '@/test/helpers/request';
import type { TestOrganization } from '@/test/types/shared';

const canonicalPracticeKeys = [
  'id',
  'slug',
  'name',
  'logo',
  'business_phone',
  'business_email',
  'website',
  'consultation_fee',
  'payment_url',
  'calendly_url',
  'intro_message',
  'overview',
  'accent_color',
  'is_public',
  'billing_increment_minutes',
  'payment_link_enabled',
  'services',
  'service_states',
  'supported_states',
  'address',
  'created_at',
  'updated_at',
].sort();

const authOnlyApp = new Hono();
authOnlyApp.use('/api/*', requireAuth());
authOnlyApp.route('/api/practice', practiceApp);

const protectedApp = new Hono();
protectedApp.use('/api/*', requireAuth());
protectedApp.use('/api/*', requireOrgMembership());
protectedApp.route('/api/practice', practiceApp);

const publicApp = new Hono();
publicApp.route('/api/practice', practiceApp);

const publicRequest = createRequest(publicApp.fetch);

const expectCanonicalPractice = (practice: PracticeResponse, expectedOrganizationId: string): void => {
  expect(Object.keys(practice).sort()).toEqual(canonicalPracticeKeys);
  expect(practice.id).toBe(expectedOrganizationId);
  expect(practice.created_at).toEqual(expect.any(String));
  expect(practice.updated_at).toEqual(expect.any(String));
  expect(new Date(practice.created_at).toISOString()).toBe(practice.created_at);
  expect(new Date(practice.updated_at).toISOString()).toBe(practice.updated_at);
  expect(practice).not.toHaveProperty('createdAt');
  expect(practice).not.toHaveProperty('updatedAt');
  expect(practice).not.toHaveProperty('stripeCustomerId');
  expect(practice).not.toHaveProperty('stripePaymentMethodId');
  expect(practice).not.toHaveProperty('metadata');
  expect(practice).not.toHaveProperty('organization_id');
  expect(practice).not.toHaveProperty('user_id');
  expect(practice).not.toHaveProperty('address_id');
};

describe('Practice API response contract', () => {
  const db = getTestDb();
  let org: TestOrganization;
  let sessionToken = '';
  let userId = '';
  let serviceId = '';

  beforeAll(async () => {
    vi.spyOn(PracticeCreated, 'dispatch').mockResolvedValue('test-event-id');
    vi.spyOn(PracticeUpdated, 'dispatch').mockResolvedValue('test-event-id');
    vi.spyOn(PracticeDetailsCreated, 'dispatch').mockResolvedValue('test-event-id');
    vi.spyOn(PracticeDetailsUpdated, 'dispatch').mockResolvedValue('test-event-id');

    const context = await authHelpers.createTestContext('owner');
    org = context.org;
    sessionToken = context.sessionToken;
    userId = context.session!.user.id;

    const [address] = await db
      .insert(addresses)
      .values({
        organization_id: org.id,
        type: 'practice_location',
        line1: '123 Main St',
        city: 'Raleigh',
        state: 'NC',
        postal_code: '27601',
        country: 'US',
      })
      .returning();

    await db
      .update(organizations)
      .set({
        metadata: JSON.stringify({ theme: 'blue' }),
        paymentLinkEnabled: true,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .where(eq(organizations.id, org.id));

    await db.insert(practiceDetails).values({
      organization_id: org.id,
      user_id: userId,
      address_id: address.id,
      business_phone: '+12025550101',
      business_email: 'office@example.com',
      website: 'https://example.com',
      overview: 'Family law practice',
      accent_color: '#3B82F6',
      is_public: true,
      billing_increment_minutes: 15,
      service_states: ['NC'],
      supported_states: [{ country: 'US', states: ['NC'] }],
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
    });

    const [service] = await db
      .insert(practiceServices)
      .values({ organization_id: org.id, name: 'Consultation', key: 'CONSULTATION' })
      .returning();
    serviceId = service.id;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns the canonical configured resource from all read endpoints', async () => {
    const authRequest = createAuthenticatedRequest(authOnlyApp.fetch, sessionToken);
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, sessionToken);

    const [listRes, byIdRes, detailsRes, slugRes] = await Promise.all([
      authRequest.get('/api/practice/list'),
      memberRequest.get(`/api/practice/${org.id}`),
      memberRequest.get(`/api/practice/${org.id}/details`),
      publicRequest.get(`/api/practice/details/${org.slug}`),
    ]);

    expect(listRes.status).toBe(200);
    expect(byIdRes.status).toBe(200);
    expect(detailsRes.status).toBe(200);
    expect(slugRes.status).toBe(200);

    const practices: PracticeResponse[] = [
      (listRes.body.practices as PracticeResponse[]).find((practice) => practice.id === org.id)!,
      byIdRes.body.practice as PracticeResponse,
      detailsRes.body as PracticeResponse,
      slugRes.body as PracticeResponse,
    ];

    for (const practice of practices) {
      expectCanonicalPractice(practice, org.id);
      expect(practice).toMatchObject({
        business_phone: '+12025550101',
        accent_color: '#3B82F6',
        services: [{ id: serviceId, name: 'Consultation', key: 'CONSULTATION' }],
        address: { city: 'Raleigh', state: 'NC' },
        updated_at: '2026-01-02T00:00:00.000Z',
      });
    }
  });

  it('does not synthesize practice defaults for an organization without stored details', async () => {
    const context = await authHelpers.createTestContext('owner');
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, context.sessionToken);
    const res = await memberRequest.get(`/api/practice/${context.org.id}/details`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it('returns database-backed defaults when creating a minimal practice', async () => {
    const context = await authHelpers.createTestContext('owner');
    const authRequest = createAuthenticatedRequest(authOnlyApp.fetch, context.sessionToken);
    const slug = `minimal-${randomUUID().slice(0, 20)}`;
    const res = await authRequest.post('/api/practice').send({
      name: 'Minimal Practice',
      slug,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const practice = res.body.practice as PracticeResponse;
    const [storedDetails] = await db
      .select()
      .from(practiceDetails)
      .where(eq(practiceDetails.organization_id, practice.id));
    const [storedOrganization] = await db.select().from(organizations).where(eq(organizations.id, practice.id));

    if (!storedDetails || !storedOrganization) {
      throw new Error('Minimal practice create must persist organization and practice details rows');
    }

    expect(storedDetails).toMatchObject({ is_public: false, billing_increment_minutes: 1 });
    expect(storedOrganization.paymentLinkEnabled).toBe(false);
    expectCanonicalPractice(practice, practice.id);
    expect(practice).toMatchObject({
      business_phone: storedDetails.business_phone,
      accent_color: storedDetails.accent_color,
      is_public: storedDetails.is_public,
      billing_increment_minutes: storedDetails.billing_increment_minutes,
      payment_link_enabled: storedOrganization.paymentLinkEnabled,
      services: [],
      supported_states: storedDetails.supported_states,
      service_states: storedDetails.service_states,
      address: null,
    });
  });

  it('returns the canonical post-write state when creating a practice', async () => {
    const context = await authHelpers.createTestContext('owner');
    const authRequest = createAuthenticatedRequest(authOnlyApp.fetch, context.sessionToken);
    const slug = `created-${randomUUID().slice(0, 20)}`;
    const res = await authRequest.post('/api/practice').send({
      name: 'Created Contract Practice',
      slug,
      overview: 'Created through API',
      is_public: true,
      services: [{ name: 'Advisory', key: 'ADVISORY' }],
      address: { city: 'Durham', state: 'NC', country: 'US' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const practice = res.body.practice as PracticeResponse;
    expectCanonicalPractice(practice, practice.id);
    expect(practice).toMatchObject({
      slug,
      overview: 'Created through API',
      services: [{ name: 'Advisory', key: 'ADVISORY' }],
      address: { city: 'Durham', state: 'NC', country: 'US' },
    });
  });

  it('returns the canonical post-write state when creating details', async () => {
    const context = await authHelpers.createTestContext('owner');
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, context.sessionToken);
    const res = await memberRequest.post(`/api/practice/${context.org.id}/details`).send({
      overview: 'New details record',
      services: [{ name: 'Review', key: 'REVIEW' }],
      address: { city: 'Charlotte', state: 'NC', country: 'US' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const practice = res.body as PracticeResponse;
    expectCanonicalPractice(practice, context.org.id);
    expect(practice).toMatchObject({
      overview: 'New details record',
      services: [{ name: 'Review', key: 'REVIEW' }],
      address: { city: 'Charlotte', state: 'NC', country: 'US' },
    });
  });

  it('preserves nested state after a partial unified update and details update', async () => {
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, sessionToken);
    const unifiedRes = await memberRequest.put(`/api/practice/${org.id}`).send({ overview: 'Updated overview' });
    expect(unifiedRes.status, JSON.stringify(unifiedRes.body)).toBe(200);

    const unifiedPractice = unifiedRes.body.practice as PracticeResponse;
    expectCanonicalPractice(unifiedPractice, org.id);
    expect(unifiedPractice.overview).toBe('Updated overview');
    expect(unifiedPractice.services).toEqual([{ id: serviceId, name: 'Consultation', key: 'CONSULTATION' }]);
    expect(unifiedPractice.address).toMatchObject({ city: 'Raleigh', state: 'NC' });

    const detailsRes = await memberRequest
      .put(`/api/practice/${org.id}/details`)
      .send({ overview: 'Updated through details' });
    expect(detailsRes.status, JSON.stringify(detailsRes.body)).toBe(200);

    const detailsPractice = detailsRes.body as PracticeResponse;
    expectCanonicalPractice(detailsPractice, org.id);
    expect(detailsPractice.overview).toBe('Updated through details');
    expect(detailsPractice.services).toEqual([{ id: serviceId, name: 'Consultation', key: 'CONSULTATION' }]);
    expect(detailsPractice.address).toMatchObject({ city: 'Raleigh', state: 'NC' });
  });

  it('does not expose stored organization metadata', async () => {
    await db
      .update(organizations)
      .set({ metadata: JSON.stringify({ internal: 'do-not-return' }) })
      .where(eq(organizations.id, org.id));
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, sessionToken);
    const res = await memberRequest.get(`/api/practice/${org.id}/details`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('metadata');
  });

  it('uses organization updatedAt when it is later than the details update', async () => {
    await db
      .update(practiceDetails)
      .set({ updated_at: new Date('2026-01-02T00:00:00.000Z') })
      .where(eq(practiceDetails.organization_id, org.id));
    await db
      .update(organizations)
      .set({ updatedAt: new Date('2026-01-03T00:00:00.000Z') })
      .where(eq(organizations.id, org.id));
    const memberRequest = createAuthenticatedRequest(protectedApp.fetch, sessionToken);
    const res = await memberRequest.get(`/api/practice/${org.id}/details`);

    expect(res.status).toBe(200);
    expect((res.body as PracticeResponse).updated_at).toBe('2026-01-03T00:00:00.000Z');
  });

  it('does not expose a practice through slug lookup unless it is public', async () => {
    await db.update(practiceDetails).set({ is_public: false }).where(eq(practiceDetails.organization_id, org.id));
    const res = await publicRequest.get(`/api/practice/details/${org.slug}`);
    expect(res.status).toBe(404);
  });
});
