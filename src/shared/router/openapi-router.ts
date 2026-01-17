import { OpenAPIHono } from '@hono/zod-openapi';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { MODULE_REGISTRY } from './modules.generated';
import { CONFIG_REGISTRY } from './configs.generated';
import type { AppContext } from '@/shared/types/hono';

/**
 * Calculate mount path for a module using the same logic as module-router.ts
 * This ensures OpenAPI documentation paths match actual API routes
 */
const calculateMountPath = (moduleName: string): string => {
  const configEntry = CONFIG_REGISTRY.find((entry) => entry.name === moduleName);
  const config = configEntry?.config;

  // If prefix is provided and starts with '/', use it as-is (full path)
  // Otherwise, construct path with module name
  return config?.prefix
    ? (config.prefix.startsWith('/') ? config.prefix : `/api/${config.prefix}/${moduleName}`)
    : `/api/${moduleName}`;
};

/**
 * Create and configure OpenAPI app for documentation
 * Mounts all OpenAPIHono modules with correct paths matching actual routes
 */
export const createOpenApiApp = (): OpenAPIHono<AppContext> => {
  const openApiApp = new OpenAPIHono<AppContext>({
    router: new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()],
    }),
  });

  // Configure OpenAPI security scheme
  openApiApp.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Bearer token authentication. Get token from /api/auth/sign-in/email endpoint.',
  });

  // Mount all OpenAPIHono modules with correct paths
  for (const module of MODULE_REGISTRY) {
    if (module.http instanceof OpenAPIHono) {
      const mountPath = calculateMountPath(module.name);
      openApiApp.route(mountPath, module.http);
    }
  }

  return openApiApp;
};
