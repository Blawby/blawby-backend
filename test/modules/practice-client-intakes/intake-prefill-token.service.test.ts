import { createHash } from 'node:crypto';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { intakePrefillTokenService } from '@/modules/practice-client-intakes/services/intake-prefill-token.service';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository', () => ({
  practiceClientIntakesRepository: {
    setInvitationPrefillToken: vi.fn(),
    findByInvitationPrefillTokenHash: vi.fn(),
  },
}));

vi.mock('@/modules/practice/database/queries/organization.repository', () => ({
  organizationRepository: { findById: vi.fn() },
}));

const repository = vi.mocked(practiceClientIntakesRepository);
const findOrganization = vi.mocked(organizationRepository.findById);
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const INTAKE_ID = '10000000-0000-4000-8000-000000000002';
const CONVERSATION_ID = '10000000-0000-4000-8000-000000000003';

const makeIntake = (): SelectPracticeClientIntake => ({
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
  conversation_id: CONVERSATION_ID,
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

const clientContext = () => {
  const ctx = createSystemContext(ORGANIZATION_ID, 'client-user');
  return { ...ctx, user: { ...ctx.user, email: 'client@example.com' } };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('intakePrefillTokenService', () => {
  it('stores only a short-lived SHA-256 token hash', async () => {
    repository.setInvitationPrefillToken.mockResolvedValue(true);
    const before = Date.now();

    const token = await intakePrefillTokenService.issue({ intakeId: INTAKE_ID, organizationId: ORGANIZATION_ID });

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [intakeId, organizationId, tokenHash, expiresAt] = repository.setInvitationPrefillToken.mock.calls[0] ?? [];
    expect(intakeId).toBe(INTAKE_ID);
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).not.toContain(token);
    expect(expiresAt?.getTime()).toBeGreaterThanOrEqual(before + 10 * 60 * 1_000);
    expect(expiresAt?.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1_000);
  });

  it('resolves current server-side intake data for the invited email', async () => {
    const intake = makeIntake();
    repository.findByInvitationPrefillTokenHash.mockResolvedValue(intake);
    findOrganization.mockResolvedValue({ id: ORGANIZATION_ID, name: 'Test Practice', slug: 'test-practice' });

    await expect(intakePrefillTokenService.resolve({ token: 'a'.repeat(43) }, clientContext())).resolves.toEqual({
      type: 'intake',
      intakeId: INTAKE_ID,
      conversationId: CONVERSATION_ID,
      email: 'client@example.com',
      orgName: 'Test Practice',
      orgSlug: 'test-practice',
    });
  });

  it('rejects a token resolved by a different authenticated email', async () => {
    repository.findByInvitationPrefillTokenHash.mockResolvedValue(makeIntake());
    const ctx = clientContext();
    ctx.user.email = 'other@example.com';

    await expect(intakePrefillTokenService.resolve({ token: 'a'.repeat(43) }, ctx)).rejects.toMatchObject({
      status: 403,
    });
    expect(findOrganization).not.toHaveBeenCalled();
  });

  it('returns one generic error for unknown and expired token hashes', async () => {
    repository.findByInvitationPrefillTokenHash.mockResolvedValue(undefined);

    await expect(intakePrefillTokenService.resolve({ token: 'a'.repeat(43) }, clientContext())).rejects.toMatchObject({
      status: 404,
      message: 'Invitation link is invalid or expired',
    });
  });
});
