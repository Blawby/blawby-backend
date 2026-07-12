export interface BackendRelease {
  commit: string;
  deployment_id: string;
  environment: string;
}

const valueOrUnknown = (value: string | undefined): string => value?.trim() || 'unknown';

export const getBackendRelease = (env: NodeJS.ProcessEnv = process.env): BackendRelease => ({
  commit: valueOrUnknown(env.RAILWAY_GIT_COMMIT_SHA),
  deployment_id: valueOrUnknown(env.RAILWAY_DEPLOYMENT_ID),
  environment: valueOrUnknown(env.RAILWAY_ENVIRONMENT_NAME ?? env.APP_ENV ?? env.NODE_ENV),
});
