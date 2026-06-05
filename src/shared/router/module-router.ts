import { MODULE_REGISTRY } from './modules.generated';
import type { AppType } from '@/shared/types/hono';

console.log(`📦 Loaded ${MODULE_REGISTRY.length} modules statically`);

const loadModule = (app: AppType, registryEntry: (typeof MODULE_REGISTRY)[number]): void => {
  if (!registryEntry.http) {
    console.warn(`⚠️  Module ${registryEntry.name} missing http export`);
    return;
  }

  app.route(registryEntry.mountPath, registryEntry.http);
  console.log(`✅ Mounted module: ${registryEntry.name} at ${registryEntry.mountPath}`);
};

/**
 * Register all module routes.
 * Modules are statically discovered at build time.
 */
export const registerModuleRoutes = async (app: AppType): Promise<void> => {
  for (const registryEntry of MODULE_REGISTRY) {
    loadModule(app, registryEntry);
  }
};
