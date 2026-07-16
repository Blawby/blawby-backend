import {
  intakeEnrichmentJobSchema,
  intakeEnrichmentService,
} from '@/modules/practice-client-intakes/services/intake-enrichment.service';
import type { Task } from 'graphile-worker';

export const processIntakeEnrichment: Task = async (input, helpers) => {
  const parsed = intakeEnrichmentJobSchema.parse(input);

  const result = await intakeEnrichmentService.runEnrichmentJob(parsed);
  helpers.logger.info(`Intake enrichment ${result}: ${parsed.intakeId} v${String(parsed.version)}`);
};
