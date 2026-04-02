import { getLogger } from '@logtape/logtape';
import { matterTasksQueries } from '@/modules/matters/database/queries/matter-tasks.queries';
import type { SelectMatterTask } from '@/modules/matters/database/schema/matter-tasks.schema';
import { matterActivityService } from '@/modules/matters/services/matter-activity.service';
import { mattersService } from '@/modules/matters/services/matters.service';
import type { MatterTaskListFilters } from '@/modules/matters/types/matter-filters.types';
import type { CreateMatterTaskRequest, UpdateMatterTaskRequest } from '@/modules/matters/types/matter.types';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { ok, notFound, internalError } from '@/shared/utils/result';

const logger = getLogger(['matters', 'services', 'tasks']);

const createMatterTask = async (
  params: { matterId: string; data: CreateMatterTaskRequest },
  ctx: ServiceContext
): Promise<Result<SelectMatterTask>> => {
  try {
    // Verify matter exists and user has access
    const matterResult = await mattersService.getMatterById(params.matterId, ctx);
    if (!matterResult.success) {
      return matterResult as Result<never>;
    }

    const taskData = {
      ...params.data,
      matter_id: params.matterId,
    };

    const [task] = await matterTasksQueries.createMatterTasks(taskData);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const assigneeInfo = params.data.assignee_id 
      ? ` (assigned to user)` 
      : '';
    const priorityInfo = params.data.priority !== 'normal' 
      ? ` (${params.data.priority} priority)` 
      : '';
    
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.TASK_CREATED,
        description: `${userName} created task: ${params.data.name}${assigneeInfo}${priorityInfo}`,
        metadata: { 
          task_id: task.id,
          assignee_id: params.data.assignee_id,
          priority: params.data.priority,
          stage: params.data.stage,
          changed_fields: ['created'] 
        },
      },
      ctx
    );

    if (!activityResult.success) {
      logger.error('Failed to log task create activity {matterId}: {error}', {
        matterId: params.matterId,
        error: activityResult.error.message,
      });
    }

    return ok(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter task {matterId}: {error}', {
      matterId: params.matterId,
      error: message,
    });
    return internalError('Failed to create matter task');
  }
};

const listMatterTasks = async (
  params: { matterId: string; filters?: MatterTaskListFilters },
  ctx: ServiceContext
): Promise<Result<SelectMatterTask[]>> => {
  try {
    // Verify matter exists and user has access
    const matterResult = await mattersService.getMatterById(params.matterId, ctx);
    if (!matterResult.success) {
      return matterResult as Result<never>;
    }

    const tasks = await matterTasksQueries.listMatterTasks(params.matterId, params.filters);
    return ok(tasks);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matter tasks {matterId}: {error}', {
      matterId: params.matterId,
      error: message,
    });
    return internalError('Failed to list matter tasks');
  }
};

const updateMatterTask = async (
  params: { matterId: string; taskId: string; data: UpdateMatterTaskRequest },
  ctx: ServiceContext
): Promise<Result<SelectMatterTask>> => {
  try {
    // Verify matter exists and user has access
    const matterResult = await mattersService.getMatterById(params.matterId, ctx);
    if (!matterResult.success) {
      return matterResult as Result<never>;
    }

    // Get existing task to track changes
    const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
    if (!existingTask || existingTask.matter_id !== params.matterId) {
      return notFound('Task not found');
    }

    const updatedTask = await matterTasksQueries.updateMatterTask(params.taskId, params.data);
    if (!updatedTask) {
      return notFound('Task not found');
    }

    // Track changed fields for activity logging
    const changedFields: string[] = [];
    if (params.data.name !== undefined && params.data.name !== existingTask.name) {
      changedFields.push('name');
    }
    if (params.data.description !== undefined && params.data.description !== existingTask.description) {
      changedFields.push('description');
    }
    if (params.data.assignee_id !== undefined && params.data.assignee_id !== existingTask.assignee_id) {
      changedFields.push('assignee_id');
    }
    if (params.data.due_date !== undefined && params.data.due_date !== existingTask.due_date) {
      changedFields.push('due_date');
    }
    if (params.data.status !== undefined && params.data.status !== existingTask.status) {
      changedFields.push('status');
    }
    if (params.data.priority !== undefined && params.data.priority !== existingTask.priority) {
      changedFields.push('priority');
    }
    if (params.data.stage !== undefined && params.data.stage !== existingTask.stage) {
      changedFields.push('stage');
    }

    // Log activity
    if (changedFields.length > 0) {
      const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
      let description = `${userName} updated task: ${updatedTask.name}`;
      
      // Add specific status change info
      if (params.data.status && params.data.status !== existingTask.status) {
        if (params.data.status === 'complete') {
          description = `${userName} completed task: ${updatedTask.name}`;
        } else {
          description = `${userName} changed task status to ${params.data.status}: ${updatedTask.name}`;
        }
      }

      const activityResult = await matterActivityService.logMatterActivity(
        {
          action: params.data.status === 'complete' 
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

      if (!activityResult.success) {
        logger.error('Failed to log task update activity {taskId}: {error}', {
          taskId: params.taskId,
          error: activityResult.error.message,
        });
      }
    }

    return ok(updatedTask);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter task {taskId}: {error}', {
      taskId: params.taskId,
      error: message,
    });
    return internalError('Failed to update matter task');
  }
};

const deleteMatterTask = async (
  params: { matterId: string; taskId: string },
  ctx: ServiceContext
): Promise<Result<void>> => {
  try {
    // Verify matter exists and user has access
    const matterResult = await mattersService.getMatterById(params.matterId, ctx);
    if (!matterResult.success) {
      return matterResult as Result<never>;
    }

    // Get task details for activity logging before deletion
    const existingTask = await matterTasksQueries.findMatterTaskById(params.taskId);
    if (!existingTask || existingTask.matter_id !== params.matterId) {
      return notFound('Task not found');
    }

    await matterTasksQueries.deleteMatterTask(params.taskId);

    // Log activity
    const userName = ctx.user?.name || ctx.user?.email || 'Unknown User';
    const activityResult = await matterActivityService.logMatterActivity(
      {
        action: matterActivityService.ActivityAction.TASK_DELETED,
        description: `${userName} deleted task: ${existingTask.name}`,
        metadata: { 
          task_id: params.taskId,
          task_name: existingTask.name,
          changed_fields: ['deleted'] 
        },
      },
      ctx
    );

    if (!activityResult.success) {
      logger.error('Failed to log task delete activity {taskId}: {error}', {
        taskId: params.taskId,
        error: activityResult.error.message,
      });
    }

    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter task {taskId}: {error}', {
      taskId: params.taskId,
      error: message,
    });
    return internalError('Failed to delete matter task');
  }
};

export const matterTasksService = {
  createMatterTask,
  listMatterTasks,
  updateMatterTask,
  deleteMatterTask,
};
