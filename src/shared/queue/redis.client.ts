// /**
//  * @deprecated Redis client is deprecated. Use Graphile Worker instead.
//  * This file is kept for backward compatibility during migration.
//  * Will be removed after full migration to Graphile Worker.
//  */

// import Redis from 'ioredis';

// let redisConnection: Redis | null = null;

// /**
//  * @deprecated Use Graphile Worker instead. This will be removed after migration.
//  */
// export const getRedisConnection = (): Redis => {
//   console.warn(
//     '⚠️  getRedisConnection() is deprecated. Use Graphile Worker instead.',
//   );

//   if (!redisConnection) {
//     redisConnection = new Redis({
//       host: process.env.REDIS_HOST || 'localhost',
//       port: Number(process.env.REDIS_PORT) || 6379,
//       password: process.env.REDIS_PASSWORD,
//       db: Number(process.env.REDIS_DB) || 0,
//       maxRetriesPerRequest: null, // REQUIRED for BullMQ
//       enableReadyCheck: false,
//     });

//     // Handle Redis connection events
//     redisConnection.on('connect', () => {
//       console.log('✅ Redis connected (deprecated - use Graphile Worker)');
//     });

//     redisConnection.on('error', (error) => {
//       console.error('❌ Redis connection error:', error);
//     });

//     redisConnection.on('close', () => {
//       console.log('🔌 Redis connection closed');
//     });
//   }

//   return redisConnection;
// };

// // For backward compatibility
// export { getRedisConnection as redisConnection };
