declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    APP_ENV: 'development' | 'production' | 'test';
    APP_URL?: string;

    // Database Configuration
    DATABASE_URL: string;

    // Better Auth Configuration
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_BASE_URL?: string;

    // Google OAuth Configuration
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;

    // Server Configuration
    BASE_URL: string;
    FRONTEND_URL: string;
    PORT: string;
    SERVER_HOSTNAME: string;
    ALLOWED_ORIGINS: string;
    REDIS_HOST?: string;
    ENABLE_QUEUE: 'true' | 'false';

    // Stripe Configuration
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_CONNECT_WEBHOOK_SECRET: string;

    // Resend Configuration
    RESEND_API_KEY: string;

    // Cloudflare Turnstile Configuration
    CLOUDFLARE_TURNSTILE_SECRET_KEY: string;
    SKIP_CAPTCHA: 'true' | 'false';

    // Cloudflare Uploads Configuration
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
    CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
    CLOUDFLARE_IMAGES_ACCOUNT_HASH?: string;
    CLOUDFLARE_IMAGES_API_TOKEN?: string;
    CLOUDFLARE_R2_BUCKET_NAME?: string;
    CLOUDFLARE_R2_PUBLIC_URL?: string;

    [key: string]: string | undefined;
  }
}
