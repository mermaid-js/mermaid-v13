import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readManifest } from '@mermaid-js/core';

describe('first-party plugin manifests (R-PLUG-3)', () => {
  it('every package with a mermaid manifest passes readManifest', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const read: string[] = [];
    for (const dir of readdirSync(root)) {
      let pkg: { mermaid?: unknown };
      try {
        pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as typeof pkg;
      } catch {
        continue;
      }
      if (pkg.mermaid === undefined) continue;
      expect(() => readManifest(pkg.mermaid), dir).not.toThrow();
      read.push(dir);
    }
    expect(read).toContain('diagram-flowchart');
  });
});
