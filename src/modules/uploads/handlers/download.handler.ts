import { isIP } from 'node:net';
import type { AppRouteHandler } from '@/shared/types/hono';
import { uploadsService } from '@/modules/uploads/services/uploads.service';
import { getServiceContext } from '@/shared/types/service-context';
import { sendResult } from '@/shared/utils/responseUtils';
import type { routes } from '@/modules/uploads/routes';

const getValidatedIpAddress = (
  c: Parameters<AppRouteHandler<typeof routes.getDownloadUrlRoute>>[0]
): string | undefined => {
  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) {
    return realIp;
  }

  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(',')
      .map((value) => value.trim())
      .find((value) => value.length > 0);

    if (firstIp && isIP(firstIp)) {
      return firstIp;
    }
  }

  const remoteAddr = c.req.header('remote-addr')?.trim();
  if (remoteAddr && isIP(remoteAddr)) {
    return remoteAddr;
  }

  return undefined;
};

const downloadHandler: AppRouteHandler<typeof routes.getDownloadUrlRoute> = async (c) => {
  const { id } = c.req.valid('param');
  const ipAddress = getValidatedIpAddress(c);
  const userAgent = c.req.header('user-agent');
  const ctx = getServiceContext(c);
  const result = await uploadsService.getDownloadUrl({ id, ipAddress, userAgent }, ctx);
  return sendResult(c, result);
};

export const downloadHandlers = {
  downloadHandler,
} as const;
