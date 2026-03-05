import * as practiceDetailsRoutes from './practice-details.routes';
import * as practiceRoutes from './practice.routes';

export const routes = {
  ...practiceRoutes,
  ...practiceDetailsRoutes,
};

export * from './practice.routes';
export * from './practice-details.routes';
