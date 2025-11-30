import { eq } from 'drizzle-orm';
import { omit } from 'es-toolkit/compat';
import {
  createPracticeDetails,
  findPracticeDetailsByOrganization,
  upsertPracticeDetails,
  deletePracticeDetails,
} from '@/modules/practice/database/queries/practice-details.repository';
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
import { organizations } from '@/schema/better-auth-schema';
import { db } from '@/shared/database';
import { EventType } from '@/shared/events/enums/event-types';
import { publishSimpleEvent } from '@/shared/events/event-publisher';
import type { User, Organization } from '@/shared/types/BetterAuth';

// Practice service functions (practice = organization + optional practice details)
export const listPractices = async (
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Organization[]> => {
  // Forward to Better Auth org plugin
  return listOrganizations(user, requestHeaders);
};

export const getPracticeById = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeWithDetails> => {
  // Get organization from Better Auth
  const organization = await getFullOrganization(
    organizationId,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Practice not found');
  }

  // Get optional practice details
  const practiceDetails
    = await findPracticeDetailsByOrganization(organizationId);

  // Clean practice details (remove internal fields only)
  const cleanPracticeDetails = practiceDetails
    ? omit(practiceDetails, [
      'id',
      'organizationId',
      'userId',
      'createdAt',
      'updatedAt',
    ])
    : null;

  return {
    ...organization,
    ...cleanPracticeDetails,
  };
};

export const createPracticeService = async (params: {
  data: PracticeCreateRequest;
  user: User;
  requestHeaders: Record<string, string>;
}): Promise<PracticeWithDetails> => {
  const { data, user, requestHeaders } = params;
  // Extract practice details (optional fields)
  const {
    business_phone,
    business_email,
    consultation_fee,
    payment_url,
    calendly_url,
    ...organizationData
  } = data;

  // Create organization in Better Auth (all validation comes from Better Auth org plugin)
  const organization = await createOrganization(
    organizationData,
    user,
    requestHeaders,
  );

  if (!organization) {
    throw new Error('Failed to create organization');
  }

  // Create optional practice details if provided
  let practiceDetails = null;
  {
    const detailsPayload = {
      business_phone,
      business_email,
      consultation_fee,
      payment_url,
      calendly_url,
    };
    const hasDetails = Object.values(detailsPayload).some(Boolean);
    if (hasDetails) {
      practiceDetails = await createPracticeDetails({
        organization_id: organization.id,
        user_id: user.id,
        ...detailsPayload,
      });

      // Publish practice details created event
      void publishSimpleEvent(EventType.PRACTICE_DETAILS_CREATED, user.id, organization.id, {
        practice_details_id: practiceDetails.id,
        business_phone,
        business_email,
        consultation_fee,
        payment_url,
        calendly_url,
      });
    }
  }

  // Publish practice created event (organization + optional details)
  void publishSimpleEvent(EventType.PRACTICE_CREATED, user.id, organization.id, {
    organization_name: organization.name,
    organization_slug: organization.slug,
    has_practice_details: !!practiceDetails,
    practice_details_id: practiceDetails?.id,
    user_email: user.email,
  });

  // Clean practice details (remove internal fields only)
  const cleanPracticeDetails = practiceDetails
    ? omit(practiceDetails, [
      'id',
      'organizationId',
      'userId',
      'createdAt',
      'updatedAt',
    ])
    : null;

  return {
    ...organization,
    ...cleanPracticeDetails,
  };
};

export const updatePracticeService = async (
  organizationId: string,
  data: PracticeUpdateRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PracticeWithDetails | null> => {
  // Extract practice details (optional fields)
  const {
    business_phone,
    business_email,
    consultation_fee,
    payment_url,
    calendly_url,
    ...organizationData
  } = data;

  // Update organization in Better Auth only if there are organization fields to update
  let organization = null;
  if (Object.keys(organizationData).length > 0) {
    // Construct UpdateOrganizationRequest with proper structure
    const updateRequest: UpdateOrganizationRequest = {
      organizationId,
      data: organizationData,
    };
    organization = await updateOrganization(
      organizationId,
      updateRequest,
      user,
      requestHeaders,
    );

    if (!organization) {
      throw new Error(`Organization with ID ${organizationId} not found`);
    }
  } else {
    // If no organization data to update, fetch the current organization
    const orgResults = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    organization = orgResults[0] || null;
    if (!organization) {
      throw new Error(`Organization with ID ${organizationId} not found`);
    }
  }


  let practiceDetails = null;
  if (
    business_phone
    || business_email
    || consultation_fee
    || payment_url
    || calendly_url
  ) {
    const practiceData = {
      business_phone,
      business_email,
      consultation_fee,
      payment_url,
      calendly_url,
    };
    practiceDetails = await upsertPracticeDetails(
      organizationId,
      user.id,
      practiceData,
    );

    // Publish practice details updated event
    void publishSimpleEvent(EventType.PRACTICE_DETAILS_UPDATED, user.id, organizationId, {
      business_phone,
      business_email,
      consultation_fee,
      payment_url,
      calendly_url,
    });
  }

  // Publish practice updated event
  void publishSimpleEvent(EventType.PRACTICE_UPDATED, user.id, organizationId, {
    organization_name: organization?.name || 'Unknown',
    organization_slug: organization?.slug || 'unknown',
    has_practice_details: !!practiceDetails,
    practice_details_id: practiceDetails?.id,
    user_email: user.email,
  });

  // Clean practice details (remove internal fields only)
  const cleanPracticeDetails = practiceDetails
    ? omit(practiceDetails, [
      'id',
      'organization_id',
      'user_id',
      'created_at',
      'updated_at',
    ])
    : null;

  return {
    ...organization,
    ...cleanPracticeDetails,
  };
};

export const deletePracticeService = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> => {
  // Get practice details before deletion for event payload
  const existingPracticeDetails
    = await findPracticeDetailsByOrganization(organizationId);

  // Delete optional practice details first
  await deletePracticeDetails(db, organizationId);

  // Publish practice details deleted event if they existed
  if (existingPracticeDetails) {
    void publishSimpleEvent(EventType.PRACTICE_DETAILS_DELETED, user.id, organizationId, {
      practice_details_id: existingPracticeDetails.id,
      business_phone: existingPracticeDetails.business_phone,
      business_email: existingPracticeDetails.business_email,
      consultation_fee: existingPracticeDetails.consultation_fee,
      payment_url: existingPracticeDetails.payment_url,
      calendly_url: existingPracticeDetails.calendly_url,
    });
  }

  // Delete organization in Better Auth
  await deleteOrganization(organizationId, user, requestHeaders);

  // Publish practice deleted event
  void publishSimpleEvent(EventType.PRACTICE_DELETED, user.id, organizationId, {
    had_practice_details: !!existingPracticeDetails,
    practice_details_id: existingPracticeDetails?.id,
    user_email: user.email,
  });

  return { success: true };
};

export const setActivePractice = async (
  organizationId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<{ success: boolean }> => {
  // Forward to Better Auth org plugin
  await setActiveOrganization(organizationId, user, requestHeaders);

  // Publish practice switched event
  void publishSimpleEvent(EventType.PRACTICE_SWITCHED, user.id, organizationId, {
    user_email: user.email,
    switched_to_organization: organizationId,
  });

  return { success: true };
};
