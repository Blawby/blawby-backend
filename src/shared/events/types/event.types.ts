import type { DrizzleDb } from '@/shared/database';
import type { BaseEvent as BaseEventRecord } from '@/shared/events/schemas/events.schema';

export type Handler<T> = (payload: T, context?: BaseEventRecord) => Promise<void | boolean>;

export interface DispatchOptions {
  actorId?: string;
  actorType?: 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization';
  organizationId?: string;
  tx?: DrizzleDb;
  /** For critical events (Stripe/payments): immediate DB write, guaranteed before response */
  critical?: boolean;
}

export interface EventClass<T extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  new (payload: T, actorId?: string, organizationId?: string): { payload: T };
  dispatch(payload: T, options?: DispatchOptions): string | Promise<string>;
}
