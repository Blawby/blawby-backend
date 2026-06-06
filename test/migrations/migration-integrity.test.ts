import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(process.cwd(), 'src/shared/database/migrations');
const metaDir = join(migrationsDir, 'meta');
const journalPath = join(metaDir, '_journal.json');
const migrationFilePattern = /^(\d{4})_(.+)\.sql$/;
const snapshotFilePattern = /^(\d{4})_snapshot\.json$/;
const conflictMarkerPattern = /^(<<<<<<<|=======|>>>>>>>) /m;
const currentTailStartIdx = 65;

type Journal = {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

const readJournal = (): Journal => JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;

describe('migration integrity', () => {
  it('has SQL migrations and snapshots for every journal entry', () => {
    const journal = readJournal();
    const migrationFiles = readdirSync(migrationsDir)
      .filter((file) => migrationFilePattern.test(file))
      .reduce((files, file) => files.add(file), new Set<string>());
    const snapshotFiles = new Set(readdirSync(metaDir).filter((file) => snapshotFilePattern.test(file)));

    for (const entry of journal.entries) {
      const prefix = String(entry.idx).padStart(4, '0');

      expect(entry.tag.startsWith(`${prefix}_`)).toBe(true);
      expect(migrationFiles.has(`${entry.tag}.sql`)).toBe(true);
      expect(snapshotFiles.has(`${prefix}_snapshot.json`)).toBe(true);
    }
  });

  it('keeps the current migration tail free of orphaned SQL files', () => {
    const journal = readJournal();
    const currentTags = journal.entries
      .filter((entry) => entry.idx >= currentTailStartIdx)
      .map((entry) => entry.tag);
    const currentSqlTags = readdirSync(migrationsDir)
      .map((file) => file.match(migrationFilePattern))
      .filter((match): match is RegExpMatchArray => match !== null)
      .filter((match) => Number(match[1]) >= currentTailStartIdx)
      .map((match) => `${match[1]}_${match[2]}`)
      .sort();

    expect(currentSqlTags).toEqual(currentTags);
  });

  it('does not have duplicate journal numbers or tags', () => {
    const journal = readJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    const indexes = journal.entries.map((entry) => entry.idx);
    const prefixes = tags.map((tag) => tag.slice(0, 4));

    expect(new Set(tags).size).toBe(tags.length);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('does not contain unresolved conflict markers in migration files', () => {
    const filesToCheck = [
      journalPath,
      ...readdirSync(migrationsDir)
        .filter((file) => migrationFilePattern.test(file))
        .map((file) => join(migrationsDir, file)),
      ...readdirSync(metaDir)
        .filter((file) => snapshotFilePattern.test(file))
        .map((file) => join(metaDir, file)),
    ];

    for (const filePath of filesToCheck) {
      expect(readFileSync(filePath, 'utf8'), filePath).not.toMatch(conflictMarkerPattern);
    }
  });
});
