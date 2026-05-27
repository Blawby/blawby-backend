import * as conflictCheckRoutes from './conflict-check.routes';
import * as memberProfileRoutes from './member-profiles.routes';
import * as practiceDetailsRoutes from './practice-details.routes';
import * as practiceRoutes from './practice.routes';

export const routes = {
  ...practiceRoutes,
  ...practiceDetailsRoutes,
  ...conflictCheckRoutes,
  ...memberProfileRoutes,
};

export * from './practice.routes';
export * from './practice-details.routes';
export * from './conflict-check.routes';
export * from './member-profiles.routes';
