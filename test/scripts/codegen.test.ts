import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

/**
 * Regression check for the class of bug where adding a new src/modules/<name>/
 * directory without an http.ts breaks codegen's module-registry generation
 * (generateModuleRegistry unconditionally reads every discovered module's
 * http.ts). Runs the actual CLI exactly as CI does, not an imported function,
 * since scripts/codegen.ts has no entrypoint guard and writes real files.
 */
describe('pnpm run codegen', () => {
  it('succeeds against the current src/modules directory tree', async () => {
    await expect(execFileAsync('pnpm', ['run', 'codegen'])).resolves.not.toThrow();
  }, 30000);
});
