import type { SelectEngagementTemplate } from '@/modules/engagement-templates/database/schema/engagement-templates.schema';
import { engagementDraftService } from '@/modules/engagement-templates/services/engagement-draft.service';
import type { SelectPracticeClientIntake } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findTemplate: vi.fn(),
  findIntake: vi.fn(),
  findOrganization: vi.fn(),
}));

vi.mock('@/modules/engagement-templates/database/queries/engagement-templates.queries', () => ({
  engagementTemplatesQueries: {
    findByIdAndPractice: mocks.findTemplate,
  },
}));

vi.mock('@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository', () => ({
  practiceClientIntakesRepository: {
    findById: mocks.findIntake,
  },
}));

vi.mock('@/modules/practice/database/queries/organization.repository', () => ({
  organizationRepository: {
    findById: mocks.findOrganization,
  },
}));

const template = {
  id: '10000000-0000-4000-8000-000000000001',
  practice_id: '10000000-0000-4000-8000-000000000002',
  name: 'Hourly engagement',
  practice_area: 'Family law',
  fee_type: 'hourly',
  hourly_rate_cents: 35_000,
  flat_fee_cents: null,
  contingency_pct: null,
  retainer_cents: 250_000,
  scope_template: 'Represent the client in the custody matter.',
  body: 'Dear {{clientName}},\n\n{{practiceName}} will {{scope}} Rate: {{hourlyRate}}. Retainer: {{retainer}}.',
  published_at: new Date('2026-01-01T00:00:00.000Z'),
  version: 1,
  last_reviewed_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
} satisfies SelectEngagementTemplate;

const intake = {
  id: '10000000-0000-4000-8000-000000000003',
  organization_id: template.practice_id,
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
  metadata: {
    name: 'Jordan Client',
    email: 'jordan@example.com',
    description: 'Custody modification',
  },
  address_id: null,
  conversation_id: null,
  client_ip: null,
  user_agent: null,
  urgency: 'time_sensitive',
  desired_outcome: 'Modify the existing order',
  court_date: null,
  has_documents: true,
  income: null,
  household_size: null,
  case_strength: null,
  transcript_summary: null,
  enrichment_status: 'not_requested',
  enrichment_version: 0,
  enrichment_attempt_count: 0,
  enrichment_model: null,
  enrichment_error_code: null,
  enrichment_requested_at: null,
  enriched_at: null,
  jurisdiction_status: 'supported',
  jurisdiction_match: { country: 'US', state: 'NC' },
  succeeded_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
} satisfies SelectPracticeClientIntake;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findTemplate.mockResolvedValue(template);
  mocks.findIntake.mockResolvedValue(intake);
  mocks.findOrganization.mockResolvedValue({ id: template.practice_id, name: 'Blawby Legal' });
});

describe('engagementDraftService.generateEngagementDraft', () => {
  it('resolves authoritative template and intake data before calling AI', async () => {
    const faithfulDraft =
      'Dear Jordan Client,\n\nBlawby Legal will Represent the client in the custody matter. ' +
      'Rate: $350.00. Retainer: $2,500.00.';
    const generateText = vi.fn().mockResolvedValue(faithfulDraft);

    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          now: new Date('2026-07-12T00:00:00.000Z'),
          generateText,
        },
        createSystemContext(template.practice_id)
      )
    ).resolves.toEqual({
      contract_body: faithfulDraft,
      intake_id: intake.id,
      template_id: template.id,
    });

    expect(mocks.findTemplate).toHaveBeenCalledWith(template.id, template.practice_id);
    expect(generateText).toHaveBeenCalledOnce();
    const prompt = JSON.stringify(generateText.mock.calls);
    expect(prompt).toContain('Dear Jordan Client');
    expect(prompt).toContain('Blawby Legal');
    expect(prompt).toContain('$350.00');
    expect(prompt).toContain('$2,500.00');
  });

  it('rejects an intake owned by another practice before generation', async () => {
    mocks.findIntake.mockResolvedValue({ ...intake, organization_id: '10000000-0000-4000-8000-000000000099' });
    const generateText = vi.fn();

    await expect(
      engagementDraftService.generateEngagementDraft(
        { intakeId: intake.id, templateId: template.id, generateText },
        createSystemContext(template.practice_id)
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('propagates AI failures instead of returning the partial template', async () => {
    const generationError = new Error('provider unavailable');

    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          generateText: vi.fn().mockRejectedValue(generationError),
        },
        createSystemContext(template.practice_id)
      )
    ).rejects.toBe(generationError);
  });

  it('rejects generated text that leaves unresolved placeholders', async () => {
    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          generateText: vi.fn().mockResolvedValue('Dear {{unknown}},'),
        },
        createSystemContext(template.practice_id)
      )
    ).rejects.toMatchObject({ status: 502 });
  });

  it('rejects a generated draft that drops a required authoritative term', async () => {
    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          // Omits the required fee amount ($350.00) that must be preserved verbatim.
          generateText: vi.fn().mockResolvedValue('Dear Jordan Client, Blawby Legal will represent you.'),
        },
        createSystemContext(template.practice_id)
      )
    ).rejects.toMatchObject({ status: 502 });
  });

  it('rejects a generated draft that alters the authoritative fee amount', async () => {
    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          // Substitutes a different dollar figure for the authoritative $350.00 rate.
          generateText: vi
            .fn()
            .mockResolvedValue(
              'Dear Jordan Client, Blawby Legal will Represent the client in the custody matter. Rate: $450.00.'
            ),
        },
        createSystemContext(template.practice_id)
      )
    ).rejects.toMatchObject({ status: 502 });
  });

  it('rejects a generated draft that alters the authoritative scope', async () => {
    await expect(
      engagementDraftService.generateEngagementDraft(
        {
          intakeId: intake.id,
          templateId: template.id,
          // Rewrites the supplied scope instead of preserving it verbatim.
          generateText: vi
            .fn()
            .mockResolvedValue(
              'Dear Jordan Client, Blawby Legal will provide general litigation support. Rate: $350.00. Retainer: $2,500.00.'
            ),
        },
        createSystemContext(template.practice_id)
      )
    ).rejects.toMatchObject({ status: 502 });
  });
});
