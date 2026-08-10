/**
 * Fixed resource/audience for the KrabiClaw machine-to-machine OAuth grant.
 * Must match the audience KrabiClaw's Better Auth client requests and the
 * `aud` claim the legal-facade adapter verifies (Unit 4).
 */
export const KRABICLAW_LEGAL_API_AUDIENCE = 'urn:blawby:legal-api';

/**
 * Route-scope strings from the facade plan's Route Scope table. Keep this
 * list and the table in sync — Unit 8's route allowlist is keyed off it.
 */
export const KRABICLAW_LEGAL_SCOPES = [
  'legal:practice',
  'legal:connect',
  'legal:intakes',
  'legal:engagements',
] as const;

export type KrabiClawLegalScope = (typeof KRABICLAW_LEGAL_SCOPES)[number];

/**
 * `clientReference` sentinel used for the KrabiClaw OAuth client so any
 * staff super_admin session — not just whichever one ran the provisioning
 * script — passes the oauth-provider's post-privilege ownership check on
 * rotate/update/delete/get. See Task 3 of the U1 plan for why this is
 * required.
 */
export const KRABICLAW_OAUTH_CLIENT_REFERENCE = 'krabiclaw:legal-facade';
