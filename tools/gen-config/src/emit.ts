/**
 * What a generator CLI does with its files: writes the stale ones, or with `--check` lists
 * them and fails instead, naming the `pnpm regen` step that rewrites them (#694).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface EmitOptions {
  /** List the stale files and fail instead of writing them. */
  readonly check: boolean;
  /** The command that writes these files, for the `--check` message (`pnpm gen:theme`). */
  readonly step: string;
  /** Where the lines go: stdout for a write, stderr for a stale list. */
  readonly log?: (text: string) => void;
}

/** `files` is absolute path → content. False when `check` found a stale file. */
export function emit(files: ReadonlyMap<string, string>, options: EmitOptions): boolean {
  const stale = [...files]
    .filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content)
    .map(([path]) => path);
  if (options.check) {
    if (stale.length === 0) return true;
    const log = options.log ?? ((text) => process.stderr.write(text));
    log(`Stale generated files (run \`${options.step}\`):\n  ${stale.join('\n  ')}\n`);
    return false;
  }
  const log = options.log ?? ((text) => process.stdout.write(text));
  for (const path of stale) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, files.get(path)!);
    log(`wrote ${path}\n`);
  }
  return true;
}
