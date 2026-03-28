interface CloudflareConfig {
  accountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  imagesAccountHash?: string;
  imagesApiToken?: string;
  r2BucketName?: string;
  r2PublicUrl?: string;
}

interface StripeConfig {
  webhookSecret?: string;
  connectWebhookSecret?: string;
}

interface AppSection {
  appUrl: string;
}

interface EnvSection {
  isProduction: boolean;
}

interface AppConfig {
  app: AppSection;
  env: EnvSection;
  stripe: StripeConfig;
  cloudflare: CloudflareConfig;
}

export const config: AppConfig = {
  app: {
    appUrl: process.env.APP_URL ?? 'https://app.blawby.com',
  },
  env: {
    isProduction: process.env.NODE_ENV === 'production',
  },
  stripe: {
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  },
  cloudflare: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    r2AccessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    imagesAccountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
    imagesApiToken: process.env.CLOUDFLARE_IMAGES_API_TOKEN,
    r2BucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    r2PublicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
  },
};
