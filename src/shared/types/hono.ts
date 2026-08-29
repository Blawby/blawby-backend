import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Hono } from 'hono';

import type { KrabiClawFacadeRequestContext } from '@/modules/krabiclaw-integration/types/facade-context.types';
import type { AppAbility } from '@/shared/auth/abilities.types';
import type { Session, User } from '@/shared/types/BetterAuth';
import type { LegalOperationContext } from '@/shared/types/legal-operation-context';

export interface Variables {
  user: User | null;
  session: Session | null;
  userId: string | null;
  apiKeyId: string | null;
  activeOrganizationId: string | null;
  memberRole: string | null;
  ability: AppAbility;
  legalOperationContext?: LegalOperationContext;
  /**
   * The one Hono-only KrabiClaw facade context (KTD3), set by
   * `createKrabiClawFacadeRouteMiddleware` after every policy gate passes.
   * Never forward this whole object to a Legal Operation, job, or webhook —
   * pass `krabiclawFacadeRequestContext.legalOperationContext` instead.
   */
  krabiclawFacadeRequestContext?: KrabiClawFacadeRequestContext;
}

export interface AppContext {
  Variables: Variables;
}

export type AppType = Hono<AppContext>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppContext>;
