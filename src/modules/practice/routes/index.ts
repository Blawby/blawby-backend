import * as conflictCheckRoutes from './conflict-check.routes';
import * as practiceDetailsRoutes from './practice-details.routes';
import * as practiceRoutes from './practice.routes';

export const routes = {
  ...practiceRoutes,
  ...practiceDetailsRoutes,
  ...conflictCheckRoutes,
};

export * from './practice.routes';
export * from './practice-details.routes';
export * from './conflict-check.routes';
