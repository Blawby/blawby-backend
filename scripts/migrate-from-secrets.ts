import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const secretsPath = process.argv[2];

if (!secretsPath) {
  console.error('Usage: tsx scripts/migrate-from-secrets.ts <cf-secrets.json>');
  process.exit(1);
}

const resolvedPath = resolve(secretsPath);
let secrets: Record<string, unknown>;

try {
  if (!existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }

  secrets = JSON.parse(readFileSync(resolvedPath, 'utf8')) as Record<string, unknown>;
} catch (error) {
  console.error(`Failed to read or parse secrets JSON at ${resolvedPath}:`, error);
  process.exit(1);
}

const databaseUrl = secrets.DATABASE_URL;

if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  console.error(`DATABASE_URL is missing from ${secretsPath}`);
  process.exit(1);
}

let result: ReturnType<typeof spawnSync>;

try {
  result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
} catch (error) {
  console.error('Failed to start drizzle-kit migrate:', error);
  process.exit(1);
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  console.error('Failed to run drizzle-kit migrate:', result.error);
  process.exit(1);
}

if (result.signal) {
  console.error(`drizzle-kit migrate exited with signal ${result.signal}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`drizzle-kit migrate failed with exit code ${result.status ?? 'unknown'}`);
  process.exit(result.status ?? 1);
}
