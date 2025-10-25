import { config } from '@dotenvx/dotenvx';
import { serve } from '@hono/node-server';
import closeWithGrace from 'close-with-grace';

import app from './hono-app';

if (process.env.NODE_ENV !== 'production') {
  config();
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.SERVER_HOSTNAME
  ?? process.env.HOST
  ?? process.env.SERVERNAME
  ?? 'localhost';

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`🔥 Hono server running on http://${host}:${info.port}`);
  console.log(`📚 API Docs: http://${host}:${info.port}/docs`);
});

// Graceful shutdown
closeWithGrace({ delay: 500 }, async ({ signal, err, manual }) => {
  if (err) {
    console.error('Server error:', err);
  }

  console.log(`\n🛑 Received ${signal || (manual ? 'manual' : 'unknown')} signal. Shutting down gracefully...`);

  try {
    void server.close();
    console.log('✅ Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});
