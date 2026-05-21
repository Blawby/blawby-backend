import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const secretsPath = process.argv[2];

if (!secretsPath) {
  console.error('Usage: tsx scripts/migrate-from-secrets.ts <cf-secrets.json>');
  process.exit(1);
}

const resolvedPath = resolve(secretsPath);
const secrets = JSON.parse(readFileSync(resolvedPath, 'utf8')) as Record<string, unknown>;
const databaseUrl = secrets.DATABASE_URL;

if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  console.error(`DATABASE_URL is missing from ${secretsPath}`);
  process.exit(1);
}

const child = spawn('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`drizzle-kit migrate exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
