import supertest from 'supertest';
import { app } from './app';

// Create supertest instance
// We use app.fetch because Hono uses Fetch API, but Supertest expects a node server or request listener.
// Hono has a node adapter. @hono/node-server/serve accepts (req, res).
// Supertest accepts generic handler.
// Actually, supertest works with Hono if we pass the listener.
// But Hono itself isn't a node listener.
// We need to adapt it. @hono/node-server serves it.
// However, supertest(app) might not work directly if app is Hono instance.
// Usually for Hono + Supertest:
// import { serve } from '@hono/node-server'
// const server = serve(app)
// const request = supertest(server)
// BUT, creating a server might bind to port.
// A better way is:
// Hono's `app.request` handles requests.
// We can use a custom function for supertest?
// No, supertest needs a server or a function (req, res) => void.
// Hono has `app.fetch`.
// To use supertest with Hono, folks usually use `worker` mode or adapter.
// Let's use `supertest(app.fetch)`? No, `app.fetch` signature is different.
// The plan used `supertest(app.fetch)`. Let's verify if that works.
// Actually, `supertest` expects an http.Server or a function with (req, res) signature.
// `app.fetch` takes (request, env, executionCtx).
// We might need `@hono/node-server`'s `serve` logic but without listening.
// Or we can use `testClient` from Hono, but the plan specified `supertest`.
// Let's try `supertest` with a node listener adapter.

import { getRequestListener } from '@hono/node-server';

export const request = supertest(getRequestListener(app.fetch));

// Helper for authenticated requests
export function authenticatedRequest(sessionToken: string) {
  const agent = supertest.agent(getRequestListener(app.fetch));
  // agent.set sets default headers for all requests made by this agent
  agent.set('Cookie', `better-auth.session_token=${sessionToken}`);
  return agent;
}

// Helper for API requests with JSON
export function apiRequest(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  return request[method](path)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json');
}
