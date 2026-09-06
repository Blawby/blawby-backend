import { describe, expect, it } from 'vitest';

import krabiclawIntegrationApp, { mountPath } from '@/modules/krabiclaw-integration/http';
import { listRegisteredFacadeRoutes } from '@/modules/krabiclaw-integration/route-registry';
import { MODULE_REGISTRY } from '@/shared/router/modules.generated';

/**
 * Proves U6's registration/discoverability claim (R1, R17, KTD9, and the
 * plan's Success Criteria: "the generated router and OpenAPI output contain
 * the facade only once"). Three independently-derived views of the mounted
 * facade must agree exactly with the Product Contract's Route Contract
 * table (global-context.md): the authoritative policy registry U2-U5 built
 * (`listRegisteredFacadeRoutes()`), Hono's own runtime route table
 * (`krabiclawIntegrationApp.routes`, populated purely by `app.openapi(...)`
 * calls in `http.ts` — nothing in this test file mutates it), and the
 * module's generated OpenAPI document. None of these three is treated as
 * ground truth over another; all three are checked against the fourth,
 * independent source: the Route Contract table itself, transcribed below.
 *
 * This file never calls `resetFacadeRouteRegistryForTests()` — unlike
 * `http.test.ts`'s own worked-example describe block, which resets the
 * registry to build synthetic fixture routes. Vitest gives each test file
 * its own module registry, so that reset (run during that other file's
 * collection phase) never touches the registry state observed here.
 */
const ROUTE_CONTRACT: readonly string[] = [
  'GET /practice/details',
  'POST /practice/details',
  'PATCH /practice/details',
  'POST /connect/connected-accounts',
  'GET /connect/status',
  'POST /connect/account-session',
  'GET /connect/account',
  'GET /intakes/settings',
  'POST /intakes',
  'GET /intakes/requests/{request_id}',
  'GET /intakes/{uuid}/status',
  'GET /intakes',
  'GET /intakes/{uuid}',
  'PATCH /intakes/{uuid}/triage',
  'POST /intakes/{uuid}/checkout-session',
  'GET /intakes/{uuid}/post-pay/status',
  'POST /engagement-contracts',
  'GET /engagement-contracts',
  'GET /engagement-contracts/{contract_id}',
  'PATCH /engagement-contracts/{contract_id}',
  'PATCH /engagement-contracts/{contract_id}/status',
];

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('krabiclaw-integration facade registration contract (U6)', () => {
  it('the module is discovered exactly once in the generated module registry, mounted at its own exported path', () => {
    const entries = MODULE_REGISTRY.filter((entry) => entry.name === 'krabiclaw-integration');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.mountPath).toBe(mountPath);
    expect(entries[0]?.http).toBe(krabiclawIntegrationApp);
  });

  it('the authoritative policy registry contains exactly the Route Contract, each entry registered once', () => {
    const registryKeys = listRegisteredFacadeRoutes().map(
      (definition) => `${definition.method.toUpperCase()} ${definition.path}`
    );
    expect(new Set(registryKeys).size).toBe(registryKeys.length);
    expect(sorted(registryKeys)).toEqual(sorted(ROUTE_CONTRACT));
  });

  it("Hono's own runtime route table agrees exactly with the Route Contract (no route missing, none extra, none duplicated)", () => {
    // Deliberately deduped into a Set, not asserted for cardinality first: Hono's `.routes` array
    // Holds one entry per middleware layer attached to a path (global middleware, the route-scoped
    // `createKrabiClawFacadeRouteMiddleware` entry, and the handler itself all register separately
    // Under the same method+path) — every legitimate route here has multiple entries by design, so
    // A raw-array-length check would fail unconditionally rather than catching a real duplicate
    // `app.openapi(...)` registration. The policy-registry check above (`listRegisteredFacadeRoutes`)
    // Is the one that's actually one-entry-per-route and can meaningfully assert cardinality.
    const runtimeKeys = new Set(
      krabiclawIntegrationApp.routes
        .filter((route) => route.method !== 'ALL')
        // Hono's runtime table uses `:param` path-segment syntax; the Route
        // Contract (and the policy registry, and the OpenAPI document) use
        // OpenAPI's `{param}` syntax for the same segments.
        .map((route) => `${route.method} ${route.path.replace(/:(?<paramName>[a-zA-Z_]+)/g, '{$<paramName>}')}`)
    );
    expect(sorted([...runtimeKeys])).toEqual(sorted(ROUTE_CONTRACT));
  });

  it('the generated OpenAPI document for this module agrees exactly with the Route Contract', () => {
    const doc = krabiclawIntegrationApp.getOpenAPIDocument({
      openapi: '3.0.0',
      info: { title: 'krabiclaw-integration facade (test)', version: '1.0.0' },
    });
    const openapiKeys: string[] = [];
    for (const [path, methods] of Object.entries(doc.paths ?? {})) {
      for (const method of Object.keys(methods ?? {})) {
        openapiKeys.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(sorted(openapiKeys)).toEqual(sorted(ROUTE_CONTRACT));
  });
});

/**
 * The "every method/path combination NOT in the Route Contract returns the
 * reviewed facade 404" assertion (approach step 3) deliberately does NOT
 * live in this file: this file runs against the real, unmocked
 * `config.krabiclaw` (so `facadeEnabled` is whatever the process env says —
 * off by default), which would make an "unsupported combination -> 404"
 * assertion here indistinguishable from the disabled-switch 404 every route
 * already gets (see `http.test.ts`'s `ALL_ALLOWLISTED_ROUTES` loop). Proving
 * "the enabled facade accepts only the Route Contract" requires the facade
 * to actually be enabled, which requires mocking `@/shared/config` — done in
 * `facade-gate-ordering.e2e.test.ts`'s own "unsupported combinations" block.
 */
