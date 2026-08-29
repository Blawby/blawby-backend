import { HTTPException } from 'hono/http-exception';

/**
 * The reviewed `WWW-Authenticate` challenge for a machine-token failure
 * (R24). Its `error="invalid_token"` value matches the reviewed error
 * contract's `invalid_token` code — this exact string is the only
 * `WWW-Authenticate` value U9 (a different repository) may treat as a
 * signal to refresh its client-credentials grant and retry once.
 */
export const KRABICLAW_MACHINE_AUTH_WWW_AUTHENTICATE = 'Bearer realm="krabiclaw-facade", error="invalid_token"';

/**
 * Every machine-token verification failure (missing/malformed/expired
 * token, wrong audience/issuer, wrong client, unexpected `sub`, missing
 * every `legal:*` scope) throws this — never a bare `HTTPException(401)`.
 * The facade's `onError` handler (`http.ts`) checks
 * `error instanceof KrabiClawMachineAuthError` specifically so a 401 from
 * anywhere else in the request path (which should never happen inside this
 * module, but might from a misbehaving dependency) is never mistaken for a
 * refreshable machine-auth failure (R24, AE7).
 */
export class KrabiClawMachineAuthError extends HTTPException {
  constructor(message = 'Machine authentication failed') {
    super(401, { message });
  }
}

/**
 * Every facade policy-gate rejection (wrong-family scope, disabled global
 * switch or rollout group, disallowed actor kind) throws this. The message
 * is deliberately uninformative — the Facade policy family in the Reviewed
 * Error Contract must not disclose which client, scope, actor, rollout
 * group, or limit key failed.
 */
export class KrabiClawPolicyForbiddenError extends HTTPException {
  constructor(message = 'Request is not permitted') {
    super(403, { message });
  }
}

/** Either rate-limit dimension (fixed-client ceiling or claimed-organization bucket) rejecting a request throws this. */
export class KrabiClawRateLimitedError extends HTTPException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, { message: 'Too many requests' });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A trusted header or request body outside its bound (length, character
 * set, size) or a malformed request-reference/local-resource UUID throws
 * this before any D1 call (R23).
 */
export class KrabiClawFacadeValidationError extends HTTPException {
  constructor(message = 'Request failed facade validation') {
    super(400, { message });
  }
}

/**
 * Thrown only by the catch-all's global switch check (`http.ts`) when
 * `KRABICLAW_FACADE_ENABLED` is off (R17, AE5). Deliberately indistinguishable
 * from an unregistered route (404), not the 403 `facade_forbidden` contract —
 * a disabled facade should look, from the outside, like it doesn't exist.
 */
export class KrabiClawFacadeDisabledError extends HTTPException {
  constructor() {
    super(404, { message: 'Not found' });
  }
}

/** A D1/PostgreSQL/Stripe dependency failed after every policy gate passed — sanitized, never the raw dependency error (R15). */
export class KrabiClawUpstreamDependencyError extends HTTPException {
  constructor(status: 502 | 503, message: string) {
    super(status, { message });
  }
}
