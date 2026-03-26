import { eq, sql } from 'drizzle-orm';
import { db } from '@/shared/database';
import { appConfig, type AppConfig } from '@/shared/schemas/app-config.schema';
import type { ConfigType, ConfigValue } from '@/shared/types/app-config.types';

/**
 * Prepared Statements
 *
 * Uses Postgres server-side prepared statements via Drizzle's .prepare().
 * After the first execution, Postgres caches the query plan (parse → plan → execute).
 * Subsequent calls skip parsing and planning — just execute with bound parameters.
 */
const getByKeyStmt = db
  .select()
  .from(appConfig)
  .where(eq(appConfig.key, sql.placeholder('key')))
  .limit(1)
  .prepare('get_app_config_by_key');

const getAllStmt = db.select().from(appConfig).prepare('get_all_app_configs');

/**
 * Get a configuration value by key.
 * Returns null if the key does not exist.
 * Uses a prepared statement for optimal query plan caching.
 */
const get = async <T extends ConfigValue = ConfigValue>(key: string): Promise<T | null> => {
  const [config] = await getByKeyStmt.execute({ key });

  if (!config) {
    return null;
  }

  return config.value as T;
};

/**
 * Set a configuration value.
 * Upserts the key with the new value, type, and optional description.
 */
const set = async (key: string, value: ConfigValue, type: ConfigType, description?: string): Promise<AppConfig> => {
  const [updatedConfig] = await db
    .insert(appConfig)
    .values({
      key,
      value,
      type,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: {
        value,
        type,
        ...(description ? { description } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!updatedConfig) {
    throw new Error(`Failed to set app config for key "${key}": No record returned from database.`);
  }

  return updatedConfig;
};

/**
 * Delete a configuration key.
 */
const remove = async (key: string): Promise<void> => {
  await db.delete(appConfig).where(eq(appConfig.key, key));
};

/**
 * Get all configuration settings as a key-value object.
 * Useful for bootstrapping the frontend or loading global context.
 * Uses a prepared statement for optimal query plan caching.
 */
const getAll = async (): Promise<Record<string, ConfigValue>> => {
  const allConfigs = await getAllStmt.execute();

  return allConfigs.reduce< Record<string, ConfigValue>>(
    (acc, config) => {
      acc[config.key] = config.value as ConfigValue;
      return acc;
    },
    {}
  );
};

export const appConfigService = {
  get,
  set,
  remove,
  getAll,
};
