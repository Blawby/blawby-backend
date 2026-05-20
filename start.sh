#!/bin/sh
set -e

# Start background workers (only if queue enabled)
if [ "$ENABLE_QUEUE" = "true" ]; then
  node dist/workers/event.worker.js &
  node dist/workers/email.worker.js &
fi

# Run API server as main process (PID 1 signal target)
exec node dist/hono-server.js
