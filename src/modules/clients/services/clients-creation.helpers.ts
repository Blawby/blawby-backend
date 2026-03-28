/**
 * Client Creation Helpers
 *
 * Shared utilities for client creation flows
 */

import { membersRepository } from '@/shared/repositories/members.repository';
import { members } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ensure user is a member of the organization with client role
 */
export const ensureClientMember = async (params: {
  organizationId: string;
  userId: string;
  tx?: Tx;
}): Promise<void> => {
  const { organizationId, userId, tx } = params;

  if (tx) {
    await tx
      .insert(members)
      .values({
        organizationId,
        userId,
        role: 'client',
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: [members.organizationId, members.userId] });
    return;
  }

  const existingMember = await membersRepository.findByOrgAndUser({
    organizationId,
    userId,
  });

  if (!existingMember) {
    try {
      await membersRepository.create({
        organizationId,
        userId,
        role: 'client',
      });
    } catch (error) {
      const memberCreatedConcurrently = await membersRepository.findByOrgAndUser({ organizationId, userId });
      if (memberCreatedConcurrently) {
        return;
      }
      throw error;
    }
  }
};
