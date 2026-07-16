import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getStaffAccessibleIntakeForUpdate } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository', () => ({
  practiceClientIntakesRepository: { findByIdForUpdate: vi.fn() },
}));

const repository = vi.mocked(practiceClientIntakesRepository);
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const INTAKE_ID = '10000000-0000-4000-8000-000000000002';

const intake: SelectPracticeClientIntake = {
  id: INTAKE_ID,
  organization_id: ORGANIZATION_ID,
  connected_account_id: null,
  practice_service_id: null,
  stripe_payment_link_id: null,
  stripe_payment_intent_id: null,
  stripe_charge_id: null,
  stripe_checkout_session_id: null,
  amount: 0,
  application_fee: null,
  currency: 'usd',
  status: 'succeeded',
  triage_status: 'accepted',
  triage_reason: null,
  triage_decided_at: null,
  metadata: { email: 'client@example.com', name: 'Client' },
  address_id: null,
  conversation_id: null,
  client_ip: null,
  user_agent: null,
  invitation_prefill_token_hash: null,
  invitation_prefill_token_expires_at: null,
  urgency: null,
  desired_outcome: null,
  court_date: null,
  has_documents: null,
  income: null,
  household_size: null,
  case_strength: null,
  transcript_summary: null,
  jurisdiction_status: null,
  jurisdiction_match: null,
  succeeded_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getStaffAccessibleIntakeForUpdate', () => {
  it('uses the row-locking repository read and preserves tenant authorization', async () => {
    repository.findByIdForUpdate.mockResolvedValue(intake);

    await expect(getStaffAccessibleIntakeForUpdate(INTAKE_ID, createSystemContext(ORGANIZATION_ID))).resolves.toBe(
      intake
    );
    expect(repository.findByIdForUpdate).toHaveBeenCalledWith(INTAKE_ID);
  });

  it('rejects a locked row owned by another organization', async () => {
    repository.findByIdForUpdate.mockResolvedValue(intake);

    await expect(
      getStaffAccessibleIntakeForUpdate(INTAKE_ID, createSystemContext('10000000-0000-4000-8000-000000000099'))
    ).rejects.toMatchObject({ status: 403 });
  });
});
