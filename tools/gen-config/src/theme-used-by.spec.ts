import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { slotVar, VENN_SLOTS } from '../../../packages/diagram-venn/src/theme/slots.ts';
import { PACKAGES, packageReadErrors, themePackages } from './theme-packages.ts';

/**
 * `usedBy` in the theme vocabulary names the diagram types that read each variable (#207).
 * A diagram reads a variable by passing its name as a string literal to a call, either a `Theme`
 * method (`theme.color('lineColor')`) or a local helper over one (`n('extensionMarkerGap')`), or
 * through a table of names (`glyphBand: 'actorGlyphBand'`), or in a table rule as `inline(name)`
 * (D332); a var's `nested:` key is v12's name, not a read. This spec scans each diagram
 * package's sources for these and checks the lists both ways, for core's vocabulary and for every
 * package's own (`src/theme/vocabulary.ts`, spec #414 T0b), whose rows only their own type may
 * read: a row another type reads belongs in core.
 */
const OWNERS = (await themePackages(PACKAGES, { tables: 'vocabulary' })).filter(
  (p) => p.vocabulary !== undefined
);
/** Every name a diagram may read: core's and every package's. */
const KNOWN = new Set([
  ...Object.keys(THEME_VARIABLES),
  ...OWNERS.flatMap((p) => Object.keys(p.vocabulary!)),
]);

/** Names a diagram builds at run time, which a scan for literals can't see. */
const DYNAMIC_READS: Readonly<Record<string, readonly string[]>> = {
  // `padsOf` in render/prepare.ts reads `${shape}PaddingX` / `${shape}PaddingY`.
  flowchart: ['node', 'stadium', 'hexagon', 'subroutine', 'cylinder', 'lean', 'odd'].flatMap(
    (shape) => [`${shape}PaddingX`, `${shape}PaddingY`]
  ),
  // `paints` in render/paint.ts reads the slot colours `pie${slot + 1}`.
  pie: Array.from({ length: 12 }, (_, i) => `pie${i + 1}`),
  // `paints` in render/paint.ts reads the column colours `columnVar(n)`, `kanbanColumn${n}`.
  kanban: Array.from({ length: 12 }, (_, n) => `kanbanColumn${n}`),
  // `paints` in render/paint.ts reads the section strokes `cScalePeer${slot - 1}`.
  treemap: Array.from({ length: 12 }, (_, n) => `cScalePeer${n}`),
  // `vennPaints` in render/paint.ts reads the slot colours `slotVar(slot)`, `venn${slot + 1}`.
  venn: Array.from({ length: VENN_SLOTS }, (_, i) => slotVar(i)),
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'generated' ? [] : sources(path);
    // A vocabulary declares names; it reads none.
    if (path.endsWith(join('src', 'theme', 'vocabulary.ts'))) return [];
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function readsOf(type: string): Set<string> {
  const text = sources(join(PACKAGES, `diagram-${type}`, 'src'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const names = [
    ...[...text.matchAll(/(?:\b\w+\(|\b(?!nested\b)\w+:)\s*'(\w+)'/g)].map((m) => m[1]!),
    // A table rule's `inline(name)` or `inline(name, fallback)`: a shared input read as the
    // theme wrote it (D332).
    ...[...text.matchAll(/\binline\((\w+)[,)]/g)].map((m) => m[1]!),
  ];
  return new Set([...names, ...(DYNAMIC_READS[type] ?? [])].filter((n) => KNOWN.has(n)));
}

const TYPES = readdirSync(PACKAGES)
  .filter((d) => d.startsWith('diagram-'))
  .map((d) => d.slice('diagram-'.length))
  .sort();
/**
 * Packages whose port has not reached layout yet, so they read no theme variable. Each entry
 * must read none (so it is removed as soon as it reads one).
 */
const NOT_DRAWN_YET = new Set<string>([]);
const READS = new Map(TYPES.map((type) => [type, readsOf(type)]));

describe('theme vocabulary usedBy (#207)', () => {
  it('scans every diagram package', () => {
    expect(TYPES).toEqual([
      'block',
      'class',
      'cynefin',
      'er',
      'flowchart',
      'gantt',
      'gitgraph',
      'info',
      'journey',
      'kanban',
      'mindmap',
      'packet',
      'pie',
      'quadrant',
      'radar',
      'sankey',
      'sequence',
      'state',
      'timeline',
      'treemap',
      'venn',
      'wardley',
      'xychart',
    ]);
    for (const type of TYPES) {
      if (NOT_DRAWN_YET.has(type)) expect(READS.get(type)!.size, type).toBe(0);
      else expect(READS.get(type)!.size, type).toBeGreaterThan(0);
    }
  });

  it.each(TYPES)('lists %s for every variable it reads, and for no other', (type) => {
    const reads = new Set([...READS.get(type)!].filter((n) => n in THEME_VARIABLES));
    const listed = Object.keys(THEME_VARIABLES).filter((name) =>
      THEME_VARIABLES[name]!.usedBy.includes(type)
    );
    expect(listed.filter((name) => !reads.has(name))).toEqual([]);
    expect([...reads].filter((name) => !listed.includes(name)).sort()).toEqual([]);
  });
});

describe('package theme vocabularies usedBy (spec #414 T0b)', () => {
  it('reads each package row only from its own package', () => {
    expect(packageReadErrors(OWNERS, READS)).toEqual([]);
  });

  it('fails when another package reads a package row, or usedBy is wrong', () => {
    const demo = {
      type: 'demo',
      vocabulary: {
        demoFill: { alias: 'dmf', kind: 'color', usedBy: ['demo'] },
        demoText: { alias: 'dmt', kind: 'color', usedBy: ['demo'] },
        demoGap: { alias: 'dmx', kind: 'length', usedBy: [] },
      },
    } as const;
    const reads = new Map([
      ['demo', new Set(['demoFill', 'demoGap'])],
      ['other', new Set(['demoFill', 'mainBkg'])],
    ]);
    expect(packageReadErrors([demo], reads)).toEqual([
      'demo: `demoFill` is read by other too; a shared row belongs in core',
      'demo: `demoText` lists usedBy [demo], its sources say []',
      'demo: `demoGap` lists usedBy [], its sources say [demo]',
    ]);
  });
});
