import { z } from 'zod';
import { onboardingValidations } from '@/modules/onboarding/validations/onboarding.validation';

// Inferred from Zod schemas
export type CreateOnboardingSessionRequest = z.infer<typeof onboardingValidations.createOnboardingSessionSchema>;
export type CreateConnectedAccountRequest = z.infer<typeof onboardingValidations.createConnectedAccountSchema>;
export type OnboardingStatusResponse = z.infer<typeof onboardingValidations.onboardingStatusResponseSchema>;
export type CreateConnectedAccountResponse = z.infer<typeof onboardingValidations.createConnectedAccountResponseSchema>;

// Derived Types from Shared Schemas
export type OnboardingAddress = z.infer<typeof onboardingValidations.onboardingAddressSchema>;
export type CompanyInfo = z.infer<typeof onboardingValidations.companyInfoSchema>;
export type IndividualInfo = z.infer<typeof onboardingValidations.individualInfoSchema>;
export type Requirements = z.infer<typeof onboardingValidations.requirementsSchema>;
export type FutureRequirements = Requirements;
export type Capabilities = z.infer<typeof onboardingValidations.capabilitiesSchema>;
export type TosAcceptance = z.infer<typeof onboardingValidations.tosAcceptanceSchema>;
export type ExternalAccount = z.infer<typeof onboardingValidations.externalAccountSchema>;
export type ExternalAccounts = z.infer<typeof onboardingValidations.externalAccountsSchema>;

// API Request/Response Types
export type CreateAccountRequest = z.infer<typeof onboardingValidations.createAccountRequestSchema>;
export type CreateAccountResponse = z.infer<typeof onboardingValidations.createAccountResponseSchema>;
export type GetAccountResponse = z.infer<typeof onboardingValidations.getAccountResponseSchema>;
export type CreateSessionResponse = z.infer<typeof onboardingValidations.createSessionResponseSchema>;
export type WebhookResponse = z.infer<typeof onboardingValidations.webhookResponseSchema>;

// Internal Base Type
export type StripeConnectedAccountBase = OnboardingStatusResponse;
