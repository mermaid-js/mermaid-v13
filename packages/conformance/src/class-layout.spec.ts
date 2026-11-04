import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { countCrossings, validateLayout } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { layoutClass, parseClass, type ClassLayout } from '@mermaid-js/diagram-class';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import type { CorpusItem } from './types.ts';

// DDLT-style checks on parser-produced class graphs (spec #126 T3, DESIGN §6.2): the e2e class
// corpus and the harvested v12 spec strings, parsed by the v13 parser and measured with the
// table measurer, so the fixtures are always fresh. Each graph is laid out by `layoutClass`
// with core's `layered` (D106), with namespaces both nested and flat. `validateLayout` covers
// NaN, overlaps, containment in namespaces and labels clear of boxes and of each other; the
// box checks below cover the rows and dividers the renderer draws.

async function* corpus(): AsyncGenerator<CorpusItem> {
  yield* corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/class-diagram'), 'class');
  const file = join(REPO_ROOT, 'packages/conformance/corpus/class-v12-specs.json');
  yield* JSON.parse(readFileSync(file, 'utf8')) as CorpusItem[];
}

/** Problems with the boxes' own geometry: rows inside their compartments, finite, in order. */
function boxProblems(layout: ClassLayout): string[] {
  const out: string[] = [];
  for (const box of layout.class!.boxes) {
    const where = `class '${box.id}'`;
    let y = 0;
    const rows = [box.annotation, box.name].filter((r) => r !== undefined);
    for (const r of rows) {
      if (r.y < y - 1e-6) out.push(`${where}: header rows out of order`);
      y = r.y + r.label.height;
    }
    for (const [i, c] of box.compartments.entries()) {
      if (Math.abs(c.top - box.dividers[i]!) > 1e-6)
        out.push(`${where}: divider ${i} off its compartment`);
      if (c.top < y - 1e-6) out.push(`${where}: ${c.kind} overlaps what is above it`);
      for (const r of c.rows) {
        if (r.y < y - 1e-6 || r.y + r.label.height > c.top + c.height + 1e-6) {
          out.push(`${where}: a ${c.kind} row lies outside its compartment`);
        }
        if (r.x + r.label.width > box.width + 1e-6)
          out.push(`${where}: a row is wider than the box`);
        y = r.y + r.label.height;
      }
      y = c.top + c.height;
    }
    if (y > box.height + 1e-6) out.push(`${where}: content taller than the box`);
    if (![box.width, box.height, y].every(Number.isFinite)) out.push(`${where}: non-finite size`);
  }
  return out;
}

/** v12's end markers (markers.js): length along the line; all are at most 12 px across. */
const MARKER_LENGTH: Readonly<Record<string, number>> = {
  aggregation: 18,
  composition: 18,
  extension: 18,
  dependency: 9,
  lollipop: 13,
};
const MARKER_HALF = 6;

/** Multiplicities clear of the marker at their end: text box against the marker's box. */
function markerProblems(layout: ClassLayout): string[] {
  const out: string[] = [];
  for (const e of layout.class!.edges) {
    const placed = layout.edges.get(e.layoutId)!;
    const pts = placed.points;
    for (const [label, at, marker, a, b] of [
      [e.startLabel, placed.startLabel, e.startMarker, pts[0]!, pts[1]!],
      [e.endLabel, placed.endLabel, e.endMarker, pts[pts.length - 1]!, pts[pts.length - 2]!],
    ] as const) {
      const m = MARKER_LENGTH[marker] ?? 0;
      if (!label || !at || m === 0) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tip = { x: a.x + ((b.x - a.x) / len) * m, y: a.y + ((b.y - a.y) / len) * m };
      const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
      const mx0 = vertical ? a.x - MARKER_HALF : Math.min(a.x, tip.x);
      const mx1 = vertical ? a.x + MARKER_HALF : Math.max(a.x, tip.x);
      const my0 = vertical ? Math.min(a.y, tip.y) : a.y - MARKER_HALF;
      const my1 = vertical ? Math.max(a.y, tip.y) : a.y + MARKER_HALF;
      const lx0 = at.x - label.width / 2;
      const ly0 = at.y - label.height / 2;
      if (
        lx0 < mx1 - 0.5 &&
        mx0 < lx0 + label.width - 0.5 &&
        ly0 < my1 - 0.5 &&
        my0 < ly0 + label.height - 0.5
      ) {
        out.push(`a multiplicity of '${e.layoutId}' overlaps its ${marker} marker`);
      }
    }
  }
  return out;
}

describe('layered over parser-produced class graphs', () => {
  it('lays out every corpus graph validly, nested and flat, and records crossings', async () => {
    const theme = createTheme(await loadTheme('default'), {});
    const crossings: Record<string, number> = {};
    let laid = 0;
    const seen = { endLabels: 0, labels: 0, groups: 0, notes: 0, lollipops: 0 };
    for await (const item of corpus()) {
      const pre = preprocess(item.source);
      const parse = parseClass(item.source, { preprocessed: pre });
      if (parse.diagnostics.some((d) => d.severity === 'error')) continue;
      const directives = pre.directives.flatMap((d) =>
        d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
      );
      const config = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, directives);
      for (const hierarchical of [true, false]) {
        const cfg = { ...config, class: { ...config.class, hierarchicalNamespaces: hierarchical } };
        const layout = layoutClass(parse.model, { config: cfg, measurer: tableMeasurer, theme });
        const id = `${item.id}${hierarchical ? '' : ' (flat)'}`;
        expect(validateLayout(layout.class!.graph, layout), id).toEqual([]);
        expect(boxProblems(layout), id).toEqual([]);
        expect(markerProblems(layout), id).toEqual([]);
        if (hierarchical) crossings[item.id] = countCrossings(layout);
        if (!hierarchical) continue;
        const p = layout.class!;
        seen.endLabels += p.graph.edges.filter((e) => e.startLabel ?? e.endLabel).length;
        seen.labels += p.graph.edges.filter((e) => e.label).length;
        seen.groups += p.groups.length;
        seen.notes += p.edges.filter((e) => e.kind === 'note').length;
        seen.lollipops += p.edges.filter((e) => e.kind === 'lollipop').length;
      }
      laid++;
    }
    expect(laid).toBeGreaterThan(590);
    // The corpus exercises every part of the graph builder.
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0);
    expect(crossings).toMatchSnapshot();
  });

  it('lays out generated graphs with fans of multiplicities, lollipops, notes and namespaces', async () => {
    const theme = createTheme(await loadTheme('default'), {});
    // Deterministic generator (mulberry32).
    let seed = 155;
    const rnd = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const arrows = ['<|--', '*--', 'o--', '-->', '..>', '..|>', '--', '..', '--*', '--o', '<--'];
    const mult = ['', '"1"', '"0..*"', '"many"', '"1..n"'];
    let checked = 0;
    for (let k = 0; k < 120; k++) {
      const n = 2 + Math.floor(rnd() * 7);
      const lines = ['classDiagram', `direction ${pick(['TB', 'BT', 'LR', 'RL'])}`];
      const names = Array.from({ length: n }, (_, i) => `C${i}`);
      if (rnd() < 0.5) {
        lines.push(
          `namespace N${k}.Inner {`,
          ...names.slice(0, 2).map((c) => `class ${c} {\n+int x\n+run() void\n}`),
          '}'
        );
      }
      for (let e = 0; e < n + Math.floor(rnd() * n); e++) {
        const a = pick(names);
        const b = pick(names.filter((x) => x !== a));
        lines.push(
          `${a} ${pick(mult)} ${pick(arrows)} ${pick(mult)} ${b}${rnd() < 0.4 ? ' : uses' : ''}`
        );
      }
      if (rnd() < 0.4) lines.push(`I${k} ()-- ${pick(names)}`);
      if (rnd() < 0.4) lines.push(`note for ${pick(names)} "a note"`);
      const src = lines.join('\n');
      const parse = parseClass(src);
      expect(
        parse.diagnostics.filter((d) => d.severity === 'error'),
        src
      ).toEqual([]);
      const config = resolveConfig(CORE_DEFAULTS, {});
      const layout = layoutClass(parse.model, { config, measurer: tableMeasurer, theme });
      expect(validateLayout(layout.class!.graph, layout), src).toEqual([]);
      expect(boxProblems(layout), src).toEqual([]);
      expect(markerProblems(layout), src).toEqual([]);
      checked++;
    }
    expect(checked).toBe(120);
  });
});
