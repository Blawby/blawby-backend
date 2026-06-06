import * as conflictCheckRoutes from './conflict-check.routes';
import * as memberProfileRoutes from '@/modules/practice/routes/member-profiles.routes';
import * as intakeTemplateRoutes from './intake-templates.routes';
import * as practiceDetailsRoutes from './practice-details.routes';
import * as practiceRoutes from './practice.routes';

export const routes = {
  ...practiceRoutes,
  ...practiceDetailsRoutes,
  ...conflictCheckRoutes,
  ...memberProfileRoutes,
  ...intakeTemplateRoutes,
};

export * from './practice.routes';
export * from './practice-details.routes';
export * from './conflict-check.routes';
export * from '@/modules/practice/routes/member-profiles.routes';
export * from './intake-templates.routes';
