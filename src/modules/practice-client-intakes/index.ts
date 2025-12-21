// Export main components
export { practiceClientIntakes, practiceClientIntakesRelations } from './database/schema/practice-client-intakes.schema';
export { practiceClientIntakesRepository } from './database/queries/practice-client-intakes.repository';
export { createPracticeClientIntakesService } from './services/practice-client-intakes.service';
export * from './types/practice-client-intakes.types';
export {
  createPracticeClientIntakeSchema,
  updatePracticeClientIntakeSchema,
  slugParamSchema,
  uuidParamSchema,
  type SlugParam,
  type UuidParam,
} from './validations/practice-client-intakes.validation';
export { default as practiceClientIntakesApp } from './http';
