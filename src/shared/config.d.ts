declare module '@/shared/config' {
  export interface CloudflareConfig {
    accountId?: string;
    r2AccessKeyId?: string;
    r2SecretAccessKey?: string;
    imagesAccountHash?: string;
    imagesApiToken?: string;
    r2BucketName?: string;
    r2PublicUrl?: string;
  }

  export interface StripeConfig {
    webhookSecret?: string;
    connectWebhookSecret?: string;
  }

  export interface AppSection {
    appUrl: string;
  }

  export interface EnvSection {
    isProduction: boolean;
  }

  export interface AppConfig {
    app: AppSection;
    env: EnvSection;
    stripe: StripeConfig;
    cloudflare: CloudflareConfig;
  }

  export const config: AppConfig;
}
