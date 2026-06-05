import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from '@/shared/database';
import { generatedRepositories } from '@/shared/database/uow.generated';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const txStorage = new AsyncLocalStorage<Tx>();

/**
 * Returns the active transaction if inside uow.transaction(), otherwise the global db.
 * Used by repositories instead of importing db directly.
 */
export const getActiveTx = (): Tx | typeof db => txStorage.getStore() ?? db;

export const uow = {
  ...generatedRepositories,

  /**
   * REQUIRED propagation: nested calls join the outer transaction automatically.
   * Equivalent to Spring's @Transactional(propagation = REQUIRED).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    const existing = txStorage.getStore();
    if (existing) return fn();
    return db.transaction((tx) => txStorage.run(tx, fn));
  },
};
