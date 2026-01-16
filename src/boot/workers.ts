/**
 * Workers Boot
 *
 * Note: Graphile Worker runs as a separate process (via pnpm run worker:dev or pnpm run worker).
 * This boot function is kept for backward compatibility but no longer starts workers in-process.
 *
 * Workers are started via:
 * - Development: `pnpm run worker:dev` (separate terminal/process)
 * - Production: `pnpm run worker` (separate process/container)
 */

/**
 * Boot background workers
 *
 * Note: With Graphile Worker, workers run as separate processes.
 * This function is a no-op but kept for API compatibility.
 */
export const bootWorkers = (): void => {
  console.info('ℹ️  Graphile Worker runs as a separate process. Start with: pnpm run worker:dev');
  // Workers are started via package.json scripts, not in-process
};
