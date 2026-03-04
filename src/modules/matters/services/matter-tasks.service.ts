import { getLogger } from '@logtape/logtape';
import { matterTasksQueries } from '@/modules/matters/database/queries/matter-tasks.queries';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type {
  CreateMatterTaskRequest,
  GenerateMatterTasksFromTemplateRequest,
  UpdateMatterTaskRequest,
} from '@/modules/matters/types/matter.types';
import { db } from '@/shared/database';
import { membersRepository } from '@/shared/repositories/members.repository';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { badRequest, internalError, notFound, ok } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'tasks']);

const validateAssignee = async (organizationId: string, assigneeId?: string | null): Promise<Result<true>> => {
  if (assigneeId === undefined) return ok(true);
  if (assigneeId === null) return ok(true);

  const member = await membersRepository.findByOrgAndUser({
    organizationId,
    userId: assigneeId,
  });

  if (!member) {
    return badRequest('Invalid assignee_id or assignee does not belong to this organization');
  }

  return ok(true);
};

const createMatterTask = async (
  organizationId: string,
  matterId: string,
  data: CreateMatterTaskRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTask>> => {
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  const assigneeValidation = await validateAssignee(organizationId, data.assignee_id);
  if (!assigneeValidation.success) {
    return assigneeValidation;
  }

  try {
    const [task] = await matterTasksQueries.createMatterTasks({
      matter_id: matterId,
      name: data.name,
      description: data.description ?? null,
      assignee_id: data.assignee_id ?? null,
      due_date: data.due_date ?? null,
      status: data.status,
      priority: data.priority,
      stage: data.stage,
    });

    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TASK_CREATED,
      `${user.name || user.email} created task: ${task.name}`,
      user.id,
      { changed_fields: ['name', 'status', 'priority', 'stage'] },
    );

    return ok(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter task {matterId}: {error}', { matterId, error: message });
    return internalError(message);
  }
};

const listMatterTasks = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
  filters?: MatterTaskListFilters,
): Promise<Result<SelectMatterTask[]>> => {
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    if (filters?.taskId) {
      const task = await matterTasksQueries.findMatterTaskById(filters.taskId);
      if (!task || task.matter_id !== matterId) return ok([]);
      return ok([task]);
    }

    const tasks = await matterTasksQueries.listMatterTasks(matterId, filters);
    return ok(tasks);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter tasks {matterId}: {error}', { matterId, error: message });
    return internalError(message);
  }
};

const updateMatterTask = async (
  organizationId: string,
  matterId: string,
  taskId: string,
  data: UpdateMatterTaskRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTask>> => {
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  const assigneeValidation = await validateAssignee(organizationId, data.assignee_id);
  if (!assigneeValidation.success) {
    return assigneeValidation;
  }

  try {
    const existing = await matterTasksQueries.findMatterTaskById(taskId);
    if (!existing || existing.matter_id !== matterId) {
      return notFound('Task not found');
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.assignee_id !== undefined) updates.assignee_id = data.assignee_id;
    if (data.due_date !== undefined) updates.due_date = data.due_date;
    if (data.status !== undefined) updates.status = data.status;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.stage !== undefined) updates.stage = data.stage;

    const updated = await matterTasksQueries.updateMatterTask(taskId, updates);

    if (!updated) {
      return internalError('Failed to update task');
    }

    const changedFields: string[] = [];
    if (data.name !== undefined && data.name !== existing.name) changedFields.push('name');
    if (data.description !== undefined && data.description !== existing.description) changedFields.push('description');
    if (data.assignee_id !== undefined && data.assignee_id !== existing.assignee_id) changedFields.push('assignee_id');
    if (data.due_date !== undefined && data.due_date !== existing.due_date) changedFields.push('due_date');
    if (data.status !== undefined && data.status !== existing.status) changedFields.push('status');
    if (data.priority !== undefined && data.priority !== existing.priority) changedFields.push('priority');
    if (data.stage !== undefined && data.stage !== existing.stage) changedFields.push('stage');

    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TASK_UPDATED,
      `${user.name || user.email} updated task: ${updated.name}`,
      user.id,
      { changed_fields: changedFields },
    );

    if (data.status === 'complete' && existing.status !== 'complete') {
      await matterActivityService.logMatterActivity(
        matterId,
        matterActivityService.ActivityAction.TASK_COMPLETED,
        `${user.name || user.email} completed task: ${updated.name}`,
        user.id,
        { changed_fields: ['status'] },
      );
    }

    return ok(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter task {taskId}: {error}', { taskId, error: message });
    return internalError(message);
  }
};

const deleteMatterTask = async (
  organizationId: string,
  matterId: string,
  taskId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  try {
    const existing = await matterTasksQueries.findMatterTaskById(taskId);
    if (!existing || existing.matter_id !== matterId) {
      return notFound('Task not found');
    }

    await matterTasksQueries.deleteMatterTask(taskId);

    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TASK_DELETED,
      `${user.name || user.email} deleted task: ${existing.name}`,
      user.id,
      { changed_fields: ['deleted'] },
    );

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter task {taskId}: {error}', { taskId, error: message });
    return internalError(message);
  }
};

const generateMatterTasksFromTemplate = async (
  organizationId: string,
  matterId: string,
  data: GenerateMatterTasksFromTemplateRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<SelectMatterTask[]>> => {
  const matterResult = await mattersService.getMatterById(organizationId, matterId, user, requestHeaders);
  if (!matterResult.success) {
    return matterResult;
  }

  const uniqueAssigneeIds = [...new Set(
    data.tasks.map((t) => t.assignee_id).filter((id): id is string => id != null),
  )];

  for (const assigneeId of uniqueAssigneeIds) {
    const assigneeValidation = await validateAssignee(organizationId, assigneeId);
    if (!assigneeValidation.success) {
      return assigneeValidation;
    }
  }

  try {
    const createdTasks = await db.transaction(async (tx) => {
      const tasks = await matterTasksQueries.createMatterTasks(
        data.tasks.map((task) => ({
          matter_id: matterId,
          name: task.name,
          description: task.description ?? null,
          assignee_id: task.assignee_id ?? null,
          due_date: task.due_date ?? null,
          status: task.status,
          priority: task.priority,
          stage: task.stage,
        })),
        tx,
      );
      return tasks;
    });

    await matterActivityService.logMatterActivity(
      matterId,
      matterActivityService.ActivityAction.TASKS_GENERATED,
      `${user.name || user.email} generated ${createdTasks.length} task(s)${data.template_name ? ` from template "${data.template_name}"` : ''}`,
      user.id,
      {
        template_name: data.template_name ?? null,
        task_count: createdTasks.length,
        changed_fields: ['bulk_create'],
      },
    );

    return ok(createdTasks);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to generate tasks from template {matterId}: {error}', { matterId, error: message });
    return internalError(message);
  }
};

export const matterTasksService = {
  createMatterTask,
  listMatterTasks,
  updateMatterTask,
  deleteMatterTask,
  generateMatterTasksFromTemplate,
};
