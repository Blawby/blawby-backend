import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { matterTasksQueries } from '@/modules/matters/database/queries/matter-tasks.queries';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTaskListFilters, OrgTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterTaskRequest, UpdateMatterTaskRequest } from '@/modules/matters/types/matter.types';
import type { OffsetPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const createMatterTask = async (
  params: { matterId: string; data: CreateMatterTaskRequest },
  ctx: ServiceContext
): Promise<SelectMatterTask> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const createdTasks = await matterTasksQueries.createMatterTasks({
    ...params.data,
    matter_id: params.matterId,
  });

  if (!createdTasks || createdTasks.length === 0) {
    throw new Error('Failed to create matter task');
  }

  const [createdTask] = createdTasks;

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  const assigneeInfo = params.data.assignee_id ? ` (assigned to user)` : '';
  const priorityInfo = params.data.priority !== 'normal' ? ` (${params.data.priority} priority)` : '';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TASK_CREATED,
      description: `${userName} created task: ${params.data.name}${assigneeInfo}${priorityInfo}`,
      metadata: {
        task_id: createdTask.id,
        assignee_id: params.data.assignee_id,
        priority: params.data.priority,
        stage: params.data.stage,
        changed_fields: Object.keys(params.data),
      },
    },
    ctx
  );

  return createdTask;
};

const listMatterTasks = async (
  params: { matterId: string; filters?: MatterTaskListFilters },
  ctx: ServiceContext
): Promise<SelectMatterTask[]> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  return matterTasksQueries.listMatterTasks(params.matterId, params.filters);
};

const updateMatterTask = async (
  params: { matterId: string; taskId: string; data: UpdateMatterTaskRequest },
  ctx: ServiceContext
): Promise<SelectMatterTask> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
  if (!existingTask || existingTask.matter_id !== params.matterId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const updatedTask = await matterTasksQueries.updateMatterTask(params.taskId, params.data);
  if (!updatedTask) throw new HTTPException(404, { message: 'Task not found' });

  const changedFields: string[] = [];
  if (params.data.name !== undefined && params.data.name !== existingTask.name) changedFields.push('name');
  if (params.data.description !== undefined && params.data.description !== existingTask.description)
    changedFields.push('description');
  if (params.data.assignee_id !== undefined && params.data.assignee_id !== existingTask.assignee_id)
    changedFields.push('assignee_id');
  if (params.data.status !== undefined && params.data.status !== existingTask.status) changedFields.push('status');
  if (params.data.priority !== undefined && params.data.priority !== existingTask.priority)
    changedFields.push('priority');
  if (params.data.stage !== undefined && params.data.stage !== existingTask.stage) changedFields.push('stage');
  if (params.data.due_date !== undefined) {
    const newDue = params.data.due_date ? new Date(params.data.due_date).toISOString().slice(0, 10) : null;
    const existingDue = existingTask.due_date ? new Date(existingTask.due_date).toISOString().slice(0, 10) : null;
    if (newDue !== existingDue) changedFields.push('due_date');
  }

  if (changedFields.length > 0) {
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    let description = `${userName} updated task: ${updatedTask.name}`;
    if (params.data.status && params.data.status !== existingTask.status) {
      description =
        params.data.status === 'complete'
          ? `${userName} completed task: ${updatedTask.name}`
          : `${userName} changed task status to ${params.data.status}: ${updatedTask.name}`;
    }

    const isCompletion =
      params.data.status !== undefined &&
      existingTask.status !== params.data.status &&
      params.data.status === 'complete' &&
      updatedTask.status === 'complete';

    await matterActivityService.logMatterActivity(
      {
        action: isCompletion
          ? matterActivityService.ActivityAction.TASK_COMPLETED
          : matterActivityService.ActivityAction.TASK_UPDATED,
        description,
        metadata: {
          task_id: updatedTask.id,
          changed_fields: changedFields,
          old_status: existingTask.status,
          new_status: updatedTask.status,
        },
      },
      ctx
    );
  }

  return updatedTask;
};

const deleteMatterTask = async (params: { matterId: string; taskId: string }, ctx: ServiceContext): Promise<void> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Matter');
  await mattersService.verifyMatterAccess(params.matterId, ctx);

  const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
  if (!existingTask || existingTask.matter_id !== params.matterId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const deleted = await matterTasksQueries.deleteMatterTask(params.taskId);
  if (!deleted) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
  await matterActivityService.logMatterActivity(
    {
      action: matterActivityService.ActivityAction.TASK_DELETED,
      description: `${userName} deleted task: ${existingTask.name}`,
      metadata: {
        task_id: params.taskId,
        task_name: existingTask.name,
        changed_fields: ['deleted'],
      },
    },
    ctx
  );
};

const listOrganizationTasks = async (
  params: { filters?: OrgTaskListFilters },
  ctx: ServiceContext
): Promise<OffsetPaginatedResponse<SelectMatterTask>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Matter');
  const { data, total, page, limit } = await matterTasksQueries.listTasksByOrganization(
    ctx.organizationId,
    params.filters
  );
  return { data, pagination: { page, limit, total } };
};

export const matterTasksService = {
  createMatterTask,
  listMatterTasks,
  listOrganizationTasks,
  updateMatterTask,
  deleteMatterTask,
};
