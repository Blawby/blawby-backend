import {
  intakeEnrichmentJobSchema,
  intakeEnrichmentService,
} from '@/modules/practice-client-intakes/services/intake-enrichment.service';
import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';

const logger = getLogger(['workers', 'tasks', 'process-intake-enrichment']);

export const processIntakeEnrichment: Task = async (input) => {
  const parsed = intakeEnrichmentJobSchema.parse(input);

  const result = await intakeEnrichmentService.runEnrichmentJob(parsed);
  logger.info('Intake enrichment {result}: {intakeId} v{version}', {
    result,
    intakeId: parsed.intakeId,
    version: parsed.version,
  });
};
