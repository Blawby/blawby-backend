/**
 * Client Creation Helpers
 *
 * Shared utilities for client creation flows
 */

import { membersRepository } from '@/shared/repositories/members.repository';

/**
 * Ensure user is a member of the organization with client role
 */
export const ensureClientMember = async (params: { organizationId: string; userId: string }): Promise<void> => {
  const { organizationId, userId } = params;

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
