/**
 * The workspace's vitest sequencer (`sequence.sequencer` in vitest.config.ts, #984). Only
 * `shard()` differs from vitest's own: a `--shard=i/n` run takes bin `i` of `balance()` over the
 * files' durations in `test-durations.json`, instead of an equal number of files. A file the
 * table does not know is planned at the table's median. The order within a shard is vitest's.
 *
 * Refresh the table from CI's reports with `tools/ci/durations-cli.ts`.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { balance, median } from './shard.ts';

const TABLE = join(import.meta.dirname, 'test-durations.json');

/** Milliseconds by test file, relative to the repository root. Empty when it cannot be read. */
export function readDurations(path = TABLE): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    );
  } catch {
    return {};
  }
}

export class DurationSequencer extends BaseSequencer {
  override shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    // vitest calls shard() only when --shard is set; without it every file runs.
    if (!shard) return Promise.resolve(files);
    const table = readDurations();
    const fallback = median(Object.values(table));
    const items = files.map((spec) => {
      const path = relative(root, spec.moduleId).split('\\').join('/');
      // gantt's specs run in two projects (vitest.config.ts): the project keeps the key unique.
      return { spec, key: `${spec.project.name}:${path}`, ms: table[path] ?? fallback };
    });
    const bin = balance(items, shard.count)[shard.index - 1] ?? [];
    return Promise.resolve(bin.map(({ spec }) => spec));
  }
}
