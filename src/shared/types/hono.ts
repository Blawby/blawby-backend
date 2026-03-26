import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Hono } from 'hono';

import type { AppAbility } from '@/shared/auth/abilities';
import type { User, Session } from '@/shared/types/BetterAuth';

export type Variables = {
  user: User | null;
  session: Session | null;
  userId: string | null;
  activeOrganizationId: string | null;
  memberRole: string | null;
  ability: AppAbility;
};

export type AppContext = {
  Variables: Variables;
};

export type AppType = Hono<AppContext>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppContext>;
