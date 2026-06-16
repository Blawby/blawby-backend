import { db } from '@/shared/database';
import { AsyncLocalStorage } from 'node:async_hooks';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface UowStore {
  tx: Tx;
  afterCommitCallbacks: (() => Promise<void> | void)[];
}

const txStorage = new AsyncLocalStorage<UowStore>();

export interface UowContext {
  tx: Tx;
}

/**
 * Returns the active transaction if inside uow.transaction(), otherwise the global db.
 * Used by repositories instead of importing db directly.
 */
export const getActiveTx = (): Tx | typeof db => txStorage.getStore()?.tx ?? db;

export const isInTransaction = (): boolean => txStorage.getStore() !== undefined;

export const uow = {
  /**
   * REQUIRED propagation: nested calls join the outer transaction automatically.
   * Equivalent to Spring's @Transactional(propagation = REQUIRED).
   */
  transaction<T>(fn: (ctx: UowContext) => Promise<T>): Promise<T> {
    const existing = txStorage.getStore();
    if (existing) {
      return fn({ tx: existing.tx });
    }
    let callbacks: UowStore['afterCommitCallbacks'] = [];
    return db
      .transaction(async (tx) => {
        const store: UowStore = { tx, afterCommitCallbacks: [] };
        const result = await txStorage.run(store, () => fn({ tx }));
        callbacks = [...store.afterCommitCallbacks];
        return result;
      })
      .then(async (result) => {
        for (const callback of callbacks) {
          await callback();
        }
        return result;
      });
  },

  async afterCommit(callback: () => Promise<void> | void): Promise<void> {
    const existing = txStorage.getStore();
    if (!existing) {
      await callback();
      return;
    }
    existing.afterCommitCallbacks.push(callback);
  },
};

export type { Tx };
