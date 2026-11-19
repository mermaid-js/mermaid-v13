/**
 * `pnpm exec tsx tools/ci/durations-cli.ts <report.json>...`: writes `test-durations.json`, the
 * per-file durations the unit shards are balanced by (`duration-sequencer.ts`, #984), from
 * vitest JSON reports (`--reporter=json`). Each CI shard uploads one as the artifact
 * `unit-durations-<n>`: download them all from one run of every test and pass them here.
 *
 * A report's paths are absolute on the machine that ran it; each becomes relative to this
 * repository by dropping leading folders until the rest names a file here. A file in two
 * reports (gantt's two time zones) keeps its longest time. Files the reports leave out keep
 * their old time while they still exist, so a partial set of reports refines the table.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDurations } from './duration-sequencer.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const TABLE = join(import.meta.dirname, 'test-durations.json');

interface Report {
  readonly testResults: readonly { name: string; startTime: number; endTime: number }[];
}

/** The path relative to the repository root, or undefined when no suffix of it is a file here. */
function repoPath(absolute: string): string | undefined {
  const parts = absolute.split(/[\\/]/).filter((part) => part !== '');
  for (let i = 0; i < parts.length; i++) {
    const rest = parts.slice(i).join('/');
    if (existsSync(join(ROOT, rest))) return rest;
  }
  return undefined;
}

function main(reports: readonly string[]): void {
  if (reports.length === 0) throw new Error('Pass one or more vitest JSON reports.');
  const measured = new Map<string, number>();
  let unknown = 0;
  for (const file of reports) {
    const report = JSON.parse(readFileSync(file, 'utf8')) as Report;
    for (const { name, startTime, endTime } of report.testResults) {
      const path = repoPath(name);
      if (path === undefined) {
        unknown++;
        continue;
      }
      measured.set(path, Math.max(measured.get(path) ?? 0, Math.round(endTime - startTime)));
    }
  }
  const table: Record<string, number> = {};
  const old = readDurations(TABLE);
  for (const path of [...new Set([...Object.keys(old), ...measured.keys()])].sort()) {
    const ms = measured.get(path) ?? (existsSync(join(ROOT, path)) ? old[path] : undefined);
    if (ms !== undefined) table[path] = ms;
  }
  writeFileSync(TABLE, `${JSON.stringify(table, null, 2)}\n`);
  const kept = Object.keys(table).length - measured.size;
  process.stdout.write(
    `test-durations.json: ${measured.size} files measured, ${kept} kept from before` +
      (unknown > 0 ? `, ${unknown} report entries not found in this repository` : '') +
      '\n'
  );
}

main(process.argv.slice(2));
