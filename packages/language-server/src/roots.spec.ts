/**
 * `pluginRoots` in process (D579): which package root a document's scan reaches. The scripted
 * client covers the same rules end to end in `server-discovery.spec.ts`.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluginRoots } from './roots.ts';
import { facetPackage, tree, under } from './testing/workspace.ts';

/** A workspace folder `w` with the nested package `w/pkg`, and the package `outside`. */
function fixture(): string {
  return tree({
    'w/package.json': JSON.stringify({ name: 'w' }),
    'w/pkg/package.json': JSON.stringify({ name: 'pkg', dependencies: { 'mermaid-fake': '1' } }),
    ...under('w/pkg/node_modules/mermaid-fake', facetPackage('mermaid-fake', 'fake')),
    'w/pkg/a.mmd': 'fake\n',
    'w/loose/b.mmd': 'fake\n',
    'outside/package.json': JSON.stringify({
      name: 'outside',
      dependencies: { 'mermaid-out': '1' },
    }),
    ...under('outside/node_modules/mermaid-out', facetPackage('mermaid-out', 'out')),
    'outside/c.mmd': 'out\n',
  });
}

const ids = (rows: readonly { id: string }[]): string[] => rows.map((r) => r.id);

describe('pluginRoots', () => {
  it('scans the nested package root of a document inside the folder, once', async () => {
    const dir = fixture();
    const roots = pluginRoots([join(dir, 'w')], {});
    expect(await roots.folders()).toEqual([]);
    expect(ids(await roots.document(join(dir, 'w/pkg/a.mmd')))).toEqual(['fake']);
    expect(await roots.document(join(dir, 'w/pkg/a.mmd'))).toEqual([]);
  });

  it('finds nothing for a document outside every folder, or in a missing directory', async () => {
    const dir = fixture();
    const roots = pluginRoots([join(dir, 'w')], {});
    await roots.folders();
    expect(await roots.document(join(dir, 'outside/c.mmd'))).toEqual([]);
    expect(await roots.document(join(dir, 'w/gone/x.mmd'))).toEqual([]);
  });

  it('does not scan a root above the folder that holds the document', async () => {
    const dir = fixture();
    // `w/loose` has no package.json, so its root is `w`, above the named folder `w/loose`.
    const roots = pluginRoots([join(dir, 'w/loose')], {});
    await roots.folders();
    expect(await roots.document(join(dir, 'w/loose/b.mmd'))).toEqual([]);
  });
});
