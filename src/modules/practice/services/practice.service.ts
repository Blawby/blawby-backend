import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  findPracticeDetailsByOrganization,
} from '@/modules/practice/database/queries/practice-details.repository';
import { practiceDetails as practiceDetailsTable, type PracticeDetails } from '@/modules/practice/database/schema/practice.schema';
import {
  createOrganization,
  listOrganizations,
  getFullOrganization,
  updateOrganization,
  deleteOrganization,
  setActiveOrganization,
} from '@/modules/practice/services/organization.service';
import type {
  PracticeCreateRequest,
  PracticeUpdateRequest,
  PracticeWithDetails,
  UpdateOrganizationRequest,
} from '@/modules/practice/types/practice.types';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent, publishEventTx } from '@/shared/events/event-publisher';
import type { User, Organization } from '@/shared/types/BetterAuth';
import { Result, ok, forbidden, notFound, internalError } from '@/shared/types/result';
import betterAuthUtils from '@/shared/auth/utils/betterAuthUtils';

const { parseBetterAuthMetadata, getBetterAuthErrorMessage } = betterAuthUtils;

const logger = getLogger(['practice', 'service']);

// Practice service functions (practice = organization + optional practice details)
export const listPractices = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<Organization[]>> => {
  return listOrganizations(user, requestHeaders);
};

/**
 * Get practice by ID
 */
export const getPracticeById = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<PracticeWithDetails>> => {
  try {
    // 1. Get organization from Better Auth
    const orgResult = await getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!orgResult.success) {
      return orgResult;
    }
    const organization = orgResult.data;

    // 2. Get optional practice details
    const practiceDetails
      = await findPracticeDetailsByOrganization(organizationId);

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
      ...organization,
      ...cleanPracticeDetails,
      // Metadata needs careful casting as it's often stringified JSON in better-auth
      metadata: parseBetterAuthMetadata(organization.metadata),
    } as unknown as PracticeWithDetails);
  } catch (error) {
    logger.error('Failed to get practice for {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to get practice details');
  }
};

export const createPracticeService = async (params: {
  data: PracticeCreateRequest;
  user: User;
  requestHeaders: Record<string, string>;
}): Promise<Result<PracticeWithDetails>> => {
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
    const createResult = await createOrganization(
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

        await publishEventTx(tx, {
          type: EventType.PRACTICE_DETAILS_CREATED,
          actorId: user.id,
          actorType: 'user',
          organizationId: organization.id,
          payload: {
            practice_details_id: details.id,
            ...detailsPayload,
          },
        });

        return details;
      });
    }

    void publishSimpleEvent(EventType.PRACTICE_CREATED, user.id, organization.id, {
      organization_name: organization.name,
      organization_slug: organization.slug,
      has_practice_details: !!practiceDetails,
      practice_details_id: practiceDetails?.id,
      user_email: user.email,
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
      ...organization,
      ...cleanPracticeDetails,
      metadata: parseBetterAuthMetadata(organization.metadata),
    } as unknown as PracticeWithDetails);
  } catch (error) {
    logger.error('Failed to create practice for user {userId}: {error}', { userId: user.id, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to create practice'));
  }
};

export const updatePracticeService = async (
  organizationId: string,
  data: PracticeUpdateRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<PracticeWithDetails>> => {
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
    ) as Partial<Pick<PracticeUpdateRequest, 'name' | 'slug' | 'logo' | 'metadata'>>;

    // 2. Update organization in Better Auth
    let organization: Organization;
    if (Object.keys(filteredOrganizationData).length > 0) {
      const updateRequest: UpdateOrganizationRequest = {
        organizationId,
        data: filteredOrganizationData,
      };
      const updateResult = await updateOrganization(
        updateRequest,
        requestHeaders,
      );

      if (!updateResult.success) {
        return updateResult;
      }
      organization = updateResult.data;
    } else {
      // Just fetch existing
      const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
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
            ...practiceData as any,
          })
          .onConflictDoUpdate({
            target: practiceDetailsTable.organization_id,
            set: {
              ...practiceData as any,
              updated_at: new Date(),
            },
          })
          .returning();

        await publishEventTx(tx, {
          type: EventType.PRACTICE_DETAILS_UPDATED,
          actorId: user.id,
          actorType: 'user',
          organizationId,
          payload: {
            practice_details_id: details.id,
            ...practiceData,
          },
        });

        return details;
      });
    } else {
      // Just fetch existing details for the response
      const existing = await findPracticeDetailsByOrganization(organizationId);
      practiceDetails = existing || null;
    }

    void publishSimpleEvent(EventType.PRACTICE_UPDATED, user.id, organizationId, {
      organization_name: organization?.name || 'Unknown',
      organization_slug: organization?.slug || 'unknown',
      has_practice_details: !!practiceDetails,
      practice_details_id: practiceDetails?.id,
      user_email: user.email,
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
      ...organization,
      ...cleanPracticeDetails,
      metadata: parseBetterAuthMetadata(organization.metadata),
    } as unknown as PracticeWithDetails);
  } catch (error) {
    logger.error('Failed to update practice {organizationId}: {error}', { organizationId, error });
    return internalError(getBetterAuthErrorMessage(error, 'Failed to update practice'));
  }
};

export const deletePracticeService = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    // 1. Validate organization exists and user has access via Better Auth
    const organization = await getFullOrganization(
      organizationId,
      user,
      requestHeaders,
    );

    if (!organization) {
      return forbidden(`Organization with ID ${organizationId} not found or access denied.`);
    }

    // 2. Get practice details before deletion for event payload
    const existingPracticeDetails
      = await findPracticeDetailsByOrganization(organizationId);

    // 3. Delete optional practice details
    if (existingPracticeDetails) {
      await db.transaction(async (tx) => {
        await tx
          .delete(practiceDetailsTable)
          .where(eq(practiceDetailsTable.organization_id, organizationId));

        await publishEventTx(tx, {
          type: EventType.PRACTICE_DETAILS_DELETED,
          actorId: user.id,
          actorType: 'user',
          organizationId,
          payload: {
            practice_details_id: existingPracticeDetails.id,
            business_phone: existingPracticeDetails.business_phone,
            business_email: existingPracticeDetails.business_email,
            consultation_fee: existingPracticeDetails.consultation_fee,
            payment_url: existingPracticeDetails.payment_url,
            calendly_url: existingPracticeDetails.calendly_url,
          },
        });
      });
    }

    // 4. Delete organization in Better Auth
    await deleteOrganization(organizationId, user, requestHeaders);

    void publishSimpleEvent(EventType.PRACTICE_DELETED, user.id, organizationId, {
      had_practice_details: !!existingPracticeDetails,
      practice_details_id: existingPracticeDetails?.id,
      user_email: user.email,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to delete practice {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to delete practice');
  }
};

export const setActivePractice = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: boolean }>> => {
  try {
    // Forward to Better Auth org plugin
    const activeResult = await setActiveOrganization(organizationId, user, requestHeaders);

    if (!activeResult.success) {
      return activeResult;
    }

    // Note: Organization switch uses Better Auth API (external), so we can't use transaction
    // Event is written directly to database for guaranteed persistence
    void publishSimpleEvent(EventType.PRACTICE_SWITCHED, user.id, organizationId, {
      user_email: user.email,
      switched_to_organization: organizationId,
    });

    return ok({ success: true });
  } catch (error) {
    logger.error('Failed to set active practice {organizationId}: {error}', { organizationId, error });
    return internalError('Failed to set active practice');
  }
};
