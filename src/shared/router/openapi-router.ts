import { OpenAPIHono } from '@hono/zod-openapi';
import { RegExpRouter } from 'hono/router/reg-exp-router';
import { SmartRouter } from 'hono/router/smart-router';
import { TrieRouter } from 'hono/router/trie-router';
import { MODULE_REGISTRY } from './modules.generated';
import { uploadsHttp } from '@/shared/uploads/http';
import { config } from '@/shared/config';
import type { AppContext } from '@/shared/types/hono';

/**
 * Create and configure OpenAPI app for documentation
 * Mounts all OpenAPIHono modules with correct paths matching actual routes
 */
const createOpenApiApp = (): OpenAPIHono<AppContext> => {
  const openApiApp = new OpenAPIHono<AppContext>({
    router: new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()],
    }),
  });

  // Configure OpenAPI security scheme
  openApiApp.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session-token',
    description: 'Session cookie for authentication',
  });

  // Mount all OpenAPIHono modules with correct paths
  for (const module of MODULE_REGISTRY) {
    if (module.http instanceof OpenAPIHono) {
      openApiApp.route(module.mountPath, module.http);
    }
  }

  // Shared infrastructure routes that are mounted directly in hono-app.ts
  if (uploadsHttp instanceof OpenAPIHono) {
    openApiApp.route('/api/uploads', uploadsHttp);
  }

  return openApiApp;
};

const buildOpenApiDocument = (openApiApp: OpenAPIHono<AppContext>) => {
  const baseUrl = config.app.baseUrl || `http://localhost:${config.server.port ?? 3000}`;
  const doc = openApiApp.getOpenAPIDocument({
    openapi: '3.0.0',
    info: {
      title: 'Blawby API',
      version: '1.0.0',
      description: 'API documentation for Blawby backend services',
    },
    servers: [{ url: baseUrl, description: 'API server' }],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any)['x-tag-groups'] = [
    {
      name: 'Matters Management',
      tags: ['Matters: General', 'Matters: Notes', 'Matters: Time Entries', 'Matters: Expenses', 'Matters: Milestones'],
    },
    {
      name: 'Stripe Connect',
      tags: ['Stripe Connect'],
    },
  ];

  return doc;
};

export { createOpenApiApp, buildOpenApiDocument };
