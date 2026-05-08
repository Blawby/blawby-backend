import type { uploadCoreService } from '@/shared/uploads/services/upload-core.service';
import type { ServiceContext } from '@/shared/types/service-context';

export type PresignBody = {
  file_name: string;
  mime_type: string;
  file_size: number;
};

export type EnrichedServiceContextBase = Omit<ServiceContext, 'db' | 'emit'>;

export type PresignPrep = Awaited<ReturnType<typeof uploadCoreService.preparePresign>>;

export type ConfirmPrep = {
  uploadCorePrep: Awaited<ReturnType<typeof uploadCoreService.prepareConfirm>>;
  enrichedBase: EnrichedServiceContextBase;
};

export type ListFilesQuery = {
  page: number;
  limit: number;
};
