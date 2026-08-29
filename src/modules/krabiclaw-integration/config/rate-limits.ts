/**
 * Two independent rate-limit dimensions apply to every facade route family,
 * both before D1 (R21):
 *
 * - `CLIENT_FAMILY_CEILING` — keyed on the fixed OAuth client + route
 *   family. A containment backstop: sized well above realistic aggregate
 *   legitimate traffic for the one KrabiClaw client, so it only trips on a
 *   compromised or malfunctioning client.
 * - `ORGANIZATION_FAMILY_BUCKET` — keyed on the caller-claimed external
 *   organization ID + route family. The primary fairness control: bounds
 *   how much of the client ceiling a single organization can consume.
 *
 * Both are provisional defaults for this default-off facade. U10 records
 * measured traffic and reviews (and likely retunes) both values before any
 * rollout group is enabled — see R19, R21.
 */
export interface KrabiClawRateLimitBudget {
  readonly points: number;
  readonly duration: number;
}

export const CLIENT_FAMILY_CEILING: KrabiClawRateLimitBudget = { points: 600, duration: 60 };

export const ORGANIZATION_FAMILY_BUCKET: KrabiClawRateLimitBudget = { points: 120, duration: 60 };
