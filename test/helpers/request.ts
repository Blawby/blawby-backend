import supertest from 'supertest';
import { getRequestListener } from '@hono/node-server';
import { app } from './app';

type RequestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type AuthenticatedRequest = Record<RequestMethod, (path: string) => supertest.Test>;

// SessionToken is the full cookie string from Better Auth's login().headers.get('cookie'),
// E.g. "better-auth.session_token=rawToken.hmacSignature"
const applyAuthHeaders = (req: supertest.Test, sessionToken: string): supertest.Test => req.set('Cookie', sessionToken);

const createAuthenticatedRequest = (
  fetch: Parameters<typeof getRequestListener>[0],
  sessionToken: string
): AuthenticatedRequest => {
  const baseRequest = createRequest(fetch);

  return {
    get: (path) => applyAuthHeaders(baseRequest.get(path), sessionToken),
    post: (path) => applyAuthHeaders(baseRequest.post(path), sessionToken),
    put: (path) => applyAuthHeaders(baseRequest.put(path), sessionToken),
    patch: (path) => applyAuthHeaders(baseRequest.patch(path), sessionToken),
    delete: (path) => applyAuthHeaders(baseRequest.delete(path), sessionToken),
  };
};

const createRequest = (fetch: Parameters<typeof getRequestListener>[0]) => supertest(getRequestListener(fetch));

const request = createRequest(app.fetch);

const apiRequest = (method: RequestMethod, path: string): supertest.Test =>
  request[method](path).set('Content-Type', 'application/json').set('Accept', 'application/json');

// Helper for authenticated requests
const authenticatedRequest = (sessionToken: string): AuthenticatedRequest =>
  createAuthenticatedRequest(app.fetch, sessionToken);

export { apiRequest, authenticatedRequest, createAuthenticatedRequest, createRequest, request };
