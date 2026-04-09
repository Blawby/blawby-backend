import { getLogger } from '@logtape/logtape';
import { Stripe } from 'stripe';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['shared', 'utils', 'stripe-error']);

/**
 * Normalise a caught Stripe error into the project's throw-based error convention.
 * - Card errors → 422 (safe to surface to user)
 * - Invalid request → 500 Error (our bug, don't expose internals)
 * - Transient (connection/rate limit) → 500 Error (Graphile Worker will retry)
 * - Auth failure → 500 Error (critical — bad API key)
 * - All others → 500 Error
 *
 * Usage: catch (err) { wrapStripeError(err); }
 */
export const wrapStripeError = (err: unknown): never => {
  if (err instanceof Stripe.errors.StripeCardError) {
    logger.warn('Stripe card error: {message}', { message: err.message });
    throw new HTTPException(422, { message: err.message });
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    logger.error('Stripe invalid request: {message}', { message: err.message });
    throw new Error(`Stripe invalid request: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeRateLimitError) {
    logger.error('Stripe transient error: {message}', { message: err.message });
    throw new Error(`Stripe transient error: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    logger.error('Stripe authentication failure — check API key');
    throw new Error('Stripe authentication failure — check API key');
  }
  const message = err instanceof Error ? err.message : 'Unknown Stripe error';
  logger.error('Unknown Stripe error: {message}', { message });
  throw new Error(message);
};
