import type { Hono } from 'hono';

import type { User, Session } from '@/shared/types/BetterAuth';

export type Variables = {
  user: User | null;
  session: Session | null;
  userId: string | null;
  activeOrganizationId: string | null;
};

export type AppContext = {
  Variables: Variables;
};

export type AppType = Hono<AppContext>;
