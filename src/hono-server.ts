import { serve } from '@hono/node-server';
import closeWithGrace from 'close-with-grace';
import { getLogger } from '@logtape/logtape';
import '@/boot/env';
import app from '@/hono-app';
import { initializeLogging } from '@/shared/logging/config';

const logger = getLogger(['app', 'server']);

// Initialize logging specifically here to ensure it's available as early as possible
await initializeLogging();

const port = Number(process.env.PORT ?? 3000);
// Use '0.0.0.0' to listen on all network interfaces (required for ngrok/tunneling)
const host = process.env.SERVER_HOSTNAME ?? process.env.HOST ?? process.env.SERVERNAME ?? '0.0.0.0';

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    logger.info('🔥 Hono server running on http://{displayHost}:{port}', { displayHost, port: info.port });
    logger.info('📚 API Docs: http://{displayHost}:{port}/docs', { displayHost, port: info.port });
    if (host === '0.0.0.0') {
      logger.info('🌐 Server listening on all interfaces');
    }
  }
);

// Graceful shutdown
closeWithGrace({ delay: 500 }, async ({ signal, err, manual }) => {
  if (err) {
    logger.error('Server error: {error}', { error: err });
  }

  logger.info('🛑 Received {signal} signal. Shutting down gracefully...', {
    signal: signal || (manual ? 'manual' : 'unknown'),
  });

  try {
    void server.close();
    logger.info('✅ Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown: {error}', { error });
    process.exit(1);
  }
});
