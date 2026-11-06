import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DiagramThemeTable } from '../../../packages/core/src/theme/diagram.ts';
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';

/**
 * `usedBy` in the theme vocabulary names the diagram types that read each variable (#207).
 * A diagram reads a variable by passing its name as a string literal to a call, either a `Theme`
 * method (`theme.color('lineColor')`) or a local helper over one (`n('extensionMarkerGap')`), or
 * through a table of names (`glyphBand: 'actorGlyphBand'`), including a theme table's rules
 * (`packetLabelColor: 'primaryTextColor'`; a var's `nested:` key is v12's name, not a read). This
 * spec scans each diagram package's sources for both and checks the lists both ways, and that a
 * package reads every variable its own `DiagramPlugin.theme` table declares (D331).
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

/** Every name `type`'s sources pass as a string literal to a call or a table key. */
function namesOf(type: string): Set<string> {
  const text = sources(join(PACKAGES, `diagram-${type}`, 'src'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const names = [...text.matchAll(/(?:\b\w+\(|\b(?!nested\b)\w+:)\s*'(\w+)'/g)].map((m) => m[1]!);
  return new Set([...names, ...(DYNAMIC_READS[type] ?? [])]);
}

function readsOf(type: string): Set<string> {
  return new Set([...namesOf(type)].filter((n) => n in THEME_VARIABLES));
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
      'packet',
      'pie',
      'quadrant',
      'sequence',
      'state',
      'timeline',
    ]);
    for (const type of TYPES) expect(READS.get(type)!.size).toBeGreaterThan(0);
  });

  it.each(TYPES)('%s reads every variable its own theme table declares', async (type) => {
    const mod = (await import(join(PACKAGES, `diagram-${type}`, 'src/index.ts'))) as Record<
      string,
      unknown
    >;
    const names = namesOf(type);
    for (const v of Object.values(mod)) {
      if (typeof v !== 'object' || v === null) continue;
      const p = v as { render?: unknown; theme?: DiagramThemeTable };
      if (typeof p.render !== 'function' || !p.theme) continue;
      expect(Object.keys(p.theme.vars).filter((n) => !names.has(n))).toEqual([]);
    }
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
