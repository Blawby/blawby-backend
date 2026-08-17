import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { loadPracticeResponseById } from '@/modules/practice/services/practice-response.loader';
import type { PracticeResponse } from '@/modules/practice/types/practice.types';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['practice', 'get-practice-details-operation']);

/**
 * Get full practice details (structured UI view)
 */
export const getPracticeDetails = async (
  { organizationId }: { organizationId: string },
  ctx: LegalOperationContext
): Promise<PracticeResponse> => {
  assertLegalOperationTenant(ctx, organizationId);

  try {
    const practice = await loadPracticeResponseById(organizationId);
    if (!practice) {
      throw new HTTPException(404, { message: `Practice not found for '${organizationId}'` });
    }

    return practice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get practice details for {organizationId}: {error}', { organizationId, error });
    throw new HTTPException(500, { message: 'Failed to get practice details' });
  }
};
