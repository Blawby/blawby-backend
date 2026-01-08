/**
 * Graphile Worker Client
 *
 * Provides singleton access to Graphile Worker utilities for enqueueing jobs.
 * Uses PostgreSQL connection string from environment variables.
 */

import { makeWorkerUtils, type WorkerUtils } from 'graphile-worker';
import { config } from '@dotenvx/dotenvx';

// Load environment variables
config();

let workerUtils: WorkerUtils | null = null;

/**
 * Get database connection string from environment
 */
const getConnectionString = (): string => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required for Graphile Worker');
  }
  return dbUrl;
};

/**
 * Get or create Graphile Worker utils singleton
 * This is used for enqueueing jobs from the API server
 */
export const getWorkerUtils = async (): Promise<WorkerUtils> => {
  if (!workerUtils) {
    const connectionString = getConnectionString();
    const schema = process.env.GRAPHILE_WORKER_SCHEMA || 'graphile_worker';

    // Extract connection info for logging (mask password)
    const connectionInfo = connectionString.replace(/:[^:@]+@/, ':****@');
    
    console.log('🔌 Connecting to Graphile Worker...');
    console.log(`   Database: ${connectionInfo}`);
    console.log(`   Schema: ${schema}`);

    try {
      workerUtils = await makeWorkerUtils({
        connectionString,
        schema,
      });

      console.log('✅ Graphile Worker connected and ready');
    } catch (error) {
      console.error('❌ Graphile Worker connection error:', error);
      throw error;
    }
  }

  return workerUtils;
};

/**
 * Close Graphile Worker connection
 * Call this during graceful shutdown
 */
export const closeWorkerUtils = async (): Promise<void> => {
  if (workerUtils) {
    console.log('🔌 Closing Graphile Worker connection...');
    try {
      await workerUtils.release();
      workerUtils = null;
      console.log('✅ Graphile Worker connection closed');
    } catch (error) {
      console.error('❌ Error closing Graphile Worker connection:', error);
      throw error;
    }
  }
};

