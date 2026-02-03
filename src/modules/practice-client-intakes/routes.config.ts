export const config = {
  name: 'practice-client-intakes',
  prefix: '/api/practice/client-intakes',
  middleware: {
    '*': ['requireAuth'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    '/:uuid/status': ['public'],
    '/:uuid/checkout-session': ['public'],
    '/post-pay/status': ['public'],
  },
};
