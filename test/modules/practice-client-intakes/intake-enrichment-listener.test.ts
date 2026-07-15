import { registerPracticeClientIntakesListeners } from '@/modules/practice-client-intakes/listeners';
import { intakeEnrichmentService } from '@/modules/practice-client-intakes/services/intake-enrichment.service';
import { Event } from '@/shared/events/event';
import { IntakePaymentSucceeded, IntakeSubmitted } from '@/shared/events/definitions';
import type { Event as StoredEvent } from '@/shared/events/schemas/events.schema';
import { queueManager } from '@/shared/queue/queue.manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/practice-client-intakes/services/intake-enrichment.service', () => ({
  intakeEnrichmentService: { requestEnrichment: vi.fn() },
}));

vi.mock('@/shared/queue/queue.manager', () => ({
  queueManager: { addEmailJob: vi.fn() },
}));

vi.mock('@/shared/services/email', () => ({
  EMAIL_TEMPLATES: {
    INTAKE_SUBMISSION_RECEIVED: 'intake-submission-received',
    INTAKE_NEW_NOTIFICATION: 'intake-new-notification',
    INTAKE_ACCEPTED: 'intake-accepted',
    INTAKE_DECLINED: 'intake-declined',
  },
}));

vi.mock('@/modules/practice-client-intakes/services/intake-lifecycle.service', () => ({
  intakeLifecycleService: { triggerInvitation: vi.fn() },
}));

vi.mock('@/modules/clients/services/clients-crud.service', () => ({
  clientsCrudService: { createClientFromIntake: vi.fn() },
}));

const requestEnrichment = vi.mocked(intakeEnrichmentService.requestEnrichment);
const addEmailJob = vi.mocked(queueManager.addEmailJob);
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const INTAKE_ID = '10000000-0000-4000-8000-000000000002';

const eventRecord = (type: string, payload: Record<string, unknown>): StoredEvent => ({
  eventId: '10000000-0000-4000-8000-000000000003',
  type,
  eventVersion: '1.0.0',
  createdAt: new Date(),
  actorId: '10000000-0000-4000-8000-000000000004',
  actorType: 'user',
  organizationId: ORGANIZATION_ID,
  payload,
  metadata: { source: 'test', environment: 'test' },
  processed: false,
  retryCount: 0,
  lastError: null,
  processedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  Event.clearHandlers();
  registerPracticeClientIntakesListeners();
  requestEnrichment.mockResolvedValue({ intake_id: INTAKE_ID, enrichment_status: 'pending', enrichment_version: 1 });
  addEmailJob.mockResolvedValue(undefined);
});

describe('completed intake enrichment triggers', () => {
  it('requests enrichment for a payment-bypassed submission', async () => {
    const payload = {
      intake_id: INTAKE_ID,
      organization_id: ORGANIZATION_ID,
      organization_name: 'Test Practice',
      billing_email: 'owner@example.com',
      client_email: 'client@example.com',
      client_name: 'Client',
      amount: 0,
      currency: 'usd',
    };

    await Event.dispatch(IntakeSubmitted.type, eventRecord(IntakeSubmitted.type, payload));

    expect(requestEnrichment).toHaveBeenCalledWith(
      { intakeId: INTAKE_ID },
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: 'system' })
    );
  });

  it('requests enrichment for a paid submission', async () => {
    const payload = {
      organization_id: ORGANIZATION_ID,
      organization_name: 'Test Practice',
      billing_email: 'owner@example.com',
      stripe_payment_intent_id: 'pi_test',
      intake_payment_id: INTAKE_ID,
      uuid: INTAKE_ID,
      amount: 5_000,
      currency: 'usd',
      client_email: 'client@example.com',
      client_name: 'Client',
      succeeded_at: new Date().toISOString(),
    };

    await Event.dispatch(IntakePaymentSucceeded.type, eventRecord(IntakePaymentSucceeded.type, payload));

    expect(requestEnrichment).toHaveBeenCalledWith(
      { intakeId: INTAKE_ID },
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: 'system' })
    );
  });

  it('lets the durable event retry before sending emails when enqueueing fails', async () => {
    requestEnrichment.mockRejectedValueOnce(new Error('queue unavailable'));
    const payload = {
      intake_id: INTAKE_ID,
      organization_id: ORGANIZATION_ID,
      organization_name: 'Test Practice',
      billing_email: 'owner@example.com',
      client_email: 'client@example.com',
      client_name: 'Client',
      amount: 0,
      currency: 'usd',
    };

    await expect(Event.dispatch(IntakeSubmitted.type, eventRecord(IntakeSubmitted.type, payload))).rejects.toThrow(
      'queue unavailable'
    );
    expect(addEmailJob).not.toHaveBeenCalled();
  });
});
