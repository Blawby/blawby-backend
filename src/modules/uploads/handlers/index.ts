import { auditLogHandlers } from './audit-log.handler';
import { confirmHandlers } from './confirm.handler';
import { deleteHandlers } from './delete.handler';
import { downloadHandlers } from './download.handler';
import { getHandlers } from './get.handler';
import { listHandlers } from './list.handler';
import { presignHandlers } from './presign.handler';
import { restoreHandlers } from './restore.handler';

export const handlers = {
  ...auditLogHandlers,
  ...confirmHandlers,
  ...deleteHandlers,
  ...downloadHandlers,
  ...getHandlers,
  ...listHandlers,
  ...presignHandlers,
  ...restoreHandlers,
};

export * from './audit-log.handler';
export * from './confirm.handler';
export * from './delete.handler';
export * from './download.handler';
export * from './get.handler';
export * from './list.handler';
export * from './presign.handler';
export * from './restore.handler';
