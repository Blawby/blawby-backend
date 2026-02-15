import { config } from '@dotenvx/dotenvx';
config();

// Dynamically import service AFTER env vars are loaded
// This prevents "DATABASE_URL missing" error when connection.ts is evaluated
const { appConfigService } = await import('../src/shared/services/app-config.service');

const seeds = [
  {
    key: 'intake_redirect_url',
    value: 'onboarding?returnTo=/client/conversations',
    type: 'string' as const,
    description: 'URL path to redirect users after magic link login from intake',
  },
  {
    key: 'email_from_address',
    value: 'notifcations@blawby.com',
    type: 'string' as const,
    description: 'Default sender email address',
  },
  {
    key: 'email_from_name',
    value: 'Blawby',
    type: 'string' as const,
    description: 'Default sender name',
  },
];

const main = async () => {
  console.log('🌱 Seeding app configuration...');

  for (const seed of seeds) {
    console.log(`Setting ${seed.key} = ${seed.value}`);
    await appConfigService.set(seed.key, seed.value, seed.type, seed.description);
  }

  console.log('\n✅ Verification:');
  const all = await appConfigService.getAll();
  console.log(all);

  process.exit(0);
};

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
