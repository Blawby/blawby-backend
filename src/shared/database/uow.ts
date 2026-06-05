import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from '@/shared/database';
import { buildUowRepositories, type UowRepositories } from '@/shared/database/uow.generated';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UowContext {
  tx: Tx;
  repositories: UowRepositories;
}

const txStorage = new AsyncLocalStorage<Tx>();

/**
 * Returns the active transaction if inside uow.transaction(), otherwise the global db.
 * Used by repositories instead of importing db directly.
 */
export const getActiveTx = (): Tx | typeof db => txStorage.getStore() ?? db;

export const uow = {
  /**
   * REQUIRED propagation: nested calls join the outer transaction automatically.
   * Equivalent to Spring's @Transactional(propagation = REQUIRED).
   */
  transaction<T>(fn: (ctx: UowContext) => Promise<T>): Promise<T> {
    const existing = txStorage.getStore();
    if (existing) {
      return fn({ tx: existing, repositories: buildUowRepositories(existing) });
    }
    return db.transaction((tx) =>
      txStorage.run(tx, () => fn({ tx, repositories: buildUowRepositories(tx) }))
    );
  },
};
