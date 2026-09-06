import {
  createAccountSession as createAccountSessionOperation,
  type AccountSessionResponse,
} from '@/modules/stripe/operations/create-account-session.operation';
import type { AllowedComponent } from '@/modules/stripe/validations/connect.validation';
import { toLegalOperationContext } from '@/shared/types/legal-operation-context';
import type { ServiceContext } from '@/shared/types/service-context';

/**
 * Thin `ServiceContext` adapter (R9) — the account-session workflow itself now lives in
 * `createAccountSession` under `src/modules/stripe/operations/` (R7). This keeps the existing
 * route's authorization boundary (`requireAuth` + `requireOrgMembership` middleware) and response
 * contract unchanged while delegating the domain work to the auth-independent operation.
 */
const createAccountSession = async (
  organizationId: string,
  components: AllowedComponent[],
  ctx: ServiceContext
): Promise<AccountSessionResponse> =>
  createAccountSessionOperation({ organizationId, components }, toLegalOperationContext(ctx));

export const accountSessionService = { createAccountSession };
export type { AccountSessionResponse };
