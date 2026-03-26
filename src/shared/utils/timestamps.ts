/**
 * Convert a Stripe unix timestamp (seconds) to a JS Date.
 */
export const fromStripeTimestamp = (unix: number): Date => {
  return new Date(unix * 1000);
};
