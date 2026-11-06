import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';

/**
 * `usedBy` in the theme vocabulary names the diagram types that read each variable (#207).
 * A diagram reads a variable by passing its name as a string literal to a call, either a `Theme`
 * method (`theme.color('lineColor')`) or a local helper over one (`n('extensionMarkerGap')`), or
 * through a table of names (`glyphBand: 'actorGlyphBand'`). This spec scans each diagram
 * package's sources for both and checks the lists both ways.
 */
const PACKAGES = fileURLToPath(new URL('../../../packages', import.meta.url));

/** Names a diagram builds at run time, which a scan for literals can't see. */
const DYNAMIC_READS: Readonly<Record<string, readonly string[]>> = {
  // `padsOf` in render/prepare.ts reads `${shape}PaddingX` / `${shape}PaddingY`.
  flowchart: ['node', 'stadium', 'hexagon', 'subroutine', 'cylinder', 'lean', 'odd'].flatMap(
    (shape) => [`${shape}PaddingX`, `${shape}PaddingY`]
  ),
  // `paints` in render/paint.ts reads the slot colours `pie${slot + 1}`.
  pie: Array.from({ length: 12 }, (_, i) => `pie${i + 1}`),
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'generated' ? [] : sources(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function readsOf(type: string): Set<string> {
  const text = sources(join(PACKAGES, `diagram-${type}`, 'src'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const names = [...text.matchAll(/(?:\b\w+\(|\w:)\s*'(\w+)'/g)].map((m) => m[1]!);
  return new Set([...names, ...(DYNAMIC_READS[type] ?? [])].filter((n) => n in THEME_VARIABLES));
}

const TYPES = readdirSync(PACKAGES)
  .filter((d) => d.startsWith('diagram-'))
  .map((d) => d.slice('diagram-'.length))
  .sort();
const READS = new Map(TYPES.map((type) => [type, readsOf(type)]));

describe('theme vocabulary usedBy (#207)', () => {
  it('scans every diagram package', () => {
    expect(TYPES).toEqual([
      'class',
      'er',
      'flowchart',
      'journey',
      'pie',
      'quadrant',
      'radar',
      'sequence',
      'state',
      'timeline',
    ]);
    for (const type of TYPES) expect(READS.get(type)!.size, type).toBeGreaterThan(0);
  });

  it.each(TYPES)('lists %s for every variable it reads, and for no other', (type) => {
    const reads = READS.get(type)!;
    const listed = Object.keys(THEME_VARIABLES).filter((name) =>
      THEME_VARIABLES[name]!.usedBy.includes(type)
    );
    expect(listed.filter((name) => !reads.has(name))).toEqual([]);
    expect([...reads].filter((name) => !listed.includes(name)).sort()).toEqual([]);
  });
});
