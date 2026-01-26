import { getLogger } from '@logtape/logtape';
import milestonesQueries from '@/modules/matters/database/queries/matter-milestones.queries';
import mattersQueries from '@/modules/matters/database/queries/matters.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { logMatterActivity, ActivityAction } from '@/modules/matters/services/matter-activity.service';
import type {
  CreateMatterRequest,
  UpdateMatterRequest,
  ListMattersQuery,
  MatterResponse,
} from '@/modules/matters/types/matter.types';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import {
  MatterCreated,
  MatterUpdated,
  MatterDeleted,
  MatterStatusChanged,
} from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError, notFound } from '@/shared/utils/result';

const logger = getLogger(['matters', 'service']);

/**
 * Create a matter
 */
export const createMatter = async (
  organizationId: string,
  data: CreateMatterRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to create matter: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  // Extract assignees and milestones from data
  const { assignee_ids, milestones, ...matterData } = data;

  try {
    // Create matter in transaction
    const matter = await db.transaction(async (tx) => {
      // Create the matter
      const [newMatter] = await tx
        .insert(matters)
        .values({
          organization_id: organizationId,
          ...matterData,
        })
        .returning();

      // Add assignees if provided
      if (assignee_ids && assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(newMatter.id, assignee_ids, tx);
      }

      if (milestones && milestones.length > 0) {
        await milestonesQueries.createMatterMilestones(
          milestones.map((milestone) => ({
            matter_id: newMatter.id,
            description: milestone.description,
            amount: milestone.amount,
            due_date: typeof milestone.due_date === 'string' ? milestone.due_date : milestone.due_date.toISOString().split('T')[0],
            order: milestone.order,
            status: 'pending' as const,
          })),
          tx,
        );
      }

      // Log activity
      await logMatterActivity(
        newMatter.id,
        ActivityAction.MATTER_CREATED,
        `Matter "${newMatter.title}" was created`,
        user.id,
        { billing_type: newMatter.billing_type, status: newMatter.status },
        tx,
      );

      // Dispatch event
      await MatterCreated.dispatch(
        {
          matter_id: newMatter.id,
          organization_id: organizationId,
          title: newMatter.title,
          billing_type: newMatter.billing_type,
        },
        { tx, actorId: user.id, organizationId },
      );

      return newMatter;
    });

    return ok({
      ...matter,
      created_at: matter.created_at.toISOString(),
      updated_at: matter.updated_at.toISOString(),
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create matter {organizationId} {userId}: {error}', {
      organizationId,
      userId: user.id,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get matter by ID with relations
 */
export const getMatterById = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to get matter: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const matter = await mattersQueries.findMatterByIdWithRelations(matterId);

    if (!matter || matter.organization_id !== organizationId) {
      logger.warn('Matter not found or does not belong to organization {matterId} {organizationId}', {
        matterId,
        organizationId,
      });
      return notFound('Matter not found');
    }

    return ok({
      ...matter,
      assignees: matter.assignees.map((a) => a.user),
      created_at: matter.created_at.toISOString(),
      updated_at: matter.updated_at.toISOString(),
      deleted_at: matter.deleted_at?.toISOString(),
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * List matters with filters
 */
export const listMatters = async (
  organizationId: string,
  filters: ListMattersQuery,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ matters: MatterResponse[]; total: number }>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to list matters: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const result = await mattersQueries.listMattersByOrganization(organizationId, filters);
    return ok({
      matters: result.matters.map((m) => ({
        ...m,
        created_at: m.created_at.toISOString(),
        updated_at: m.updated_at.toISOString(),
        deleted_at: m.deleted_at?.toISOString(),
      })),
      total: result.total,
    } as { matters: MatterResponse[]; total: number });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list matters {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Update matter
 */
export const updateMatter = async (
  organizationId: string,
  matterId: string,
  data: UpdateMatterRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<MatterResponse>> => {
  // Verify access
  const existingResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!existingResult.success) {
    return existingResult;
  }
  const existingMatter = existingResult.data;

  // Extract assignees from data
  const { assignee_ids, ...matterData } = data;

  try {
    const result = await db.transaction(async (tx) => {
      // Update the matter
      const updated = await mattersQueries.updateMatter(matterId, matterData, tx);

      if (!updated) {
        throw new Error('Failed to update matter');
      }

      // Update assignees if provided
      if (assignee_ids !== undefined) {
        // Clear existing assignees and add new ones
        await mattersQueries.clearMatterAssignees(matterId, tx);
        if (assignee_ids.length > 0) {
          await mattersQueries.addMatterAssignees(matterId, assignee_ids, tx);
        }
      }

      // Log activity
      const changes = Object.keys(matterData);
      await logMatterActivity(
        matterId,
        ActivityAction.MATTER_UPDATED,
        `Matter "${updated.title}" was updated (${changes.join(', ')})`,
        user.id,
        { changes: matterData },
        tx,
      );

      // Check for status change
      if (data.status && data.status !== existingMatter.status) {
        await logMatterActivity(
          matterId,
          ActivityAction.MATTER_STATUS_CHANGED,
          `Matter status changed from "${existingMatter.status}" to "${data.status}"`,
          user.id,
          { oldStatus: existingMatter.status, newStatus: data.status },
          tx,
        );

        await MatterStatusChanged.dispatch(
          {
            matter_id: matterId,
            organization_id: organizationId,
            old_status: existingMatter.status,
            new_status: data.status,
          },
          { tx, actorId: user.id, organizationId },
        );
      }

      // Dispatch update event
      await MatterUpdated.dispatch(
        {
          matter_id: matterId,
          organization_id: organizationId,
          changes: matterData as Record<string, unknown>,
        },
        { tx, actorId: user.id, organizationId },
      );

      return updated;
    });

    return ok({
      ...result,
      created_at: result.created_at.toISOString(),
      updated_at: result.updated_at.toISOString(),
      deleted_at: result.deleted_at?.toISOString(),
    } as MatterResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Delete matter (soft delete)
 */
export const deleteMatter = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  // Verify access
  const existingResult = await getMatterById(organizationId, matterId, user, requestHeaders);
  if (!existingResult.success) {
    return existingResult;
  }

  try {
    await db.transaction(async (tx) => {
      const deleted = await mattersQueries.softDeleteMatter(matterId, user.id, tx);

      if (!deleted) {
        throw new Error('Failed to delete matter');
      }

      // Log activity
      await logMatterActivity(
        matterId,
        ActivityAction.MATTER_DELETED,
        `Matter "${deleted.title}" was deleted`,
        user.id,
        undefined,
        tx,
      );

      // Dispatch event
      await MatterDeleted.dispatch(
        {
          matter_id: matterId,
          organization_id: organizationId,
        },
        { tx, actorId: user.id, organizationId },
      );

      return deleted;
    });

    return ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete matter {matterId}: {error}', {
      matterId,
      error: message,
    });
    return internalError(message);
  }
};

/**
 * Get matter counts by status
 */
export const getMatterCounts = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Record<string, number>>> => {
  // Verify user has access to organization
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) {
    logger.error('Failed to get matter counts: Organization not found or access denied {organizationId} {userId}', {
      organizationId,
      userId: user.id,
      error: orgResult.error,
    });
    return orgResult;
  }

  try {
    const counts = await mattersQueries.getMatterCountsByStatus(organizationId);

    // Transform to object format
    const transformed = counts.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    return ok(transformed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get matter counts {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return internalError(message);
  }
};
