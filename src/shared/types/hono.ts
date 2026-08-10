import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Hono } from 'hono';

import type { AppAbility } from '@/shared/auth/abilities.types';
import type { LegalOperationContext } from '@/modules/krabiclaw-integration/types/legal-operation-context.types';
import type { User, Session } from '@/shared/types/BetterAuth';

export interface Variables {
  user: User | null;
  session: Session | null;
  userId: string | null;
  apiKeyId: string | null;
  activeOrganizationId: string | null;
  memberRole: string | null;
  ability: AppAbility;
  legalOperationContext?: LegalOperationContext;
}

export interface AppContext {
  Variables: Variables;
}

export type AppType = Hono<AppContext>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppContext>;
