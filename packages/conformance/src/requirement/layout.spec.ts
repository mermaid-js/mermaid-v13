import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import {
  countCrossings,
  layered,
  validateLayout,
  type LayoutEngine,
  type LayoutModel,
  type Point,
} from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import {
  createTheme,
  isThemeName,
  loadTheme,
  THEME_NAMES,
  type Theme,
} from '@mermaid-js/core/theme';
import {
  parseRequirement,
  requirement,
  type RequirementLayout,
  type RequirementModel,
} from '@mermaid-js/diagram-requirement';
import {
  CLASSIC_MARKERS,
  layoutRequirement,
  markerGeometry,
  markerRoom,
  REQUIREMENT_METRICS,
  type MarkerExtent,
  type MarkerGeometry,
} from '@mermaid-js/diagram-requirement/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { requirementCases, requirementCorpus } from './corpus.ts';

// DDLT on parser-produced requirement diagrams (spec #520 T3, R-LAYOUT-3; the `ddlt` rule: parse
// the source, never hand build the graph): the e2e corpus, the harvested v12 spec and
// syntax-page strings and the accepted cases, parsed by the v13 parser, measured with the table
// measurer in each source's theme and laid out by `layoutRequirement`, the entry point the
// plugin calls, through core's `layered` and through ELK (`@mermaid-js/layout-elk`, D171).

interface Fixture {
  readonly id: string;
  readonly model: RequirementModel;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly theme: Theme;
}

const fixtures: Fixture[] = [];
let elk: LayoutEngine;

beforeAll(async () => {
  elk = await elkLayouts.find((l) => l.name === 'elk')!.loader();
  const themes = new Map<string, Theme>();
  for (const item of [...(await requirementCorpus()), ...requirementCases()]) {
    const pre = preprocess(item.source);
    const parse = parseRequirement(item.source, { preprocessed: pre });
    if (parse.diagnostics.some((d) => d.severity === 'error')) continue;
    const directives = pre.directives.flatMap((d) =>
      d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
    );
    const config = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, directives);
    const name =
      typeof config.theme === 'string' && isThemeName(config.theme) ? config.theme : 'default';
    let theme = themes.get(name);
    if (!theme)
      themes.set(
        name,
        (theme = createTheme(await loadTheme(name), { diagram: requirement.theme }))
      );
    fixtures.push({ id: item.id, model: parse.model, config, theme });
  }
}, 60_000);

const ENGINES: readonly [string, () => LayoutEngine][] = [
  ['layered', () => layered],
  ['elk', () => elk],
];

function laidOut(f: Fixture, engine: LayoutEngine): RequirementLayout {
  return layoutRequirement(f.model, {
    config: f.config,
    measurer: tableMeasurer,
    theme: f.theme,
    warn: () => {},
    layout: (graph) => engine(graph, { config: f.config }),
  });
}

/** A box: left, top, right, bottom. */
type Rect = readonly [number, number, number, number];

const SLACK = 0.5;

const rectOf = (c: Point, s: { width: number; height: number }): Rect => [
  c.x - s.width / 2,
  c.y - s.height / 2,
  c.x + s.width / 2,
  c.y + s.height / 2,
];

/** The interiors meet (touching sides do not count). */
const overlaps = (a: Rect, b: Rect): boolean =>
  a[0] < b[2] - SLACK && b[0] < a[2] - SLACK && a[1] < b[3] - SLACK && b[1] < a[3] - SLACK;

const inside = (outer: Rect, r: Rect): boolean =>
  r[0] >= outer[0] - SLACK &&
  r[1] >= outer[1] - SLACK &&
  r[2] <= outer[2] + SLACK &&
  r[3] <= outer[3] + SLACK;

/** `p` lies on the outline of `r`: on it, not off it or inside. */
const onOutline = (r: Rect, p: Point): boolean =>
  inside(r, [p.x, p.y, p.x, p.y]) &&
  (Math.abs(p.x - r[0]) <= SLACK ||
    Math.abs(p.x - r[2]) <= SLACK ||
    Math.abs(p.y - r[1]) <= SLACK ||
    Math.abs(p.y - r[3]) <= SLACK);

/**
 * The box a marker is drawn in: from the line's end on the outline out along its first leg,
 * `room.length` long and `room.width` across, centred on the line.
 */
function markerRect(end: Point, next: Point, room: MarkerExtent): Rect {
  const len = Math.hypot(next.x - end.x, next.y - end.y) || 1;
  const dx = (next.x - end.x) / len;
  const dy = (next.y - end.y) / len;
  const h = room.width / 2;
  const reach = room.length;
  const xs = [
    end.x - dy * h,
    end.x + dy * h,
    end.x + dx * reach - dy * h,
    end.x + dx * reach + dy * h,
  ];
  const ys = [
    end.y + dx * h,
    end.y - dx * h,
    end.y + dy * reach + dx * h,
    end.y + dy * reach - dx * h,
  ];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * The corners of a marker as the renderer draws it under `g`, stroke included, in its own
 * frame: `d` out from the outline along the line, `s` across it. The chevron is two
 * butt-capped strokes from the tip on the outline to `(length, ±width/2)`, scaled with its
 * stroke by `g.arrowScale`; the `contains` circle's square (its plus lies inside it).
 */
function drawnMarker(
  marker: 'contains' | 'arrow',
  g: MarkerGeometry = CLASSIC_MARKERS
): [d: number, s: number][] {
  const M = REQUIREMENT_METRICS;
  const k = marker === 'arrow' ? g.arrowScale : 1;
  const half = (g.stroke * k) / 2;
  if (marker === 'contains') {
    const { cx, r } = M.circle;
    const o = r + half;
    return [
      [cx - o, -o],
      [cx + o, -o],
      [cx + o, o],
      [cx - o, o],
    ];
  }
  const out: [number, number][] = [];
  for (const side of [-1, 1]) {
    const back: [number, number] = [M.chevron.length * k, (side * M.chevron.width * k) / 2];
    const leg = Math.hypot(...back);
    // A butt cap: half the stroke each way, square to the leg.
    const n = [(-back[1] / leg) * half, (back[0] / leg) * half] as const;
    for (const [d, a] of [[0, 0], back] as const)
      out.push([d + n[0], a + n[1]], [d - n[0], a - n[1]]);
  }
  return out;
}

/** The page box of a drawn marker at `end`, pointing away from it towards `next`. */
function drawnRect(marker: 'contains' | 'arrow', end: Point, next: Point, g: MarkerGeometry): Rect {
  const len = Math.hypot(next.x - end.x, next.y - end.y) || 1;
  const dx = (next.x - end.x) / len;
  const dy = (next.y - end.y) / len;
  const pts = drawnMarker(marker, g).map(([d, a]) => [
    end.x + dx * d - dy * a,
    end.y + dy * d + dx * a,
  ]);
  const xs = pts.map((q) => q[0]!);
  const ys = pts.map((q) => q[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * The T3 invariants past `validateLayout`: each relation ends on its boxes' outlines with its
 * marker outside every box; boxes, labels and markers inside the bounding box (D224); every box
 * at least as wide as its widest line plus padding, its lines inside it and in order.
 */
function problems(layout: RequirementLayout): string[] {
  const out: string[] = [];
  const p = layout.requirement!;
  const page: Rect = [0, 0, layout.width, layout.height];
  const boxes = new Map<string, Rect>();
  for (const b of p.boxes) {
    const placed = layout.nodes.get(b.id);
    if (!placed) continue;
    const r = rectOf(placed, b);
    boxes.set(b.id, r);
    if (!inside(page, r)) out.push(`box '${b.id}' lies outside the bounding box`);
    let widest = 0;
    let y = 0;
    for (const line of b.lines) {
      widest = Math.max(widest, line.label.width);
      if (line.y < y - 1e-6) out.push(`box '${b.id}': line '${line.part}' overlaps the one above`);
      y = line.y + line.label.height;
      if (line.x < -1e-6 || line.x + line.label.width > b.width + 1e-6)
        out.push(`box '${b.id}': line '${line.part}' runs out of the box`);
      if (y > b.height + 1e-6) out.push(`box '${b.id}': line '${line.part}' runs out of the box`);
    }
    if (b.width + 1e-6 < widest + REQUIREMENT_METRICS.padding)
      out.push(`box '${b.id}' is narrower than its widest line plus padding`);
    if (b.divider !== undefined) {
      const name = b.lines.find((l) => l.part === 'name')!;
      const body = b.lines.find((l) => l.part !== 'kind' && l.part !== 'name')!;
      if (b.divider < name.y + name.label.height - 1e-6 || b.divider > body.y + 1e-6)
        out.push(`box '${b.id}': the divider is not between the name and the body`);
    }
  }
  for (const e of p.relations) {
    const placed = layout.edges.get(e.id);
    if (!placed || placed.points.length < 2) continue;
    const pts = placed.points;
    const from = boxes.get(e.source)!;
    const to = boxes.get(e.target)!;
    if (!onOutline(from, pts[0]!)) out.push(`relation '${e.id}' does not start on its outline`);
    if (!onOutline(to, pts.at(-1)!)) out.push(`relation '${e.id}' does not end on its outline`);
    const [end, next] = e.markerAt === 'source' ? [pts[0]!, pts[1]!] : [pts.at(-1)!, pts.at(-2)!];
    const room = markerRect(end, next, markerRoom(p.markers!));
    const drawn = drawnRect(e.marker, end, next, p.markers!);
    for (const [id, r] of boxes) {
      if (overlaps(room, r)) out.push(`the marker room of '${e.id}' overlaps box '${id}'`);
      if (overlaps(drawn, r)) out.push(`the marker of '${e.id}' overlaps box '${id}'`);
    }
    if (!inside(page, room) || !inside(page, drawn))
      out.push(`the marker of '${e.id}' lies outside the bounding box`);
    if (placed.label && !inside(page, rectOf(placed.label, e.label)))
      out.push(`the label of '${e.id}' lies outside the bounding box`);
  }
  return out;
}

describe('requirement layout over parser-produced fixtures', () => {
  it("reserves room from each theme's marker tokens that holds each marker as drawn", async () => {
    /** The room holds every corner, and is the largest corner rounded up. */
    const check = (g: MarkerGeometry, what: string): void => {
      const room = markerRoom(g);
      let far = 0;
      let wide = 0;
      for (const marker of ['contains', 'arrow'] as const) {
        for (const [d, a] of drawnMarker(marker, g)) {
          // The chevron's tip caps poke a little into the box: less than half its stroke.
          expect(d, `${what} ${marker}`).toBeGreaterThanOrEqual(-(g.stroke * g.arrowScale) / 2);
          expect(d, `${what} ${marker}`).toBeLessThanOrEqual(room.length);
          expect(Math.abs(a), `${what} ${marker}`).toBeLessThanOrEqual(room.width / 2);
          far = Math.max(far, d);
          wide = Math.max(wide, 2 * Math.abs(a));
        }
      }
      expect(room, what).toEqual({ length: Math.ceil(far - 1e-9), width: Math.ceil(wide - 1e-9) });
    };
    const rooms = new Map<string, MarkerExtent>();
    for (const name of THEME_NAMES) {
      const theme = createTheme(await loadTheme(name), { diagram: requirement.theme });
      check(markerGeometry(theme), name);
      rooms.set(name, markerRoom(markerGeometry(theme)));
      // A larger strokeWidth: the neo markers widen with it, and the room with them.
      for (const strokeWidth of [3, 6, 20]) {
        const wide = createTheme(await loadTheme(name), {
          diagram: requirement.theme,
          themeVariables: { strokeWidth },
        });
        check(markerGeometry(wide), `${name} strokeWidth ${strokeWidth}`);
      }
    }
    expect(rooms.get('default')).toEqual({ length: 21, width: 21 });
    expect(rooms.get('neo')).toEqual({ length: 20, width: 20 });
    // The chevron's caps reach past its 20 × 20: 20.22 out, 20.89 across.
    const arrow = drawnMarker('arrow');
    expect(Math.max(...arrow.map(([d]) => d))).toBeCloseTo(20.2236, 3);
    expect(2 * Math.max(...arrow.map(([, a]) => a))).toBeCloseTo(20.8944, 3);
  });

  it('covers the corpus: both box kinds, every relation kind, styles, directions', () => {
    expect(fixtures.length).toBeGreaterThan(200);
    const models = fixtures.map((f) => f.model);
    const kinds = new Set(models.flatMap((m) => m.relations.map((r) => r.kind)));
    expect(kinds.size).toBe(7);
    expect(new Set(models.map((m) => m.direction)).size).toBe(4);
    expect(models.some((m) => m.elements.length > 0 && m.requirements.length > 0)).toBe(true);
    expect(models.some((m) => m.relations.some((r) => r.from === undefined))).toBe(true);
    expect(models.some((m) => m.relations.some((r) => r.from === r.to))).toBe(true);
  });

  it('catches a line end off its outline, a marker pointing in, a box too narrow', () => {
    const f = fixtures.find((x) => x.id.endsWith('a-simple-requirement-diagram-default.mmd'))!;
    const layout = laidOut(f, layered);
    expect(problems(layout)).toEqual([]);
    const p = layout.requirement!;
    const e = p.relations.find((r) => r.markerAt === 'target')!;
    const placed = layout.edges.get(e.id)!;
    const target = layout.nodes.get(e.target)!;
    // The end moved to the box's centre; then the end on the outline but leaving inwards.
    const moved = (points: typeof placed.points): RequirementLayout => ({
      ...layout,
      edges: new Map([...layout.edges, [e.id, { ...placed, points }]]),
    });
    const centre = { x: target.x, y: target.y, axis: placed.points.at(-1)!.axis };
    expect(problems(moved([...placed.points.slice(0, -1), centre]))).toContain(
      `relation '${e.id}' does not end on its outline`
    );
    const end = placed.points.at(-1)!;
    expect(problems(moved([placed.points[0]!, centre, end]))).toContain(
      `the marker of '${e.id}' overlaps box '${e.target}'`
    );
    const box = p.boxes[0]!;
    const narrow: RequirementLayout = {
      ...layout,
      requirement: { ...p, boxes: [{ ...box, width: box.width - 1 }, ...p.boxes.slice(1)] },
    };
    expect(problems(narrow)).toContain(
      `box '${box.id}' is narrower than its widest line plus padding`
    );
  });

  it.each(ENGINES)(
    '%s: no NaN or overlaps, relations on their outlines with markers outside, all in bounds',
    (_, engineOf) => {
      const engine = engineOf();
      const bad: Record<string, string[]> = {};
      for (const f of fixtures) {
        const layout = laidOut(f, engine);
        const found = [
          ...validateLayout(layout.requirement!.graph, layout as LayoutModel),
          ...problems(layout),
        ];
        if (found.length > 0) bad[f.id] = found;
      }
      expect(bad).toEqual({});
    },
    120_000
  );

  it('records the crossings layered draws', () => {
    const crossings: Record<string, number> = {};
    for (const f of fixtures) crossings[f.id] = countCrossings(laidOut(f, layered));
    expect(Object.values(crossings).every((n) => Number.isInteger(n))).toBe(true);
    expect(crossings).toMatchSnapshot();
  });

  it.each(ENGINES)('%s: the same layout twice', (_, engineOf) => {
    const engine = engineOf();
    const plain = (l: RequirementLayout) =>
      JSON.stringify([[...l.nodes], [...l.edges], l.width, l.height]);
    for (const f of fixtures) {
      expect(plain(laidOut(f, engine)), f.id).toBe(plain(laidOut(f, engine)));
    }
  });
});
