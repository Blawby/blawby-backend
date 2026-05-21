#!/bin/sh
set -e

node dist/hono-server.js &
API_PID=$!

wait_for_api() {
  for i in $(seq 1 60); do
    if wget -q -O - "http://127.0.0.1:${PORT:-3000}/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "API server did not become ready on port ${PORT:-3000}" >&2
  kill "$API_PID" 2>/dev/null
  exit 1
}

# Start background workers (only if queue enabled)
if [ "$ENABLE_QUEUE" = "true" ]; then
  wait_for_api

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
wait "$API_PID"
