import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
import {
  createIntake as createIntakeOperation,
  type CreateIntakeData,
} from '@/modules/practice-client-intakes/operations/create-intake.operation';
import { getIntakeSettings as getIntakeSettingsOperation } from '@/modules/practice-client-intakes/operations/get-intake-settings.operation';
import { getActorAccessibleIntake } from '@/modules/practice-client-intakes/services/intake-access.helpers';
import { getLogger } from '@logtape/logtape';
import type {
  CreateIntakeResponse,
  CreatePracticeClientIntakeRequest,
  IntakeSettingsResponse,
  UpdatePracticeClientIntakeRequest,
} from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['practice-client-intakes', 'service']);

type IntakeCreationRequest = CreatePracticeClientIntakeRequest & {
  clientIp?: string;
  userAgent?: string;
  origin?: string | null;
};

const getIntakeSettings = async (params: {
  slug: string;
  templateSlug?: string;
  organization?: NonNullable<Awaited<ReturnType<typeof organizationRepository.findBySlug>>>;
}): Promise<IntakeSettingsResponse> => {
  const organization = params.organization ?? (await organizationRepository.findBySlug(params.slug));

  if (!organization) {
    throw new HTTPException(404, { message: `Organization with slug '${params.slug}' not found` });
  }

  return getIntakeSettingsOperation(
    { organizationId: organization.id, templateSlug: params.templateSlug, subscriptionPolicy: 'enforce' },
    { organizationId: organization.id, userId: null }
  );
};

const createIntake = async (params: { data: IntakeCreationRequest }): Promise<CreateIntakeResponse> => {
  const { data: request } = params;
  const { slug, user_id: userId, ...operationData } = request;

  try {
    const organization = await organizationRepository.findBySlug(slug);
    if (!organization) {
      throw new HTTPException(404, { message: `Organization with slug '${slug}' not found` });
    }

    const data: CreateIntakeData = operationData;

    return await createIntakeOperation(
      { organizationId: organization.id, data, subscriptionPolicy: 'enforce' },
      { organizationId: organization.id, userId: userId ?? null }
    );
  } catch (error) {
    logger.error('Failed to create practice client intake for {slug}: {error}', {
      slug,
      error,
    });
    throw error;
  }
};

const updateIntake = async (
  params: { uuid: string; data: UpdatePracticeClientIntakeRequest },
  ctx: ServiceContext
): Promise<{ message: string }> => {
  try {
    await getActorAccessibleIntake(params.uuid, ctx, 'update');

    const { amount, court_date, ...restUpdateData } = params.data;
    const dataToUpdate = {
      ...restUpdateData,
      ...(typeof amount !== 'undefined' && { amount }),
      ...(typeof court_date !== 'undefined' && { court_date: court_date ? new Date(court_date) : null }),
    };

    if (Object.keys(dataToUpdate).length === 0) {
      throw new HTTPException(400, { message: 'No fields to update provided.' });
    }

    await practiceClientIntakesRepository.update(params.uuid, dataToUpdate);

    return { message: 'Intake updated successfully.' };
  } catch (error) {
    logger.error('Failed to update practice client intake for {uuid}: {error}', {
      uuid: params.uuid,
      error,
    });
    throw error;
  }
};

export const intakeCreationService = {
  getIntakeSettings,
  createIntake,
  updateIntake,
};
