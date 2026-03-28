import { uploadReadRoutes } from '@/modules/uploads/routes/upload-read.routes';
import { uploadWriteRoutes } from '@/modules/uploads/routes/upload-write.routes';

export const routes = {
  ...uploadWriteRoutes,
  ...uploadReadRoutes,
};
