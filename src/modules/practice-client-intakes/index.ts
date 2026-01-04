// Export main components
export { practiceClientIntakes, practiceClientIntakesRelations } from '@/modules/practice-client-intakes/database/schema/practice-client-intakes.schema';
export { practiceClientIntakesRepository } from '@/modules/practice-client-intakes/database/queries/practice-client-intakes.repository';
export { createPracticeClientIntakesService } from '@/modules/practice-client-intakes/services/practice-client-intakes.service';
export * from '@/modules/practice-client-intakes/types/practice-client-intakes.types';
export {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
  type SlugParam,
  type UuidParam,
} from '@/modules/practice-client-intakes/validations/practice-client-intakes.validation';
export { default as practiceClientIntakesApp } from '@/modules/practice-client-intakes/http';
