import type { ModuleConfig } from '@/shared/router/module-router';

export const config: ModuleConfig = {
  name: 'uploads',
  middleware: {
    '*': ['requireAuth', 'rateLimit'],
  },
};
