import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { matterDeadlinesQueries } from '@/modules/matters/database/queries/matter-deadlines.queries';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { SelectMatterDeadline } from '@/modules/matters/database/schema/matter-deadlines.schema';
import type { ServiceContext } from '@/shared/types/service-context';

type CreateDeadlineInput = {
  name: string;
  date: string;
  type: 'court' | 'statutory' | 'internal' | 'reminder';
  source?: string;
  alert_days_before?: number[];
};

type UpdateDeadlineInput = {
  name?: string;
  date?: string;
  type?: 'court' | 'statutory' | 'internal' | 'reminder';
  source?: string | null;
  alert_days_before?: number[];
};

const listDeadlines = async (_params: Record<string, never>, ctx: ServiceContext): Promise<SelectMatterDeadline[]> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  return matterDeadlinesQueries.listMatterDeadlines(matterId);
};

const createDeadline = async (
  { data }: { data: CreateDeadlineInput },
  ctx: ServiceContext
): Promise<SelectMatterDeadline> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const deadline = await matterDeadlinesQueries.createMatterDeadline({
    matter_id: matterId,
    name: data.name,
    date: data.date,
    type: data.type,
    source: data.source ?? null,
    alert_days_before: data.alert_days_before ?? [],
  });

  const userName = ctx.user?.name ?? ctx.user?.email ?? 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.DEADLINE_CREATED,
      description: `${userName} created deadline: ${data.name} (${data.date})`,
      metadata: { changed_fields: ['name', 'date', 'type'] },
    },
    ctx
  );

  return deadline;
};

const updateDeadline = async (
  { deadlineId, data }: { deadlineId: string; data: UpdateDeadlineInput },
  ctx: ServiceContext
): Promise<SelectMatterDeadline> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const existing = await matterDeadlinesQueries.findMatterDeadlineById(deadlineId);
  if (!existing || existing.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Deadline not found' });
  }

  const updated = await matterDeadlinesQueries.updateMatterDeadline(deadlineId, data);
  if (!updated) throw new HTTPException(500, { message: 'Failed to update deadline' });

  const userName = ctx.user?.name ?? ctx.user?.email ?? 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.DEADLINE_UPDATED,
      description: `${userName} updated deadline: ${updated.name}`,
      metadata: { changed_fields: Object.keys(data) },
    },
    ctx
  );

  return updated;
};

const deleteDeadline = async ({ deadlineId }: { deadlineId: string }, ctx: ServiceContext): Promise<void> => {
  const { matterId } = ctx;
  if (!matterId) throw new Error('Matter ID not found in context');

  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(matterId, ctx);

  const existing = await matterDeadlinesQueries.findMatterDeadlineById(deadlineId);
  if (!existing || existing.matter_id !== matterId) {
    throw new HTTPException(404, { message: 'Deadline not found' });
  }

  await matterDeadlinesQueries.deleteMatterDeadline(deadlineId);

  const userName = ctx.user?.name ?? ctx.user?.email ?? 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.DEADLINE_DELETED,
      description: `${userName} deleted deadline: ${existing.name}`,
      metadata: { changed_fields: ['deleted'] },
    },
    ctx
  );
};

export const matterDeadlinesService = {
  listDeadlines,
  createDeadline,
  updateDeadline,
  deleteDeadline,
};
