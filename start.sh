#!/bin/sh
set -e

# Start background workers (only if queue enabled)
if [ "$ENABLE_QUEUE" = "true" ]; then
  node dist/workers/event.worker.js &
  EVENT_WORKER_PID=$!
  node dist/workers/email.worker.js &
  EMAIL_WORKER_PID=$!

  # Monitor workers — restart container if either exits unexpectedly
  monitor_workers() {
    wait $EVENT_WORKER_PID
    echo "event worker exited, shutting down container" >&2
    kill $EMAIL_WORKER_PID 2>/dev/null
    exit 1
  }
  monitor_workers &
fi

# Run API server as main process (PID 1 signal target)
exec node dist/hono-server.js
