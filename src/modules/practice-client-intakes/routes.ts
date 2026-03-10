import * as clientRoutes from '@/modules/practice-client-intakes/routes/client.routes';
import * as publicRoutes from '@/modules/practice-client-intakes/routes/public.routes';
import * as staffRoutes from '@/modules/practice-client-intakes/routes/staff.routes';

export const routes = {
  ...publicRoutes,
  ...clientRoutes,
  ...staffRoutes,
};

export * from '@/modules/practice-client-intakes/routes/public.routes';
export * from '@/modules/practice-client-intakes/routes/client.routes';
export * from '@/modules/practice-client-intakes/routes/staff.routes';
