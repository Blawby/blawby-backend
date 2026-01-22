import { z } from 'zod';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';

// Inferred from Zod schemas
export type CreateOnboardingSessionRequest = z.infer<typeof onboardingValidations.createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof onboardingValidations.createConnectedAccountSchema>;
export type OnboardingStatusResponse = z.infer<typeof onboardingValidations.onboardingStatusResponseSchema>;
export type CreateConnectedAccountResponse = z.infer<typeof onboardingValidations.createConnectedAccountResponseSchema>;
