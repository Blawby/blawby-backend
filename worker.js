import { Container, getRandom } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

const PORT_READY_TIMEOUT_MS = 120_000;
const INSTANCE_GET_TIMEOUT_MS = 30_000;

export class BackendContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '30m';

  envVars = {
    DATABASE_URL: env.DATABASE_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
    BASE_URL: env.BASE_URL,
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_CONNECT_WEBHOOK_SECRET,
    RESEND_API_KEY: env.RESEND_API_KEY,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
    FRONTEND_URL: env.FRONTEND_URL,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: env.GOOGLE_REDIRECT_URI,
    GOOGLE_REDIRECT_URI_LOCAL: env.GOOGLE_REDIRECT_URI_LOCAL,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_R2_ACCESS_KEY_ID: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET_NAME: env.CLOUDFLARE_R2_BUCKET_NAME,
    CLOUDFLARE_TURNSTILE_SECRET_KEY: env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
    ENABLE_QUEUE: env.ENABLE_QUEUE ?? 'false',
    PORT: env.PORT ?? '3000',
    SERVER_HOSTNAME: env.SERVER_HOSTNAME ?? '0.0.0.0',
    APP_ENV: env.APP_ENV ?? 'production',
    SKIP_CAPTCHA: env.SKIP_CAPTCHA ?? 'false',
    RUNNING_IN_CLOUDFLARE_CONTAINER: 'true',
    NODE_ENV: 'production',
  };

  async onStart() {
    console.log('[container] started and healthy');
  }

  async onStop({ exitCode, reason }) {
    console.log('[container] stopped', { exitCode, reason });
  }

  onError(error) {
    console.error(
      '[container] error:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  async fetch(request) {
    const port = this.defaultPort;
    const state = await this.getState();

    if (state.status !== 'healthy') {
      try {
        await this.startAndWaitForPorts({
          ports: port,
          cancellationOptions: {
            instanceGetTimeoutMS: INSTANCE_GET_TIMEOUT_MS,
            portReadyTimeoutMS: PORT_READY_TIMEOUT_MS,
          },
        });
      } catch (error) {
        return new Response(`Failed to start container: ${error instanceof Error ? error.message : String(error)}`, {
          status: 500,
        });
      }
    }

    return this.containerFetch(request, port);
  }
}

export default {
  async fetch(request, env) {
    const parsed = parseInt(env.CONTAINER_INSTANCES ?? '1', 10);
    const instances = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    return (await getRandom(env.BACKEND, instances)).fetch(request);
  },
};
