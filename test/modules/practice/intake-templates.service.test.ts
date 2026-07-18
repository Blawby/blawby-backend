import { intakeTemplatesService } from '@/modules/practice/services/intake-templates.service';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  clearDefaultForOrganization: vi.fn(),
}));

vi.mock('@/modules/practice/database/queries/intake-templates.repository', () => ({
  intakeTemplatesRepository: {
    findById: mocks.findById,
    update: mocks.update,
    clearDefaultForOrganization: mocks.clearDefaultForOrganization,
  },
}));

vi.mock('@/shared/database/uow', () => ({
  getActiveTx: vi.fn(),
  uow: { transaction: vi.fn((callback: () => unknown) => callback()) },
}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const PUBLISHED_AT = new Date('2026-01-02T00:00:00.000Z');

const publishedTemplate = () => ({
  id: TEMPLATE_ID,
  organization_id: ORGANIZATION_ID,
  slug: 'general',
  name: 'General intake',
  description: null,
  status: 'published',
  revision: 3,
  published_at: PUBLISHED_AT,
  archived_at: null,
  is_default: false,
  intro_message: null,
  legal_disclaimer: null,
  payment_link_enabled: false,
  consultation_fee: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-03T00:00:00.000Z'),
  fields: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(publishedTemplate());
  mocks.update.mockResolvedValue({ ...publishedTemplate(), name: 'Updated intake', revision: 4 });
});

describe('intakeTemplatesService.updateTemplate', () => {
  it('preserves lifecycle timestamps when status is unchanged', async () => {
    const result = await intakeTemplatesService.updateTemplate(
      {
        organizationId: ORGANIZATION_ID,
        id: TEMPLATE_ID,
        data: { expected_revision: 3, name: 'Updated intake', status: 'published' },
      },
      createSystemContext(ORGANIZATION_ID, USER_ID)
    );

    expect(mocks.update).toHaveBeenCalledWith(
      TEMPLATE_ID,
      {
        slug: undefined,
        name: 'Updated intake',
        description: undefined,
        status: 'published',
        is_default: undefined,
        intro_message: undefined,
        legal_disclaimer: undefined,
        payment_link_enabled: undefined,
        consultation_fee: undefined,
      },
      undefined,
      3
    );
    expect(result.published_at).toBe(PUBLISHED_AT.toISOString());
  });
});
