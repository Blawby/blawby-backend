import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/index.ts',
    './src/modules/*/database/schema/index.ts',
    './src/modules/*/schemas/index.ts',
  ],
  out: './src/shared/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
