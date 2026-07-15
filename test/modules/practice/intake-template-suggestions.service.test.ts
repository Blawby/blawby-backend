import { intakeTemplateSuggestionsService } from '@/modules/practice/services/intake-template-suggestions.service';
import { intakeTemplateValidations } from '@/modules/practice/validations/intake-templates.validation';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findTemplateById: vi.fn(),
  updateTemplate: vi.fn(),
  findSuggestionById: vi.fn(),
  findByRequestKey: vi.fn(),
  listStagedByTemplate: vi.fn(),
  createSuggestion: vi.fn(),
  markApproved: vi.fn(),
  markDismissed: vi.fn(),
}));

vi.mock('@/modules/practice/database/queries/intake-templates.repository', () => ({
  intakeTemplatesRepository: {
    findById: mocks.findTemplateById,
    update: mocks.updateTemplate,
  },
}));

vi.mock('@/modules/practice/database/queries/intake-template-suggestions.repository', () => ({
  intakeTemplateSuggestionsRepository: {
    findById: mocks.findSuggestionById,
    findByRequestKey: mocks.findByRequestKey,
    listStagedByTemplate: mocks.listStagedByTemplate,
    create: mocks.createSuggestion,
    markApproved: mocks.markApproved,
    markDismissed: mocks.markDismissed,
  },
}));

vi.mock('@/shared/database/uow', () => ({
  uow: { transaction: vi.fn((callback: () => unknown) => callback()) },
}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const SUGGESTION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_KEY = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const template = (revision = 1, organizationId = ORGANIZATION_ID) => ({
  id: TEMPLATE_ID,
  organization_id: organizationId,
  slug: 'general',
  name: 'General intake',
  description: null,
  status: 'draft',
  revision,
  published_at: null,
  is_default: false,
  intro_message: null,
  legal_disclaimer: null,
  payment_link_enabled: false,
  consultation_fee: null,
  archived_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  fields: [],
});

const request = {
  request_key: REQUEST_KEY,
  base_revision: 1,
  instruction: 'Add a question about court deadlines',
  proposed_edits: [
    {
      operation: 'add' as const,
      field_key: 'court_deadline',
      field: {
        key: 'court_deadline',
        label: 'When is your next court deadline?',
        field_type: 'date' as const,
        phase: 'required' as const,
        required: true,
        is_standard: false,
      },
    },
  ],
};

const suggestion = (status: 'staged' | 'approved' | 'dismissed' = 'staged') => ({
  id: SUGGESTION_ID,
  organization_id: ORGANIZATION_ID,
  template_id: TEMPLATE_ID,
  request_key: REQUEST_KEY,
  base_revision: 1,
  instruction: request.instruction,
  proposed_edits: request.proposed_edits,
  analytics_evidence: {
    status: 'unavailable',
    window: null,
    numerator: null,
    denominator: null,
    provenance: 'practice_client_intakes',
    reason: 'Intake submissions do not yet record template revision attribution.',
  },
  status,
  created_by: USER_ID,
  decided_by: status === 'staged' ? null : USER_ID,
  applied_revision: status === 'approved' ? 2 : null,
  created_at: new Date('2026-01-02T00:00:00.000Z'),
  decided_at: status === 'staged' ? null : new Date('2026-01-03T00:00:00.000Z'),
});

const context = () => createSystemContext(ORGANIZATION_ID, USER_ID);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findTemplateById.mockResolvedValue(template());
  mocks.findByRequestKey.mockResolvedValue(undefined);
  mocks.createSuggestion.mockResolvedValue(suggestion());
});

describe('intakeTemplateSuggestionsService', () => {
  it('enforces tenant isolation before staging', async () => {
    mocks.findTemplateById.mockResolvedValue(template(1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

    await expect(
      intakeTemplateSuggestionsService.stageSuggestion(
        { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, data: request },
        context()
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.createSuggestion).not.toHaveBeenCalled();
  });

  it('rejects a stale base revision', async () => {
    mocks.findTemplateById.mockResolvedValue(template(2));

    await expect(
      intakeTemplateSuggestionsService.stageSuggestion(
        { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, data: request },
        context()
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns an identical request-key replay even after the template advances', async () => {
    mocks.findTemplateById.mockResolvedValue(template(2));
    mocks.findByRequestKey.mockResolvedValue(suggestion());

    const result = await intakeTemplateSuggestionsService.stageSuggestion(
      { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, data: request },
      context()
    );

    expect(result.id).toBe(SUGGESTION_ID);
    expect(mocks.createSuggestion).not.toHaveBeenCalled();
  });

  it('persists explicit unavailable analytics rather than invented conversion evidence', async () => {
    const result = await intakeTemplateSuggestionsService.stageSuggestion(
      { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, data: request },
      context()
    );

    expect(mocks.createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        analytics_evidence: expect.objectContaining({
          status: 'unavailable',
          numerator: null,
          denominator: null,
          provenance: 'practice_client_intakes',
        }),
      })
    );
    expect(result.analytics_evidence.status).toBe('unavailable');
  });

  it('lists only staged suggestions through the staged repository contract', async () => {
    mocks.listStagedByTemplate.mockResolvedValue([suggestion()]);

    const result = await intakeTemplateSuggestionsService.listSuggestions(
      { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID },
      context()
    );

    expect(mocks.listStagedByTemplate).toHaveBeenCalledWith(ORGANIZATION_ID, TEMPLATE_ID);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.status).toBe('staged');
  });

  it('rejects malformed structured proposals at the API boundary', () => {
    const malformed = intakeTemplateValidations.createIntakeTemplateSuggestionSchema.safeParse({
      ...request,
      proposed_edits: [{ operation: 'rephrase', field_key: 'description', changes: {} }],
    });

    expect(malformed.success).toBe(false);
  });

  it('rejects approval when the template revision no longer matches the proposal', async () => {
    mocks.findSuggestionById.mockResolvedValue(suggestion());
    mocks.findTemplateById.mockResolvedValue(template(2));

    await expect(
      intakeTemplateSuggestionsService.approveSuggestion(
        {
          organizationId: ORGANIZATION_ID,
          templateId: TEMPLATE_ID,
          suggestionId: SUGGESTION_ID,
          expectedRevision: 2,
        },
        context()
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
  });

  it('treats approval replay as idempotent without applying edits twice', async () => {
    mocks.findSuggestionById.mockResolvedValue(suggestion('approved'));
    mocks.findTemplateById.mockResolvedValue(template(2));

    const result = await intakeTemplateSuggestionsService.approveSuggestion(
      {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        suggestionId: SUGGESTION_ID,
        expectedRevision: 1,
      },
      context()
    );

    expect(result.suggestion.status).toBe('approved');
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
  });

  it('applies a staged proposal once and records the resulting revision', async () => {
    mocks.findSuggestionById.mockResolvedValue(suggestion());
    mocks.findTemplateById.mockResolvedValue(template(1));
    mocks.updateTemplate.mockResolvedValue(template(2));
    mocks.markApproved.mockResolvedValue(suggestion('approved'));

    const result = await intakeTemplateSuggestionsService.approveSuggestion(
      {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        suggestionId: SUGGESTION_ID,
        expectedRevision: 1,
      },
      context()
    );

    expect(mocks.updateTemplate).toHaveBeenCalledWith(
      TEMPLATE_ID,
      {},
      [expect.objectContaining({ key: 'court_deadline', order_index: 0, template_id: TEMPLATE_ID })],
      1
    );
    expect(mocks.markApproved).toHaveBeenCalledWith(SUGGESTION_ID, USER_ID, 2);
    expect(result).toMatchObject({
      suggestion: { status: 'approved', applied_revision: 2 },
      template: { revision: 2 },
    });
  });

  it('returns an approval that wins a conditional-transition race', async () => {
    mocks.findSuggestionById.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion('approved'));
    mocks.findTemplateById.mockResolvedValueOnce(template(1)).mockResolvedValueOnce(template(2));
    mocks.updateTemplate.mockResolvedValue(template(2));
    mocks.markApproved.mockRejectedValue(new Error('Suggestion is no longer staged'));

    const result = await intakeTemplateSuggestionsService.approveSuggestion(
      {
        organizationId: ORGANIZATION_ID,
        templateId: TEMPLATE_ID,
        suggestionId: SUGGESTION_ID,
        expectedRevision: 1,
      },
      context()
    );

    expect(result).toMatchObject({ suggestion: { status: 'approved' }, template: { revision: 2 } });
  });

  it('returns 409 when dismissal wins an approval transition race', async () => {
    mocks.findSuggestionById.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion('dismissed'));
    mocks.findTemplateById.mockResolvedValue(template(1));
    mocks.updateTemplate.mockResolvedValue(template(2));
    mocks.markApproved.mockRejectedValue(new Error('Suggestion is no longer staged'));

    await expect(
      intakeTemplateSuggestionsService.approveSuggestion(
        {
          organizationId: ORGANIZATION_ID,
          templateId: TEMPLATE_ID,
          suggestionId: SUGGESTION_ID,
          expectedRevision: 1,
        },
        context()
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('returns a dismissal that wins a conditional-transition race', async () => {
    mocks.findSuggestionById.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion('dismissed'));
    mocks.markDismissed.mockRejectedValue(new Error('Suggestion is no longer staged'));

    const result = await intakeTemplateSuggestionsService.dismissSuggestion(
      { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, suggestionId: SUGGESTION_ID },
      context()
    );

    expect(result.status).toBe('dismissed');
  });

  it('returns 409 when approval wins a dismissal transition race', async () => {
    mocks.findSuggestionById.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion('approved'));
    mocks.markDismissed.mockRejectedValue(new Error('Suggestion is no longer staged'));

    await expect(
      intakeTemplateSuggestionsService.dismissSuggestion(
        { organizationId: ORGANIZATION_ID, templateId: TEMPLATE_ID, suggestionId: SUGGESTION_ID },
        context()
      )
    ).rejects.toMatchObject({ status: 409 });
  });
});
