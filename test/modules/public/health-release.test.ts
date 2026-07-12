import { describe, expect, it } from 'vitest';
import { getBackendRelease } from '@/modules/public/health-release';

describe('backend health release identity', () => {
  it('uses Railway native commit, deployment, and environment identifiers', () => {
    expect(getBackendRelease({
      RAILWAY_GIT_COMMIT_SHA: 'commit-sha',
      RAILWAY_DEPLOYMENT_ID: 'deployment-id',
      RAILWAY_ENVIRONMENT_NAME: 'production',
    })).toEqual({
      commit: 'commit-sha',
      deployment_id: 'deployment-id',
      environment: 'production',
    });
  });

  it('fails visibly with unknown markers outside Railway instead of inventing identity', () => {
    expect(getBackendRelease({})).toEqual({
      commit: 'unknown',
      deployment_id: 'unknown',
      environment: 'unknown',
    });
  });
});
