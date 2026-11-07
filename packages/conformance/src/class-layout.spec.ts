import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { countCrossings, validateLayout } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { THEME_NAMES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from './diagram-themes.ts';
import { layoutClass, parseClass, type ClassLayout } from '@mermaid-js/diagram-class';
import {
  MARKER_ACROSS,
  MARKER_ROOM,
  markerReach,
  markers,
  type Markers,
} from '@mermaid-js/diagram-class/testing';
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

/** Every drawn box (class, note, interface) is the size its graph node and placed node have. */
function sizeProblems(layout: ClassLayout): string[] {
  const out: string[] = [];
  const nodes = new Map(layout.class!.graph.nodes.map((n) => [n.id, n]));
  const p = layout.class!;
  for (const v of [...p.boxes, ...p.notes, ...p.interfaces]) {
    for (const [what, n] of [
      ['graph node', nodes.get(v.layoutId)],
      ['placed node', layout.nodes.get(v.layoutId)],
    ] as const) {
      if (!n) out.push(`${v.kind} '${v.id}' has no ${what}`);
      else if (Math.abs(n.width - v.width) > 1e-6 || Math.abs(n.height - v.height) > 1e-6) {
        out.push(
          `${v.kind} '${v.id}' is ${v.width} x ${v.height}, its ${what} ${n.width} x ${n.height}`
        );
      }
    }
  }
  if (nodes.size !== p.boxes.length + p.notes.length + p.interfaces.length) {
    out.push('the graph has nodes no view draws');
  }
  return out;
}

/** A box: left, top, right, bottom. */
type Box = readonly [number, number, number, number];

/**
 * The boxes the renderer draws each marker in, for one theme's marker geometry: from the node
 * outline out along the line's first leg as `routePath` takes it (the leg's own direction on
 * straight routes, else its axis), `MARKER_ACROSS` wide, outline included.
 */
function markerBoxes(layout: ClassLayout, m: Markers): { what: string; box: Box }[] {
  const straight = layout.class!.graph.routing === 'straight';
  const out: { what: string; box: Box }[] = [];
  for (const e of layout.class!.edges) {
    const pts = layout.edges.get(e.layoutId)?.points ?? [];
    if (pts.length < 2) continue;
    for (const [type, a, b] of [
      [e.startMarker, pts[0]!, pts[1]!],
      [e.endMarker, pts[pts.length - 1]!, pts[pts.length - 2]!],
    ] as const) {
      const reach = markerReach(type, m);
      if (reach === 0) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (straight) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
      } else if ((a === pts[0] ? b : a).axis === 'h') {
        dx = Math.sign(dx) || 1;
        dy = 0;
      } else {
        dx = 0;
        dy = Math.sign(dy) || 1;
      }
      const h = MARKER_ACROSS / 2;
      const xs = [a.x - dy * h, a.x + dy * h, a.x + dx * reach - dy * h, a.x + dx * reach + dy * h];
      const ys = [a.y + dx * h, a.y - dx * h, a.y + dy * reach + dx * h, a.y + dy * reach - dx * h];
      out.push({
        what: `the ${type} marker of '${e.layoutId}'`,
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      });
    }
  }
  return out;
}

/** Multiplicities clear of every drawn marker, theirs and every other edge's (#201). */
function markerProblems(layout: ClassLayout, geometries: readonly Markers[]): string[] {
  const out = new Set<string>();
  const labels: { what: string; box: Box }[] = [];
  for (const e of layout.class!.edges) {
    const placed = layout.edges.get(e.layoutId)!;
    for (const [end, label, at] of [
      ['start', e.startLabel, placed.startLabel],
      ['end', e.endLabel, placed.endLabel],
    ] as const) {
      if (!label || !at) continue;
      const x0 = at.x - label.width / 2;
      const y0 = at.y - label.height / 2;
      labels.push({
        what: `the ${end} multiplicity of '${e.layoutId}'`,
        box: [x0, y0, x0 + label.width, y0 + label.height],
      });
    }
  }
  if (labels.length === 0) return [];
  const e = 0.5;
  for (const m of geometries) {
    for (const marker of markerBoxes(layout, m)) {
      for (const l of labels) {
        const [ax0, ay0, ax1, ay1] = l.box;
        const [bx0, by0, bx1, by1] = marker.box;
        if (ax0 < bx1 - e && bx0 < ax1 - e && ay0 < by1 - e && by0 < ay1 - e) {
          out.add(`${l.what} overlaps ${marker.what}`);
        }
      }
    }
  }
  return [...out];
}

/** The marker geometry of every built-in theme: the layout is the same in all of them. */
async function allMarkers(): Promise<Markers[]> {
  const themes = await Promise.all(
    THEME_NAMES.map(async (n) => createTheme(await loadTheme(n), { diagram: DIAGRAM_TABLES.class }))
  );
  return themes.map((t) => markers(t, 'none', 'none'));
}

describe('layered over parser-produced class graphs', () => {
  it("reserves each marker's room as the built-in themes draw it, rounded up", async () => {
    const all = await allMarkers();
    for (const type of Object.keys(MARKER_ROOM) as (keyof typeof MARKER_ROOM)[]) {
      const reach = Math.max(...all.map((m) => markerReach(type, m)));
      expect(MARKER_ROOM[type], type).toBe(Math.ceil(reach));
    }
  });

  it('lays out every corpus graph validly, nested and flat, and records crossings', async () => {
    const theme = createTheme(await loadTheme('default'), { diagram: DIAGRAM_TABLES.class });
    const geometries = await allMarkers();
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
        expect(sizeProblems(layout), id).toEqual([]);
        expect(markerProblems(layout, geometries), id).toEqual([]);
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
    const theme = createTheme(await loadTheme('default'), { diagram: DIAGRAM_TABLES.class });
    const geometries = await allMarkers();
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
      expect(sizeProblems(layout), src).toEqual([]);
      expect(markerProblems(layout, geometries), src).toEqual([]);
      checked++;
    }
    expect(checked).toBe(120);
  });
});
