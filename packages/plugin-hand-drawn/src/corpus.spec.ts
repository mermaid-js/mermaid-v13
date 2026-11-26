/**
 * The hand-drawn extension over the e2e corpus (H2, #342), through `createMermaid().render()`:
 *
 * - option parity: each outline is sketched with v12's roughjs options for its role (written out
 *   below from v12 at fa796a943). `sketch` itself equals roughjs's `RoughGenerator` for the same
 *   options (H1, `sketch.spec.ts`), so this is parity with roughjs;
 * - the allow-list (R-SEC-2), determinism (R-ARCH-6, a fresh API object gives the same bytes) and
 *   no `Math.random` call, over the hand-drawn corpus and the sketched types' whole corpus with
 *   `handDrawn` on: every fixture folder whose `hand-drawn.txt` says `sketched` (a port adds
 *   that file, so this list never names a type);
 * - v12's XSS sources and Pele's payloads stay inert with it on.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Attrs, OutlineRole, OutlineSink, OutlineTag } from '@mermaid-js/core/svg';
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS, V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type ExtensionPlugin } from 'mermaid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withNodeBorder } from './border.ts';
import { handDrawn } from './index.ts';
import { sketch, type SketchOptions } from './sketch.ts';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));
/** A fixture folder's `hand-drawn.txt` verdict (its first line), when it has one. */
function marker(dir: string): string | undefined {
  const file = join(DIAGRAMS, dir, 'hand-drawn.txt');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n')[0]!.trim() : undefined;
}

/** The fixture folders v12 sketched: their `hand-drawn.txt` says `sketched`. */
const TYPES = readdirSync(DIAGRAMS)
  .filter((dir) => marker(dir) === 'sketched')
  .sort();

function mmd(dir: string): [string, string][] {
  return readdirSync(join(DIAGRAMS, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => [`${dir}/${f}`, readFileSync(join(DIAGRAMS, dir, f), 'utf8')]);
}

const corpus = TYPES.flatMap(mmd);
const HAND_DRAWN = /look["']?\s*:\s*["']?handDrawn/;
const handDrawnCorpus = readdirSync(DIAGRAMS)
  .flatMap(mmd)
  .filter(([, s]) => HAND_DRAWN.test(s));

/** v12's options by role (handDrawnShapeStyles.ts, clusters.js, edges.js), roughjs's defaults filled in. */
const V12: Readonly<Record<string, SketchOptions>> = {
  // userNodeOverrides
  node: { roughness: 0.7, fillStyle: 'hachure', fillWeight: 1.5, hachureGap: 1.5 },
  // cluster `rect`: userNodeOverrides with fillWeight 3
  group: { roughness: 0.7, fillStyle: 'hachure', fillWeight: 3, hachureGap: 1.5 },
  // roundedWithTitle: { roughness: 0.7, fillStyle: 'solid' }
  composite: { roughness: 0.7, fillStyle: 'solid', fillWeight: -1, hachureGap: -1 },
  // solidStateFill
  mark: {
    roughness: 0.7,
    fillStyle: 'hachure',
    fillWeight: 1.5,
    hachureGap: 1.5,
    hachureAngle: 120,
  },
  // edges.js: { roughness: 0.3 }
  edge: { roughness: 0.3, fillStyle: 'hachure', fillWeight: -1, hachureGap: -1 },
  // No v12 counterpart: an edge label's box, its border sketched and its fill solid (D630).
  label: { roughness: 0.7, fillStyle: 'solid', fillWeight: -1, hachureGap: -1 },
};

function v12Options(role: OutlineRole, attrs: Attrs): SketchOptions {
  if (role === 'part' && (attrs.class === 'outer' || attrs.class === 'inner'))
    return V12.composite!;
  if (role === 'part' || role === 'divider') return V12.node!;
  return V12[role]!;
}

interface Call {
  readonly role: OutlineRole;
  readonly tag: OutlineTag;
  readonly attrs: Attrs;
  /** The `d` and `stroke-width` of each path the drawer wrote; empty for the plain leaf. */
  readonly drawn: string[];
  /** The render's `handDrawnSeed`. */
  readonly seed: number;
}

/** The hand-drawn extension, recording what its drawer gets and writes. */
function recording(calls: Call[]): ExtensionPlugin {
  const { outline } = handDrawn;
  return {
    ...handDrawn,
    outline: {
      active: (ctx) => outline!.active(ctx),
      draw(role, tag, attrs, sink, ctx) {
        const seed = Number((ctx.config as { handDrawnSeed?: number }).handDrawnSeed);
        const drawn: string[] = [];
        const spy: OutlineSink = {
          ...sink,
          open: (t, a) => sink.open(t, a),
          close: () => sink.close(),
          path: () => sink.path(),
          leaf: (t, a) => {
            drawn.push(`${String(a?.d)} ${String(a?.['stroke-width'])}`);
            sink.leaf(t, a);
          },
        };
        const done = outline!.draw(role, tag, attrs, spy, ctx);
        // The oracle sketches what the drawer sketches: the leaf, with D693's mindmap outline.
        // This checks roughjs parity only; which nodes get that outline is pinned in mindmap.spec.ts.
        calls.push({
          role,
          tag,
          attrs: withNodeBorder(role, attrs, ctx),
          drawn: done ? drawn : [],
          seed,
        });
        return done;
      },
    },
  };
}

async function api(extension: ExtensionPlugin, config: Record<string, unknown> = {}) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config } as never);
  await m.registerExternalDiagrams([extension]);
  return m;
}

/** The render, or undefined for a source v13 does not draw (another type, a syntax error). */
async function render(m: Awaited<ReturnType<typeof api>>, source: string) {
  try {
    return await m.render('d', source);
  } catch (e) {
    if (e instanceof MermaidError && e.code !== 'INTERNAL') return undefined;
    throw e;
  }
}

describe('the hand-drawn corpus', () => {
  it('marks each folder `sketched` or `unsketched`, and runs every folder with a hand-drawn baseline', () => {
    const marked = readdirSync(DIAGRAMS).filter((dir) => marker(dir) !== undefined);
    for (const dir of marked) expect(['sketched', 'unsketched'], dir).toContain(marker(dir));
    const baselines = readdirSync(DIAGRAMS).filter((dir) =>
      existsSync(join(DIAGRAMS, dir, 'baseline', 'handdrawn'))
    );
    expect(baselines.length).toBeGreaterThan(0);
    expect(baselines.filter((dir) => !TYPES.includes(dir))).toEqual([]);
    expect(TYPES).toContain('flowchart');
  });

  it('has the files #296 counts in the four types, besides the four-family baselines (#343)', () => {
    const baseline = (id: string) => id.includes('/baseline/handdrawn/');
    const count = (dir: string, h3 = false) =>
      handDrawnCorpus.filter(([id]) => id.startsWith(`${dir}/`) && baseline(id) === h3).length;
    expect([count('class-diagram'), count('er-diagram'), count('flowchart')]).toEqual([70, 43, 50]);
    expect(count('state-diagram-v2')).toBe(5);
    const dirs = ['class-diagram', 'er-diagram', 'flowchart', 'state-diagram-v2'];
    expect(dirs.map((dir) => count(dir, true))).toEqual([4, 4, 4, 4]);
    // Mindmap has no hand-drawn corpus file; H4 (#344) adds one per shape and edges, × 4 families.
    expect([count('mindmap'), count('mindmap', true)]).toEqual([0, 32]);
    // Kanban: one board per family (D379, #459).
    expect([count('kanban'), count('kanban', true)]).toEqual([0, 4]);
  });

  it("sketches every outline with v12's roughjs options for its role", async () => {
    const calls: Call[] = [];
    const m = await api(recording(calls));
    let rendered = 0;
    for (const [, source] of handDrawnCorpus) if (await render(m, source)) rendered++;
    expect(rendered).toBeGreaterThan(150);
    const roles = new Set<string>();
    for (const { role, tag, attrs, drawn, seed } of calls) {
      const edge = role === 'edge';
      const input = edge
        ? { ...attrs, fill: undefined, stroke: attrs.stroke ?? 'currentColor' }
        : attrs;
      const sets = sketch(tag, input, v12Options(role, attrs), seed) ?? [];
      // A hachure's stroke width is the fill weight; an edge keeps its own.
      const expected = sets
        .filter((p) => !edge || p.set === 'path')
        .map((p) => `${String(p.attrs.d)} ${String((edge ? attrs : p.attrs)['stroke-width'])}`);
      expect(drawn, `${role} ${tag}`).toEqual(expected);
      if (drawn.length > 0) roles.add(role);
    }
    expect([...roles].sort()).toEqual([
      'divider',
      'edge',
      'group',
      'label',
      'mark',
      'node',
      'part',
    ]);
  }, 120_000);
});

describe('allow-list and determinism with hand-drawn on (R-SEC-2, R-ARCH-6)', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random was called');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('passes the allow-list and draws the same bytes twice, never calling Math.random', async () => {
    const cases: [string, string, Record<string, unknown>][] = [
      ...handDrawnCorpus.map(([id, s]): [string, string, Record<string, unknown>] => [id, s, {}]),
      ...corpus.map(([id, s]): [string, string, Record<string, unknown>] => [
        id,
        s,
        { handDrawn: true, handDrawnSeed: 7 },
      ]),
    ];
    let rendered = 0;
    for (const [id, source, config] of cases) {
      const first = await render(await api(handDrawn, config), source);
      if (!first) continue;
      assertInert(first.svg);
      const second = await render(await api(handDrawn, config), source);
      expect(second?.svg, id).toBe(first.svg);
      rendered++;
    }
    expect(rendered).toBeGreaterThan(1250);
  }, 300_000);

  it("keeps v12's XSS sources and the payloads inert", async () => {
    const m = await api(handDrawn, { handDrawn: true });
    const sources = [
      ...V12_XSS_CASES.flatMap((c) => (c.source === undefined ? [] : [c.source])),
      ...PAYLOADS.flatMap((p) => {
        const q = JSON.stringify(p);
        return [
          `flowchart LR\n  A[${q}] --> B\n  style A fill:${p},stroke:${p}\n`,
          `flowchart LR\n  A --> B\n  linkStyle 0 stroke:${p},stroke-dasharray:${p}\n`,
          `classDiagram\n  class A["${p.replace(/"/g, "'")}"]\n  style A fill:${p}\n`,
          `stateDiagram-v2\n  a : ${p.replace(/\n/g, ' ')}\n  style a fill:${p}\n`,
        ];
      }),
    ];
    let rendered = 0;
    for (const source of sources) {
      const r = await render(m, source);
      if (!r) continue;
      rendered++;
      expect(() => assertInert(r.svg), source).not.toThrow();
    }
    expect(rendered).toBeGreaterThan(sources.length / 2);
  }, 120_000);
});
