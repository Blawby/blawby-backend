import { createRoute, z } from '@hono/zod-openapi';

/**
 * Common success schemas
 */
const successSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  message: z.string().optional(),
});

/**
 * Root Route
 */
export const rootRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Public'],
  summary: 'Root Endpoint',
  description: 'Backend server status information',
  responses: {
    200: {
      description: 'Server status',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            timestamp: z.string(),
            routes: z.array(z.string()),
          }),
        },
      },
    },
  },
});

/**
 * Health Check Route
 */
export const healthRoute = createRoute({
  method: 'get',
  path: '/api/health',
  tags: ['Public'],
  summary: 'Health Check',
  description: 'Public health check endpoint',
  responses: {
    200: {
      description: 'System health status',
      content: {
        'application/json': {
          schema: successSchema.extend({
            uptime: z.number(),
            database: z.object({
              status: z.string(),
              latency: z.number().nullable(),
            }),
          }),
        },
      },
    },
    503: {
      description: 'System degraded',
      content: {
        'application/json': {
          schema: successSchema.extend({
            uptime: z.number(),
            database: z.object({
              status: z.string(),
              latency: z.number().nullable(),
            }),
          }),
        },
      },
    },
  },
});

/**
 * API Info Route
 */
export const infoRoute = createRoute({
  method: 'get',
  path: '/api/public/info',
  tags: ['Public'],
  summary: 'API Information',
  description: 'Metadata about the Blawby API',
  responses: {
    200: {
      description: 'API metadata',
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            version: z.string(),
            description: z.string(),
          }),
        },
      },
    },
  },
});

/**
 * Contact Form Route
 */
export const contactRoute = createRoute({
  method: 'post',
  path: '/api/public/contact',
  tags: ['Public'],
  summary: 'Submit Contact Form',
  description: 'Public endpoint to submit the contact form',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            email: z.string().email(),
            subject: z.string(),
            message: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Contact form submitted successfully',
      content: {
        'application/json': {
          schema: successSchema,
        },
      },
    },
  },
});
