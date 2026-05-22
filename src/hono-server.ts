import { serve } from '@hono/node-server';
import closeWithGrace from 'close-with-grace';
import { getLogger } from '@logtape/logtape';
import '@/boot/env';
import { config } from '@/shared/config';
import { initializeLogging } from '@/shared/logging/config';

const logger = getLogger(['app', 'server']);

// Initialize logging before importing the app, because the app boots during module load.
await initializeLogging();

const { default: app } = await import('@/hono-app');

const { port } = config.server;
// Use '0.0.0.0' to listen on all network interfaces (required for ngrok/tunneling)
const { host } = config.server;

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    logger.info('Hono server running on http://{displayHost}:{port}', { displayHost, port: info.port });
    logger.info('API docs available at http://{displayHost}:{port}/docs', { displayHost, port: info.port });
    if (host === '0.0.0.0') {
      logger.info('Server listening on all interfaces');
    }
  }
);

// Graceful shutdown
closeWithGrace({ delay: 30_000 }, async ({ signal, err, manual }) => {
  if (err) {
    logger.error('Server error: {error}', { error: err });
  }

  logger.info('Received {signal} signal. Shutting down gracefully...', {
    signal: signal ?? (manual ? 'manual' : 'unknown'),
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
    });
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown: {error}', { error });
    process.exit(1);
  }
});
