import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { versionSource } from './version-file.ts';

const root = join(import.meta.dirname, '..', '..', '..');

describe('release:sync-version', () => {
  it('writes version.ts exactly as it is checked in, so a sync after `changeset version` is the only diff', () => {
    const { version } = JSON.parse(
      readFileSync(join(root, 'packages/mermaid/package.json'), 'utf8')
    ) as { version: string };
    expect(readFileSync(join(root, 'packages/mermaid/src/version.ts'), 'utf8')).toBe(
      versionSource(version)
    );
  });
});
