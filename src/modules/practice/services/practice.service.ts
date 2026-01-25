import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { practiceDetails as practiceDetailsTable, type PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import { organizationService } from '@/modules/practice/services/organization.service';
import type {
  CreatePracticeRequest,
  UpdatePracticeRequest,
  PracticeWithDetails,
  UpdateOrganizationRequest,
} from '@/modules/practice/types/practice.types';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';
import { db } from '@/shared/database';
import {
  PracticeCreated,
  PracticeUpdated,
  PracticeDeleted,
  PracticeDetailsCreated,
  PracticeDetailsUpdated,
  PracticeDetailsDeleted,
  PracticeSwitched,
} from '@/shared/events/definitions';
import type { User, Organization } from '@/shared/types/BetterAuth';
import type { Result } from '@/shared/types/result';
import { ok, internalError } from '@/shared/utils/result';

const { parseBetterAuthMetadata, getBetterAuthErrorMessage } = betterAuthUtils;

const logger = getLogger(['practice', 'service']);

/**
 * Practice Service
 *
 * Combines organization management with optional practice-specific details
 */

/**
 * List all practices (organizations) for a user
 */
const listPractices = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ practices: Organization[] }>> => {
  const result = await organizationService.listOrganizations(user, requestHeaders);
  if (!result.success) return result;
  return ok({ practices: result.data });
};

/**
 * Get practice by ID with details
 */
const getPracticeById = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ practice: PracticeWithDetails }>> => {
  try {
    // 1. Get organization from Better Auth
    const orgResult = await organizationService.getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!orgResult.success) {
      return orgResult;
    }
    const organization = orgResult.data;

    // 2. Get optional practice details
    const practiceDetails = await findPracticeDetailsByOrganization(organizationId);

    // 3. Clean and combine data
    const cleanPracticeDetails = practiceDetails
      ? omit(practiceDetails, [
        'id',
        'organizationId',
        'userId',
        'createdAt',
        'updatedAt',
      ])
      : null;

    return ok({
      practice: {
        ...organization,
        ...cleanPracticeDetails,
        metadata: parseBetterAuthMetadata(organization.metadata),
      } as PracticeWithDetails,
    });
  } catch (error) {
    logger.error('Failed to get practice for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to get practice details');
  }
};

/**
 * Create a new practice
 */
const createPractice = async (params: {
  data: CreatePracticeRequest;
  user: User;
  requestHeaders: Record<string, string>;
}): Promise<Result<{ practice: PracticeWithDetails }>> => {
  const { data, user, requestHeaders } = params;
  try {
    // 1. Extract practice details
    const {
      business_phone,
      business_email,
      consultation_fee,
      payment_url,
      calendly_url,
      ...organizationData
    } = data;

    // 2. Create organization in Better Auth
    const createResult = await organizationService.createOrganization(
      organizationData,
      user,
      requestHeaders,
    );

    if (!createResult.success) {
      return createResult;
    }
    const organization = createResult.data;

    // 3. Create optional practice details
    let practiceDetails: PracticeDetails | null = null;
    const detailsPayload = {
      business_phone: business_phone || null,
      business_email: business_email || null,
      consultation_fee: consultation_fee || null,
      payment_url: payment_url || null,
      calendly_url: calendly_url || null,
    };
    const hasDetails = Object.values(detailsPayload).some(Boolean);

    if (hasDetails) {
      practiceDetails = await db.transaction(async (tx) => {
        const [details] = await tx
          .insert(practiceDetailsTable)
          .values({
            organization_id: organization.id,
            user_id: user.id,
            ...detailsPayload,
          })
          .returning();

        await PracticeDetailsCreated.dispatch({
          practice_details_id: details.id,
          ...detailsPayload,
        }, {
          actorId: user.id,
          actorType: 'user',
          organizationId: organization.id,
          tx,
        });

        return details;
      });
    }

    void PracticeCreated.dispatch({
      organization_name: organization.name,
      organization_slug: organization.slug,
      has_practice_details: !!practiceDetails,
      practice_details_id: practiceDetails?.id,
      user_email: user.email,
    }, {
      actorId: user.id,
      organizationId: organization.id,
    });

    // 4. Clean and return
    const cleanPracticeDetails = practiceDetails
      ? omit(practiceDetails, [
        'id',
        'organization_id',
        'user_id',
        'created_at',
        'updated_at',
      ])
      : null;

    return ok({
      practice: {
        ...organization,
        ...cleanPracticeDetails,
        metadata: parseBetterAuthMetadata(organization.metadata),
      } as PracticeWithDetails,
    });
  } catch (error) {
    logger.error('Failed to create practice for user {userId}: {error}', { userId: user.id, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to create practice'));
  }
};

/**
 * Update an existing practice
 */
const updatePractice = async (
  organizationId: string,
  data: UpdatePracticeRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ practice: PracticeWithDetails }>> => {
  try {
    // 1. Extract details and organization data
    const {
      business_phone,
      business_email,
      consultation_fee,
      payment_url,
      calendly_url,
      ...organizationData
    } = data;

    const filteredOrganizationData = Object.fromEntries(
      Object.entries(organizationData).filter(([_, value]) => value !== undefined && value !== null),
    ) as Partial<Pick<UpdatePracticeRequest, 'name' | 'slug' | 'logo' | 'metadata'>>;

    // 2. Update organization in Better Auth
    let organization: Organization;
    if (Object.keys(filteredOrganizationData).length > 0) {
      const updateRequest: UpdateOrganizationRequest = {
        organizationId,
        data: filteredOrganizationData,
      };
      const updateResult = await organizationService.updateOrganization(
        updateRequest,
        requestHeaders,
      );

      if (!updateResult.success) {
        return updateResult;
      }
      organization = updateResult.data;
    } else {
      // Just fetch existing
      const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
      if (!orgResult.success) {
        return orgResult;
      }
      organization = orgResult.data;
    }

    // 3. Update practice details
    let practiceDetails: PracticeDetails | null = null;
    const practiceData = {
      business_phone: business_phone ?? undefined,
      business_email: business_email ?? undefined,
      consultation_fee: consultation_fee ?? undefined,
      payment_url: payment_url ?? undefined,
      calendly_url: calendly_url ?? undefined,
    };

    const hasPracticeUpdate = Object.values(practiceData).some((v) => v !== undefined);

    if (hasPracticeUpdate) {
      practiceDetails = await db.transaction(async (tx) => {
        const [details] = await tx
          .insert(practiceDetailsTable)
          .values({
            organization_id: organizationId,
            user_id: user.id,
            ...practiceData,
          })
          .onConflictDoUpdate({
            target: practiceDetailsTable.organization_id,
            set: {
              ...practiceData,
              updated_at: new Date(),
            },
          })
          .returning();

        await PracticeDetailsUpdated.dispatch({
          practice_details_id: details.id,
          ...practiceData,
        }, {
          actorId: user.id,
          actorType: 'user',
          organizationId,
          tx,
        });

        return details;
      });
    } else {
      // Just fetch existing details for the response
      const existing = await findPracticeDetailsByOrganization(organizationId);
      practiceDetails = existing || null;
    }

    void PracticeUpdated.dispatch({
      organization_name: organization?.name || 'Unknown',
      organization_slug: organization?.slug || 'unknown',
      has_practice_details: !!practiceDetails,
      practice_details_id: practiceDetails?.id,
      user_email: user.email,
    }, {
      actorId: user.id,
      organizationId,
    });

    // 4. Clean and return
    const cleanPracticeDetails = practiceDetails
      ? omit(practiceDetails, [
        'id',
        'organization_id',
        'user_id',
        'created_at',
        'updated_at',
      ])
      : null;

    return ok({
      practice: {
        ...organization,
        ...cleanPracticeDetails,
        metadata: parseBetterAuthMetadata(organization.metadata),
      } as PracticeWithDetails,
    });
  } catch (error) {
    logger.error('Failed to update practice {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to update practice'));
  }
};

/**
 * Delete a practice and its details
 */
const deletePractice = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    // 1. Validate organization exists and user has access via Better Auth
    const organizationResult = await organizationService.getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!organizationResult.success) {
      return organizationResult;
    }

    // 2. Get practice details before deletion for event payload
    const existingPracticeDetails = await findPracticeDetailsByOrganization(organizationId);

    // 3. Delete optional practice details
    if (existingPracticeDetails) {
      await db.transaction(async (tx) => {
        await tx
          .delete(practiceDetailsTable)
          .where(eq(practiceDetailsTable.organization_id, organizationId));

        await PracticeDetailsDeleted.dispatch({
          practice_details_id: existingPracticeDetails.id,
          business_phone: existingPracticeDetails.business_phone,
          business_email: existingPracticeDetails.business_email,
          consultation_fee: existingPracticeDetails.consultation_fee,
          payment_url: existingPracticeDetails.payment_url,
          calendly_url: existingPracticeDetails.calendly_url,
        }, {
          actorId: user.id,
          actorType: 'user',
          organizationId,
          tx,
        });
      });
    }

    // 4. Delete organization in Better Auth
    await organizationService.deleteOrganization(organizationId, user, requestHeaders);

    void PracticeDeleted.dispatch({
      had_practice_details: !!existingPracticeDetails,
      practice_details_id: existingPracticeDetails?.id,
      user_email: user.email,
    }, {
      actorId: user.id,
      organizationId,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to delete practice {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to delete practice');
  }
};

/**
 * Set active practice for the session
 */
const setActivePractice = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    // Forward to Better Auth org plugin
    const activeResult = await organizationService.setActiveOrganization(organizationId, user, requestHeaders);

    if (!activeResult.success) {
      return activeResult;
    }

    void PracticeSwitched.dispatch({
      user_email: user.email,
      switched_to_organization: organizationId,
    }, {
      actorId: user.id,
      organizationId,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to set active practice {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to set active practice');
  }
};

export const practiceService = {
  listPractices,
  createPractice,
  updatePractice,
  deletePractice,
  getPracticeById,
  setActivePractice,
};

