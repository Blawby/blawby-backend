export const config = {
  name: 'practice-client-intakes',
  prefix: '/api/practice/client-intakes',
  middleware: {
    '*': ['requireAuth'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    'GET /post-pay/status': ['public'],
  },
};
