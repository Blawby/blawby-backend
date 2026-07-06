import { config } from '@/shared/config';

/**
 * Deterministic idempotency-key derivation for MCP tool calls.
 *
 * Ported from the frontend worker's MCPIdempotency.ts (deleted in
 * blawby-ai-chatbot#707/#708) when the worker's own MCP server was retired
 * in favor of this backend module. Adapted for backend's stateless MCP
 * transport: `mcp/server.ts` connects with `sessionIdGenerator: undefined`,
 * so there is no per-session id or per-call sequence number to fold into
 * the key here (the worker's version had both). The key is instead scoped
 * to (organization, user, tool, params, time-bucket) — sufficient to
 * dedupe an immediate retry without a session concept to lean on.
 */

export interface IdempotencyInputs {
  toolName: string;
  organizationId: string;
  userId: string;
  params: Record<string, unknown>;
}

const HIGH_RISK_BUCKET_MS = 60_000;

/** Canonical JSON: keys sorted at every depth so property order doesn't affect the hash. */
export const canonicalJsonStringify = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'undefined') return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonStringify(v)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`);
    return `{${parts.join(',')}}`;
  }
  return 'null';
};

const sha256Hex = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const composeKeyMaterial = (salt: string, inputs: IdempotencyInputs, extra = ''): string => {
  const parts = [
    salt,
    inputs.organizationId,
    inputs.userId,
    inputs.toolName,
    canonicalJsonStringify(inputs.params),
    extra,
  ];
  // \x1f (unit separator) as an unambiguous field boundary.
  return parts.join('\x1f');
};

const requireSalt = (): string => {
  const salt = config.mcp.idempotencySalt;
  if (!salt) {
    throw new Error('IDEMPOTENCY_SALT not configured; refusing to derive a salt-less key');
  }
  return salt;
};

/**
 * Standard derivation for direct-write tools. Not currently wired into
 * any tool — no MCP write tool exists yet that isn't `requiresApproval`.
 * Kept so a future direct-write tool has a ready-made dedup key rather
 * than reinventing one.
 */
export const deriveIdempotencyKey = async (inputs: IdempotencyInputs): Promise<string> =>
  sha256Hex(composeKeyMaterial(requireSalt(), inputs));

/**
 * High-risk derivation, bucketed to a 60s window: an immediate retry
 * within the same minute dedupes to the same pending action, but a call
 * after the bucket rolls produces a fresh one.
 */
export const deriveHighRiskIdempotencyKey = async (
  inputs: IdempotencyInputs,
  nowMs: number = Date.now()
): Promise<string> => {
  const bucket = Math.floor(nowMs / HIGH_RISK_BUCKET_MS) * HIGH_RISK_BUCKET_MS;
  return sha256Hex(composeKeyMaterial(requireSalt(), inputs, String(bucket)));
};
