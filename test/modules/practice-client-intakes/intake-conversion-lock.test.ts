import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { getStaffAccessibleIntakeForUpdate } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { intakeLifecycleService } from '@/modules/practice-client-intakes/services/intake-lifecycle.service';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transactionState = vi.hoisted(() => ({ active: false, calls: 0 }));

vi.mock('@/modules/practice-client-intakes/services/intake-access.helpers', () => ({
  ensureStaffOrganizationAccess: vi.fn(),
  getStaffAccessibleIntake: vi.fn(),
  getStaffAccessibleIntakeForUpdate: vi.fn(),
}));

vi.mock('@/shared/database/uow', () => ({
  getActiveTx: vi.fn(),
  uow: {
    transaction: vi.fn(async (callback: () => Promise<unknown>) => {
      transactionState.calls += 1;
      transactionState.active = true;
      try {
        return await callback();
      } finally {
        transactionState.active = false;
      }
    }),
  },
}));

vi.mock('@/modules/matters/database/queries/matters.queries', () => ({
  mattersQueries: {
    createMatter: vi.fn(),
    findByIntakeUuid: vi.fn(),
    findMatterByIdWithRelations: vi.fn(),
  },
}));

vi.mock('@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository', () => ({
  practiceClientIntakesRepository: { updateStatus: vi.fn() },
}));

vi.mock('@/modules/clients/database/queries/clients.queries', () => ({
  clientsRepository: { findByOrgAndUser: vi.fn() },
}));

vi.mock('@/modules/intake-conversations/database/queries/intake-conversations.queries', () => ({
  intakeConversationsQueries: { updateLifecycleStatus: vi.fn() },
}));

vi.mock('@/modules/practice/database/queries/organization.repository', () => ({
  organizationRepository: { findById: vi.fn() },
}));

vi.mock('@/modules/practice-client-intakes/services/intake-prefill-token.service', () => ({
  intakePrefillTokenService: { issue: vi.fn(), resolve: vi.fn() },
}));

vi.mock('@/shared/auth/better-auth', () => ({ createBetterAuthInstance: vi.fn() }));
vi.mock('@/shared/database', () => ({ db: {} }));
vi.mock('@/shared/services/app-config.service', () => ({ appConfigService: { get: vi.fn() } }));
vi.mock('@/shared/events/definitions', () => ({ IntakeTriaged: { dispatch: vi.fn() } }));

const getLockedIntake = vi.mocked(getStaffAccessibleIntakeForUpdate);
const findMatterByIntake = vi.mocked(mattersQueries.findByIntakeUuid);
const createMatter = vi.mocked(mattersQueries.createMatter);
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const INTAKE_ID = '10000000-0000-4000-8000-000000000002';

const makeIntake = (status: string): SelectPracticeClientIntake => ({
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
  status,
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
});

beforeEach(() => {
  vi.clearAllMocks();
  transactionState.active = false;
  transactionState.calls = 0;
});

describe('intakeLifecycleService.convertIntake', () => {
  it('performs eligibility checks only after entering the row-lock transaction', async () => {
    getLockedIntake.mockImplementation(async () => {
      expect(transactionState.active).toBe(true);
      return makeIntake('open');
    });

    await expect(
      intakeLifecycleService.convertIntake({ uuid: INTAKE_ID, data: {} }, createSystemContext(ORGANIZATION_ID))
    ).rejects.toMatchObject({ status: 400, message: 'Only successful intakes can be converted to matters' });
    expect(transactionState.calls).toBe(1);
    expect(getLockedIntake).toHaveBeenCalledWith(INTAKE_ID, expect.any(Object));
  });

  it('does not create a second matter after the locked row is already converted', async () => {
    getLockedIntake.mockResolvedValue(makeIntake('converted'));
    findMatterByIntake.mockResolvedValue(undefined);

    await expect(
      intakeLifecycleService.convertIntake({ uuid: INTAKE_ID, data: {} }, createSystemContext(ORGANIZATION_ID))
    ).rejects.toMatchObject({ status: 409 });
    expect(findMatterByIntake).toHaveBeenCalledWith(INTAKE_ID);
    expect(createMatter).not.toHaveBeenCalled();
  });
});
