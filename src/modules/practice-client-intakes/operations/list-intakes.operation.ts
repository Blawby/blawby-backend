import { HTTPException } from 'hono/http-exception';

import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import { intakeSharedHelpers } from '@/modules/practice-client-intakes/services/intake-shared.helpers';
import type { ListIntakeItem } from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';

export interface ListIntakesQuery {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export const listIntakes = async (
  { organizationId, query }: { organizationId: string; query: ListIntakesQuery },
  ctx: LegalOperationContext
): Promise<OffsetPaginatedResponse<ListIntakeItem>> => {
  assertLegalOperationTenant(ctx, organizationId);

  if (query.from && !intakeSharedHelpers.parseValidDate(query.from)) {
    throw new HTTPException(400, { message: 'Invalid date: from' });
  }

  if (query.to && !intakeSharedHelpers.parseValidDate(query.to)) {
    throw new HTTPException(400, { message: 'Invalid date: to' });
  }

  const { intakes, total } = await practiceClientIntakesRepository.findByOrganizationId({
    organizationId,
    ...query,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return {
    data: intakes.map((intake) => intakeSharedHelpers.formatIntakeListItem(intake, { isAdmin: true })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
    },
  };
};
