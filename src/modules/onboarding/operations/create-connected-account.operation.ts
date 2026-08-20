import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

import { krabiclawConnectOperationsRepository } from '@/modules/onboarding/database/queries/krabiclaw-connect-operations.repository';
import { onboardingRepository as onboardingRepo } from '@/modules/onboarding/database/queries/onboarding.repository';
import {
  connectedAccountsService,
  isStripeClientError,
} from '@/modules/onboarding/services/connected-accounts.service';
import type { OnboardingStatusResponse } from '@/modules/onboarding/types/onboarding.types';
import { organizationRepository } from '@/modules/practice/database/queries/organization.repository';
import { uow } from '@/shared/database/uow';
import { assertLegalOperationTenant, type LegalOperationContext } from '@/shared/types/legal-operation-context';

const logger = getLogger(['onboarding', 'create-connected-account-operation']);

const RATE_LIMIT_STATUS_CODE = 429;
const IDEMPOTENCY_KEY_IN_USE_STATUS_CODE = 409;

interface CreateConnectedAccountParams {
  organizationId: string;
  email: string;
  refreshUrl: string;
  returnUrl: string;
  /** KrabiClaw-supplied recovery key; absent on the existing Blawby route. */
  requestKey?: string;
}

// A permanent, non-retryable failure (bad params, card/account rejected) is terminal — everything else, including rate limits, is ambiguous/transient and must stay retryable under the same key.
// ConnectedAccountsService wraps Stripe client errors in an HTTPException (which exposes
// `.status`, not `.statusCode`) before they reach here. Unwrap `.cause` to classify the original
// Stripe error underneath (mirrors isMissingConnectedAccountError's fix).
const isPermanentStripeFailure = (error: Error): boolean => {
  const candidate = error instanceof HTTPException && error.cause ? error.cause : error;
  if (!isStripeClientError(candidate)) {
    return false;
  }
  // Stripe's `idempotency_error` covers two different cases with different statuses: a 409 means a concurrent caller with the same key is still in flight (transient — the operation stays pending for that caller or a later retry to resolve); a 400 means the key was reused with different parameters, a genuine caller bug that retrying under the same key can never fix, so it stays permanent.
  if (candidate.type === 'idempotency_error' && candidate.statusCode === IDEMPOTENCY_KEY_IN_USE_STATUS_CODE) {
    return false;
  }
  return candidate.statusCode !== RATE_LIMIT_STATUS_CODE;
};

const toResponse = (
  organizationId: string,
  account: {
    id: string;
    stripe_account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  },
  url?: string
): OnboardingStatusResponse => {
  const response: OnboardingStatusResponse = {
    practice_uuid: organizationId,
    connected_account_id: account.id,
    stripe_account_id: account.stripe_account_id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
  };
  if (url) {
    response.url = url;
  }
  return response;
};

const runCreateOrGet = async (
  organizationId: string,
  email: string,
  refreshUrl: string,
  returnUrl: string,
  ctx: LegalOperationContext,
  idempotencyKey?: string
): Promise<OnboardingStatusResponse> => {
  const accountData = await connectedAccountsService.createOrGetAccount(
    organizationId,
    email,
    refreshUrl,
    returnUrl,
    ctx.userId ?? undefined,
    idempotencyKey
  );

  const connectedAccount = await onboardingRepo.findByStripeAccountId(accountData.account_id);
  if (!connectedAccount) {
    throw new Error('Connected account was created but could not be loaded');
  }

  return toResponse(organizationId, connectedAccount, accountData.url);
};

const respondFromSucceededOperation = async (
  organizationId: string,
  operation: { connected_account_id: string | null; refresh_url: string; return_url: string }
): Promise<OnboardingStatusResponse> => {
  if (!operation.connected_account_id) {
    throw new Error('Connect operation succeeded but has no connected account recorded');
  }
  const account = await onboardingRepo.findById(operation.connected_account_id);
  if (!account) {
    throw new Error('Connect operation succeeded but its connected account could not be loaded');
  }
  // Account links are short-lived — regenerate a fresh one on every replay so the response stays complete (matches the fresh-create response shape) rather than omitting `url`. But the account itself already exists and the operation already succeeded, so a transient Stripe failure generating a NEW link must not fail the whole replay — fall back to a url-less (but otherwise complete) response instead.
  try {
    const accountLink = await connectedAccountsService.createAccountLinkForAccount(
      account,
      operation.refresh_url,
      operation.return_url
    );
    return toResponse(organizationId, account, accountLink.url);
  } catch (error) {
    logger.warn('Could not regenerate account link for succeeded connect operation {operationId}', {
      operationId: operation.connected_account_id,
      error,
    });
    return toResponse(organizationId, account);
  }
};

/**
 * Create a Stripe connected account for an organization (includes hosted onboarding session
 * creation). When `requestKey` is present, the operation persists an immutable
 * `krabiclaw_connect_operations` snapshot in its own short transaction — committed before Stripe
 * ever runs (R24) — so a crash after Stripe succeeds still leaves a durable operation identity
 * and idempotency key to resume against, instead of minting a new one on retry and risking a
 * duplicate account. Stripe I/O runs with no database transaction open (no pooled connection held
 * across the network call); concurrent same-key callers are protected by Stripe's own idempotency
 * key guarantee, not a local lock, and the terminal status transition happens in its own short
 * transaction afterward (R42).
 */
export const createConnectedAccount = async (
  params: CreateConnectedAccountParams,
  ctx: LegalOperationContext
): Promise<OnboardingStatusResponse> => {
  const { organizationId, requestKey } = params;
  assertLegalOperationTenant(ctx, organizationId);

  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new HTTPException(404, { message: `Organization not found for ${organizationId}` });
  }

  if (!requestKey) {
    return runCreateOrGet(organizationId, params.email, params.refreshUrl, params.returnUrl, ctx);
  }

  try {
    // Durable claim, committed before any Stripe call — the snapshot fields are only used on first insert, binding a concurrent or retried caller to the ORIGINAL request's email/refresh_url/return_url (R24) regardless of what this call happens to be passing.
    const operation = await uow.transaction(() =>
      krabiclawConnectOperationsRepository.createPending({
        organization_id: organizationId,
        request_key: requestKey,
        email: params.email,
        refresh_url: params.refreshUrl,
        return_url: params.returnUrl,
      })
    );

    if (operation.status === 'succeeded') {
      return await respondFromSucceededOperation(organizationId, operation);
    }

    // A 'failed' operation is terminal for permanent (client) errors only. Ambiguous/transient failures leave the row 'pending' so a same-key retry can attempt Stripe again instead of being locked out forever.
    if (operation.status === 'failed') {
      throw new HTTPException(422, {
        message: operation.error_message ?? 'Failed to create connected account',
      });
    }

    const idempotencyKey = `krabiclaw-connect:${operation.id}`;
    try {
      const response = await runCreateOrGet(
        organizationId,
        operation.email,
        operation.refresh_url,
        operation.return_url,
        ctx,
        idempotencyKey
      );
      const { connected_account_id: connectedAccountId } = response;
      if (!connectedAccountId) {
        // RunCreateOrGet always loads the connected account before returning a response, so this is an invariant violation, not a real "missing id" case — fail loudly instead of writing an empty-string foreign key.
        throw new Error('Connected account id missing after successful creation');
      }
      try {
        await uow.transaction(() =>
          krabiclawConnectOperationsRepository.markSucceeded(operation.id, connectedAccountId)
        );
      } catch (transitionError) {
        // Another concurrent caller with the same idempotency key already transitioned this operation (Stripe itself guarantees only one of them actually created the account) — the response we just built already reflects that same account, so it's still correct. Still logged, since a genuine DB failure here is indistinguishable from that race and would otherwise leave the row stale with no trace.
        logger.warn('Could not mark connect operation {operationId} succeeded', {
          operationId: operation.id,
          error: transitionError,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof Error && isPermanentStripeFailure(error)) {
        const { message } = error;
        try {
          await uow.transaction(() => krabiclawConnectOperationsRepository.markFailed(operation.id, message));
        } catch (transitionError) {
          // Already transitioned by a concurrent caller — nothing more to record. Still logged, since a genuine DB failure here is indistinguishable from that race.
          logger.warn('Could not mark connect operation {operationId} failed', {
            operationId: operation.id,
            error: transitionError,
          });
        }
      } else {
        // Ambiguous/transient failure (network error, Stripe 5xx or 429, local DB read-after-write miss) — leave the operation 'pending' so a retry under the same request key can try again.
        logger.warn('Ambiguous failure creating connected account for {organizationId}, leaving operation pending', {
          organizationId,
          operationId: operation.id,
          error,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to create connected account for organization {organizationId}: {error}', {
      organizationId,
      userId: ctx.userId,
      error,
    });

    throw new Error(error instanceof Error ? error.message : 'Failed to create connected account', {
      cause: error,
    });
  }
};
