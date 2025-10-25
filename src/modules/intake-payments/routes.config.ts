export const config = {
  name: 'intake-payments',
  middleware: {
    // All intake payment routes are public (no authentication required)
    '*': ['public'],
  },
};
