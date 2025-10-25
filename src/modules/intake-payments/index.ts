// Export main components
export { intakePayments, intakePaymentsRelations } from './database/schema/intake-payments.schema';
export { intakePaymentsRepository } from './database/queries/intake-payments.repository';
export { createIntakePaymentsService } from './services/intake-payments.service';
export * from './types/intake-payments.types';
export {
  createIntakePaymentSchema,
  updateIntakePaymentSchema,
  slugParamSchema,
  ulidParamSchema,
  type SlugParam,
  type UlidParam,
} from './validations/intake-payments.validation';
export { default as intakePaymentsApp } from './http';
