import type { Task } from 'graphile-worker';
import { getLogger } from '@logtape/logtape';
import { intakeTemplatesService } from '@/modules/practice/services/intake-templates.service';

const logger = getLogger(['workers', 'tasks', 'seed-default-intake-template']);

interface SeedDefaultIntakeTemplatePayload {
  organization_id: string;
}

export const seedDefaultIntakeTemplate: Task = async (payload: unknown) => {
  const { organization_id } = payload as SeedDefaultIntakeTemplatePayload;

  logger.info('Seeding default intake template for {organizationId}', { organizationId: organization_id });

  try {
    await intakeTemplatesService.seedDefaultTemplate(organization_id);
    logger.info('Seeded default intake template for {organizationId}', { organizationId: organization_id });
  } catch (error) {
    logger.error('Failed to seed default intake template for {organizationId}: {error}', {
      organizationId: organization_id,
      error,
    });
    throw error;
  }
};
