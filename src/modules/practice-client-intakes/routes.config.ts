import { rateLimit } from '@/shared/middleware/rateLimit';
import {
  attachIntakeOwnership,
  authorizeIntakeOwnership,
} from '@/modules/practice-client-intakes/middleware/authorize-intake';

export const config = {
  name: 'practice-client-intakes',
  prefix: '/api/practice/client-intakes',
  middleware: {
    '*': ['requireAuth'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    'GET /:uuid/status': [
      rateLimit({ points: 10, duration: 60, routeKey: 'intake-status' }),
      attachIntakeOwnership(),
    ],
    'POST /:uuid/checkout-session': [
      rateLimit({ points: 10, duration: 60, routeKey: 'intake-checkout-session' }),
      authorizeIntakeOwnership(),
    ],
    'GET /post-pay/status': [
      rateLimit({ points: 10, duration: 60, routeKey: 'intake-post-pay-status' }),
    ],
  },
};
