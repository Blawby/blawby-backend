export type UploadContext = 'matter' | 'intake' | 'trust' | 'profile' | 'asset';
export type UploadStatus = 'pending' | 'verified' | 'rejected';
export type StorageProvider = 'r2' | 'images';
export type AuditAction = 'created' | 'viewed' | 'downloaded' | 'deleted' | 'restored';

export type SubContext = 'documents' | 'correspondence' | 'evidence';

export interface PresignUploadRequest {
  file_name: string;
  mime_type: string;
  file_size: number;
  upload_context: UploadContext;
  matter_id?: string;
  entity_id?: string;
  sub_context?: SubContext;
  is_privileged?: boolean;
}

export interface PresignUploadResponse {
  upload_id: string;
  presigned_url: string;
  method: string;
  storage_key: string;
  expires_at: string;
}

export interface ConfirmUploadResponse {
  upload_id: string;
  public_url: string;
  storage_key: string;
  status: UploadStatus;
}

export interface UploadDetails {
  upload_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  storage_provider: StorageProvider;
  storage_key: string;
  public_url: string | null;
  upload_context: UploadContext;
  matter_id: string | null;
  entity_id: string | null;
  status: UploadStatus;
  is_privileged: boolean;
  retention_until: string | null;
  created_at: string;
  verified_at: string | null;
  uploaded_by: string | null;
}

export interface DeleteUploadRequest {
  reason: string;
}

export interface ListUploadsQuery {
  matter_id?: string;
  upload_context?: UploadContext;
  entity_id?: string;
  status?: UploadStatus;
  include_deleted?: boolean;
  page?: number;
  limit?: number;
}

export interface ListUploadsResponse {
  uploads: UploadDetails[];
  total: number;
  page: number;
  limit: number;
}

export interface DownloadUrlResponse {
  download_url: string;
  expires_at: string;
}

export interface AuditLogEntry {
  id: string;
  upload_id: string;
  action: AuditAction;
  user_id: string | null;
  user_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogResponse {
  audit_logs: AuditLogEntry[];
  total: number;
}
