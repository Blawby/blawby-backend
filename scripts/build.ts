#!/usr/bin/env tsx
/**
 * Unified Build Script
 * Orchestrates the entire build process in phases
 */

import { execSync, spawn } from 'node:child_process';

/**
 * Runs a shell command asynchronously with real-time stdio.
 * Resolves on exit code 0, rejects otherwise.
 */
const spawnAsync = (cmd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, [], { stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${cmd}" exited with code ${String(code)}`));
      }
    });
    child.on('error', reject);
  });

// ============================================================================
// Phase 2: TypeScript Build (with bundling)
// ============================================================================

const buildTypeScript = (): void => {
  console.log('\n🔨 Phase 2: TypeScript Build');
  console.log('─'.repeat(50));

  execSync('tsup', { stdio: 'inherit' });
};

// ============================================================================
// Phase 3: Path Alias Resolution
// ============================================================================

const resolvePathAliases = (): void => {
  console.log('\n🔗 Phase 3: Path Alias Resolution');
  console.log('─'.repeat(50));

  execSync('tsc-alias -p tsconfig.json', { stdio: 'inherit' });
};

// ============================================================================
// Main Build Orchestration
// ============================================================================

const main = async (): Promise<void> => {
  const startTime = Date.now();

  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║         🚀 Blawby Backend Build System        ║');
  console.log('╚════════════════════════════════════════════════╝');

  try {
    // Phase 1: Codegen — delegates to codegen.ts (avoids duplication)
    await spawnAsync('tsx scripts/codegen.ts');

    // Phase 2: Build TypeScript (bundled)
    buildTypeScript();

    // Phase 3: Resolve path aliases
    resolvePathAliases();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log(`║  ✅ Build completed in ${duration}s                    ║`);
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
  } catch (error) {
    console.error('\n❌ Build failed:', error);
    process.exit(1);
  }
};

void main();
