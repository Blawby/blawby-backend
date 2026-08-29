import { beforeEach, describe, expect, it } from 'vitest';

import {
  defineFacadeRoute,
  listRegisteredFacadeRoutes,
  registerFacadeRoute,
  resetFacadeRouteRegistryForTests,
} from '@/modules/krabiclaw-integration/route-registry';
import type { KrabiClawFacadeRouteDefinition } from '@/modules/krabiclaw-integration/types/route-policy.types';

const PRACTICE_READ: KrabiClawFacadeRouteDefinition = {
  method: 'get',
  path: '/practice/details',
  scope: 'legal:practice',
  actorPolicy: 'human',
  rateFamily: 'practice',
  rolloutGroup: 'practice-read',
  requestReferencePolicy: 'none',
};

describe('route-registry', () => {
  beforeEach(() => {
    resetFacadeRouteRegistryForTests();
  });

  describe('defineFacadeRoute', () => {
    it('registers a definition and returns it', () => {
      expect(defineFacadeRoute(PRACTICE_READ)).toBe(PRACTICE_READ);
      expect(listRegisteredFacadeRoutes()).toEqual([PRACTICE_READ]);
    });

    it('throws on a duplicate method+path registration', () => {
      defineFacadeRoute(PRACTICE_READ);
      expect(() => defineFacadeRoute({ ...PRACTICE_READ })).toThrow(/Duplicate KrabiClaw facade route registration/);
    });

    it('allows the same path with a different method', () => {
      defineFacadeRoute(PRACTICE_READ);
      const mutation: KrabiClawFacadeRouteDefinition = {
        ...PRACTICE_READ,
        method: 'post',
        rolloutGroup: 'practice-mutation',
      };
      expect(() => defineFacadeRoute(mutation)).not.toThrow();
      expect(listRegisteredFacadeRoutes()).toHaveLength(2);
    });
  });

  describe('registerFacadeRoute', () => {
    it('registers when the built route agrees with its definition (KTD2 single source of truth)', () => {
      const route = { method: 'GET', path: '/practice/details' };
      expect(() => registerFacadeRoute(route, PRACTICE_READ)).not.toThrow();
      expect(listRegisteredFacadeRoutes()).toEqual([PRACTICE_READ]);
    });

    it('throws immediately — never silently registers — when the built route method disagrees with its definition', () => {
      const route = { method: 'POST', path: '/practice/details' };
      expect(() => registerFacadeRoute(route, PRACTICE_READ)).toThrow(/registration mismatch/);
      expect(listRegisteredFacadeRoutes()).toEqual([]);
    });

    it('throws immediately — never silently registers — when the built route path disagrees with its definition', () => {
      const route = { method: 'GET', path: '/practice/other' };
      expect(() => registerFacadeRoute(route, PRACTICE_READ)).toThrow(/registration mismatch/);
      expect(listRegisteredFacadeRoutes()).toEqual([]);
    });

    it('still enforces duplicate detection when the route agrees with its definition', () => {
      const route = { method: 'GET', path: '/practice/details' };
      registerFacadeRoute(route, PRACTICE_READ);
      expect(() => registerFacadeRoute(route, { ...PRACTICE_READ })).toThrow(
        /Duplicate KrabiClaw facade route registration/
      );
    });
  });
});
