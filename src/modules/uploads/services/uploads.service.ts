import { uploadConfirmService } from '@/modules/uploads/services/upload-confirm.service';
import { uploadPresignService } from '@/modules/uploads/services/upload-presign.service';
import { uploadQueriesService } from '@/modules/uploads/services/upload-queries.service';

export const uploadsService = {
  presignUpload: (...args: Parameters<typeof uploadPresignService.presignUpload>) =>
    uploadPresignService.presignUpload(...args),
  confirmUpload: (...args: Parameters<typeof uploadConfirmService.confirmUpload>) =>
    uploadConfirmService.confirmUpload(...args),
  deleteUpload: (...args: Parameters<typeof uploadConfirmService.deleteUpload>) =>
    uploadConfirmService.deleteUpload(...args),
  restoreUpload: (...args: Parameters<typeof uploadConfirmService.restoreUpload>) =>
    uploadConfirmService.restoreUpload(...args),
  getUploadDetails: (...args: Parameters<typeof uploadQueriesService.getUploadDetails>) =>
    uploadQueriesService.getUploadDetails(...args),
  getDownloadUrl: (...args: Parameters<typeof uploadQueriesService.getDownloadUrl>) =>
    uploadQueriesService.getDownloadUrl(...args),
  listUploads: (...args: Parameters<typeof uploadQueriesService.listUploads>) =>
    uploadQueriesService.listUploads(...args),
  getAuditLogs: (...args: Parameters<typeof uploadQueriesService.getAuditLogs>) =>
    uploadQueriesService.getAuditLogs(...args),
};

export default uploadsService;
