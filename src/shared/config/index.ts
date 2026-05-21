import '@/boot/env';
import { z } from 'zod';

const appEnvSchema = z.enum(['development', 'staging', 'production', 'test']);
const nodeEnvSchema = z.enum(['development', 'production', 'test']);

const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default('development'),
    APP_ENV: appEnvSchema.optional(),

    PORT: z.coerce.number().int().positive().default(3000),
    SERVER_HOSTNAME: z.string().optional(),
    HOST: z.string().optional(),
    SERVERNAME: z.string().optional(),

    DATABASE_URL: z.string().optional(),
    DATABASE_SSL_CA: z.string().optional(),
    PG_MAX_CLIENTS: z.string().optional(),
    PG_MIN_CLIENTS: z.string().optional(),
    PG_IDLE_TIMEOUT: z.string().optional(),
    PG_CONNECTION_TIMEOUT: z.string().optional(),

    GRAPHILE_WORKER_SCHEMA: z.string().default('graphile_worker'),
    WEBHOOK_MAX_RETRIES: z.coerce.number().int().positive().default(5),
    WEBHOOK_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

    APP_URL: z.string().optional(),
    BASE_URL: z.string().optional(),
    FRONTEND_URL: z.string().optional(),
    ALLOWED_ORIGINS: z.string().optional(),

    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_BASE_URL: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().optional(),
    GOOGLE_REDIRECT_URI_LOCAL: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),

    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
    CLOUDFLARE_R2_BUCKET_NAME: z.string().optional(),
    CLOUDFLARE_R2_PUBLIC_URL: z.string().optional(),
    CLOUDFLARE_IMAGES_ACCOUNT_HASH: z.string().optional(),
    CLOUDFLARE_IMAGES_API_TOKEN: z.string().optional(),
    CLOUDFLARE_TURNSTILE_SECRET_KEY: z.string().optional(),
    SKIP_CAPTCHA: z.enum(['true', 'false']).optional(),
    WORKER_EVENT_SECRET: z.string().trim().min(32).optional(),
  })
  .loose();

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const csvToArray = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const parseIntWithDefault = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsedNumber = Number.parseInt(value, 10);
  return Number.isFinite(parsedNumber) ? parsedNumber : fallback;
};

const raw = parsed.data;

const appEnv = raw.APP_ENV ?? raw.NODE_ENV;

export const config = {
  env: {
    app: appEnv,
    node: raw.NODE_ENV,
    isDevelopment: appEnv === 'development',
    isStaging: appEnv === 'staging',
    isProduction: appEnv === 'production',
    isTest: appEnv === 'test',
    isProductionLike: appEnv === 'staging' || appEnv === 'production',
  },
  server: {
    port: raw.PORT,
    host: raw.SERVER_HOSTNAME ?? raw.HOST ?? raw.SERVERNAME ?? '0.0.0.0',
  },
  app: {
    appUrl: raw.APP_URL?.trim() ?? 'https://app.blawby.com',
    baseUrl: raw.BASE_URL ?? '',
    frontendUrls: csvToArray(raw.FRONTEND_URL),
    allowedOrigins: csvToArray(raw.ALLOWED_ORIGINS),
  },
  auth: {
    betterAuthSecret: raw.BETTER_AUTH_SECRET,
    betterAuthBaseUrl: raw.BETTER_AUTH_BASE_URL,
    googleClientId: raw.GOOGLE_CLIENT_ID,
    googleClientSecret: raw.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: raw.GOOGLE_REDIRECT_URI,
    googleRedirectUriLocal: raw.GOOGLE_REDIRECT_URI_LOCAL,
  },
  stripe: {
    secretKey: raw.STRIPE_SECRET_KEY,
    webhookSecret: raw.STRIPE_WEBHOOK_SECRET,
    connectWebhookSecret: raw.STRIPE_CONNECT_WEBHOOK_SECRET,
  },
  email: {
    resendApiKey: raw.RESEND_API_KEY,
  },
  cloudflare: {
    accountId: raw.CLOUDFLARE_ACCOUNT_ID,
    r2AccessKeyId: raw.CLOUDFLARE_R2_ACCESS_KEY_ID,
    r2SecretAccessKey: raw.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    r2BucketName: raw.CLOUDFLARE_R2_BUCKET_NAME,
    r2PublicUrl: raw.CLOUDFLARE_R2_PUBLIC_URL,
    imagesAccountHash: raw.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
    imagesApiToken: raw.CLOUDFLARE_IMAGES_API_TOKEN,
    turnstileSecretKey: raw.CLOUDFLARE_TURNSTILE_SECRET_KEY,
  },
  captcha: {
    skip: raw.SKIP_CAPTCHA === 'true',
  },
  workerEvents: {
    secret: raw.WORKER_EVENT_SECRET,
  },
  database: {
    url: raw.DATABASE_URL,
    ssl: {
      ca: raw.DATABASE_SSL_CA,
    },
    pool: {
      maxClients: parseIntWithDefault(raw.PG_MAX_CLIENTS, 10),
      minClients: parseIntWithDefault(raw.PG_MIN_CLIENTS, 2),
      idleTimeoutMs: parseIntWithDefault(raw.PG_IDLE_TIMEOUT, 30_000),
      connectionTimeoutMs: parseIntWithDefault(raw.PG_CONNECTION_TIMEOUT, 2_000),
    },
  },
  queue: {
    schema: raw.GRAPHILE_WORKER_SCHEMA,
    maxAttempts: raw.WEBHOOK_MAX_RETRIES,
    concurrency: raw.WEBHOOK_WORKER_CONCURRENCY,
  },
  raw: process.env,
} as const;

export type AppEnvironment = z.infer<typeof appEnvSchema>;
export type NodeEnvironment = z.infer<typeof nodeEnvSchema>;
