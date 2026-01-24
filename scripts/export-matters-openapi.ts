import { OpenAPIHono } from '@hono/zod-openapi';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import mattersApp from '../src/modules/matters/http';

async function exportMattersOpenApi() {
  const app = new OpenAPIHono();

  // Mount matters app with its actual API prefix
  app.route('/api/matters', mattersApp);

  const doc = app.getOpenAPIDocument({
    openapi: '3.0.0',
    info: {
      title: 'Blawby Matters API',
      version: '1.0.0',
      description: 'API documentation for Matters module',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
    ],
  });

  // Add Cookie-based security scheme since we don't use tokens
  if (!doc.components) doc.components = {};
  doc.components.securitySchemes = {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'better-auth.session-token',
      description: 'Session cookie for authentication',
    },
  };

  // Apply security globally to all routes in this spec
  doc.security = [{ cookieAuth: [] }];

  const outputPath = join(process.cwd(), 'docs/matters-openapi.json');

  try {
    await mkdir(join(process.cwd(), 'docs'), { recursive: true });
    await writeFile(outputPath, JSON.stringify(doc, null, 2), 'utf-8');
    console.log(`✅ Matters OpenAPI spec exported to: ${outputPath}`);
  } catch (error) {
    console.error('❌ Failed to export OpenAPI spec:', error);
    process.exit(1);
  }
}

exportMattersOpenApi();
