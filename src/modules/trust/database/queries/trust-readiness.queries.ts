import { matters } from '@/modules/matters/database/schema/matters.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';

const listRetainerTargets = async (organizationId: string) =>
  getActiveTx()
    .select({
      client_id: matters.client_id,
      matter_id: matters.id,
      target_balance: matters.retainer_cap,
    })
    .from(matters)
    .where(
      and(
        eq(matters.organization_id, organizationId),
        isNull(matters.deleted_at),
        isNotNull(matters.client_id),
        isNotNull(matters.retainer_cap)
      )
    )
    .orderBy(asc(matters.id));

export const trustReadinessQueries = { listRetainerTargets };
