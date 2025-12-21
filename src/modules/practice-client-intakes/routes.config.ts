export const config = {
  name: 'practice-client-intakes',
  prefix: '/api/practice/client-intakes', // Full path for API routes
  middleware: {
    // All practice client intake routes are public (no authentication required)
    '*': ['public'],
  },
};
