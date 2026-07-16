import { clients } from '@/modules/clients/database/schema/clients.schema';
import { practiceClientMemos } from '@/modules/clients/database/schema/practice-client-memos.schema';
import { matterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { practiceClientIntakes } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
import { practiceServices } from '@/modules/practice/database/schema/practice.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, asc, eq, isNull, max } from 'drizzle-orm';

const listClients = async (organizationId: string) =>
  getActiveTx()
    .select({
      id: clients.id,
      updated_at: clients.updated_at,
      intake_urgency: practiceClientIntakes.urgency,
    })
    .from(clients)
    .leftJoin(
      practiceClientIntakes,
      and(eq(clients.intake_id, practiceClientIntakes.id), eq(practiceClientIntakes.organization_id, organizationId))
    )
    .where(and(eq(clients.organization_id, organizationId), isNull(clients.deleted_at)))
    .orderBy(asc(clients.id));

const listClientMemoActivity = async (organizationId: string) =>
  getActiveTx()
    .select({
      client_id: practiceClientMemos.client_id,
      last_event_at: max(practiceClientMemos.event_time),
      last_memo_at: max(practiceClientMemos.created_at),
    })
    .from(practiceClientMemos)
    .innerJoin(clients, eq(practiceClientMemos.client_id, clients.id))
    .where(and(eq(clients.organization_id, organizationId), isNull(clients.deleted_at)))
    .groupBy(practiceClientMemos.client_id);

const listMatters = async (organizationId: string) =>
  getActiveTx()
    .select({
      id: matters.id,
      client_id: matters.client_id,
      status: matters.status,
      urgency: matters.urgency,
      matter_type: matters.matter_type,
      practice_service_name: practiceServices.name,
      responsible_attorney_id: matters.responsible_attorney_id,
      retainer_balance: matters.retainer_balance,
      retainer_low_balance_threshold: matters.retainer_low_balance_threshold,
      updated_at: matters.updated_at,
    })
    .from(matters)
    .leftJoin(
      practiceServices,
      and(eq(matters.practice_service_id, practiceServices.id), eq(practiceServices.organization_id, organizationId))
    )
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
    .orderBy(asc(matters.id));

const listMatterActivity = async (organizationId: string) =>
  getActiveTx()
    .select({
      matter_id: matterActivityLog.matter_id,
      last_activity_at: max(matterActivityLog.created_at),
    })
    .from(matterActivityLog)
    .innerJoin(matters, eq(matterActivityLog.matter_id, matters.id))
    .where(and(eq(matters.organization_id, organizationId), isNull(matters.deleted_at)))
    .groupBy(matterActivityLog.matter_id);

export const practiceInsightsQueries = {
  listClients,
  listClientMemoActivity,
  listMatters,
  listMatterActivity,
};
