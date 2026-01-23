/**
 * Matters Service
 *
 * Handles business logic for matters operations
 */

import { db } from '@/shared/database';
import * as mattersQueries from '@/modules/matters/database/queries/matters.queries';
import * as milestonesQueries from '@/modules/matters/database/queries/matter-milestones.queries';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import type { User } from '@/shared/types/BetterAuth';
import type {
  CreateMatterRequest,
  UpdateMatterRequest,
  ListMattersQuery,
} from '@/modules/matters/types/matter.types';
import { logMatterActivity, ActivityAction } from './matter-activity.service';

/**
 * Create a matter
 */
export const createMatter = async (
  organizationId: string,
  data: CreateMatterRequest,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  // Extract assignees and milestones from data
  const { assignee_ids, milestones, ...matterData } = data;

  // Create matter in transaction
  return await db.transaction(async (tx) => {
    // Create the matter
    const [matter] = await tx
      .insert(matters)
      .values({
        organization_id: organizationId,
        ...matterData,
      })
      .returning();

    // Add assignees if provided
    if (assignee_ids && assignee_ids.length > 0) {
      await mattersQueries.addMatterAssignees(matter.id, assignee_ids);
    }

    if (milestones && milestones.length > 0) {
      await milestonesQueries.createMatterMilestones(
        milestones.map((m: any) => ({
          matter_id: matter.id,
          description: m.description,
          amount: m.amount,
          due_date: typeof m.due_date === 'string' ? m.due_date : m.due_date.toISOString().split('T')[0],
          order: m.order,
          status: 'pending' as const,
        })),
      );
    }

    // Log activity
    await logMatterActivity(
      matter.id,
      ActivityAction.MATTER_CREATED,
      `Matter "${matter.title}" was created`,
      user.id,
      { billing_type: matter.billing_type, status: matter.status },
    );

    return matter;
  });
};

/**
 * Get matter by ID with relations
 */
export const getMatterById = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  const matter = await mattersQueries.findMatterById(matterId);

  if (!matter || matter.organization_id !== organizationId) {
    throw new Error('Matter not found');
  }

  // Get assignees
  const assignees = await mattersQueries.getMatterAssignees(matterId);

  // Get milestones
  const milestones = await milestonesQueries.listMatterMilestones(matterId);

  return {
    ...matter,
    assignees,
    milestones,
  };
};

/**
 * List matters with filters
 */
export const listMatters = async (
  organizationId: string,
  filters: ListMattersQuery,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  return await mattersQueries.listMattersByOrganization(organizationId, filters);
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
) => {
  // Verify access
  const existingMatter = await getMatterById(organizationId, matterId, user, requestHeaders);

  // Extract assignees from data
  const { assignee_ids, ...matterData } = data;

  return await db.transaction(async (tx) => {
    // Update the matter
    const updated = await mattersQueries.updateMatter(matterId, matterData);

    if (!updated) {
      throw new Error('Failed to update matter');
    }

    // Update assignees if provided
    if (assignee_ids !== undefined) {
      // Clear existing assignees and add new ones
      await mattersQueries.clearMatterAssignees(matterId);
      if (assignee_ids.length > 0) {
        await mattersQueries.addMatterAssignees(matterId, assignee_ids);
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
    );

    // Check for status change
    if (data.status && data.status !== existingMatter.status) {
      await logMatterActivity(
        matterId,
        ActivityAction.MATTER_STATUS_CHANGED,
        `Matter status changed from "${existingMatter.status}" to "${data.status}"`,
        user.id,
        { oldStatus: existingMatter.status, newStatus: data.status },
      );
    }

    return updated;
  });
};

/**
 * Delete matter (soft delete)
 */
export const deleteMatter = async (
  organizationId: string,
  matterId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify access
  await getMatterById(organizationId, matterId, user, requestHeaders);

  return await db.transaction(async (tx) => {
    const deleted = await mattersQueries.softDeleteMatter(matterId, user.id);

    if (!deleted) {
      throw new Error('Failed to delete matter');
    }

    // Log activity
    await logMatterActivity(
      matterId,
      ActivityAction.MATTER_DELETED,
      `Matter "${deleted.title}" was deleted`,
      user.id,
    );

    return deleted;
  });
};

/**
 * Get matter counts by status
 */
export const getMatterCounts = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
) => {
  // Verify user has access to organization
  await getFullOrganization(organizationId, user, requestHeaders);

  const counts = await mattersQueries.getMatterCountsByStatus(organizationId);

  // Transform to object format
  return counts.reduce((acc, { status, count }) => {
    acc[status] = count;
    return acc;
  }, {} as Record<string, number>);
};
