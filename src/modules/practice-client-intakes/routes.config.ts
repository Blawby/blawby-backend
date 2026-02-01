export const config = {
  name: 'practice-client-intakes',
  prefix: '/api/practice/client-intakes',
  middleware: {
    '*': ['requireAuth'],
  },
};
