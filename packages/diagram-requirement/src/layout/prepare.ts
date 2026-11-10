// RequirementModel → LayoutGraph (DESIGN §6.1): every box and every relation label measured
// before layout. The box is v12's `requirementBox.ts`; every length comes from the metrics
// table (`metrics.ts`) or the px unit profile (pitfall 13).
import type {
  EdgeRouting,
  LayoutEdge,
  LayoutGraph,
  LayoutMetrics,
  LayoutNode,
  UnitProfile,
} from '@mermaid-js/core/layout';
import { pxProfile } from '@mermaid-js/core/layout';
import { checkStyle, type CheckedStyle } from '@mermaid-js/core/svg';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type { BoxOf, Relation, RequirementModel } from '../model.ts';
import type { RequirementRenderContext } from './context.ts';
import {
  markerGeometry,
  markerRoom,
  REQUIREMENT_CELL_METRICS as C,
  REQUIREMENT_METRICS as M,
  type MarkerExtent,
  type MarkerGeometry,
} from './metrics.ts';

/** What a box's line shows: the kind, the name, or one body field. */
export type LinePart =
  | 'kind'
  | 'name'
  | 'id'
  | 'text'
  | 'risk'
  | 'verification'
  | 'type'
  | 'docRef';

/** One line of a box, placed in the box: `x` and `y` are its top left from the box's. */
export interface LineView {
  readonly part: LinePart;
  readonly label: MeasuredLabel;
  readonly x: number;
  readonly y: number;
  /** The kind and the name are centred; body lines start `bodyInset` in. */
  readonly align: 'center' | 'start';
  /**
   * In cells (text output) only: the most cells a body line shows, its key and 40 cells of
   * value; a longer line is cut to it, ending in an ellipsis (D438).
   */
  readonly cut?: number;
}

/** A requirement or an element measured as v12's `requirementBox`. */
export type BoxView = BoxOf & BoxMeasures;

/** What a box view holds besides its model record. */
export interface BoxMeasures {
  /** Layout node id: the box's AST id (`requirement:<name>`, `element:<name>`). */
  readonly id: string;
  readonly style: CheckedStyle;
  /** `default` plus the box's classes, as v12's `cssClasses`. */
  readonly classes: readonly string[];
  /** Palette slot (v12's `colorIndex`). */
  readonly slot: number;
  readonly width: number;
  readonly height: number;
  /** The kind, the name, then each body line with text, top to bottom. */
  readonly lines: readonly LineView[];
  /** The divider's offset from the box's top; unset when no body line has text. */
  readonly divider?: number;
}

export interface RelationView {
  /** Layout edge id: the relation's AST id. */
  readonly id: string;
  /**
   * v12's edge id, written as `data-id`: `<src>-<dst>-<n>`, `n` the relation's place among all
   * of them, those left out (D434) included (`getData`).
   */
  readonly dataId: string;
  readonly relation: Relation;
  /** Layout ids of the boxes the ends resolve to. */
  readonly source: string;
  readonly target: string;
  /** `<<kind>>`, at the middle of the line. */
  readonly label: MeasuredLabel;
  /** `contains` draws a circle with a plus at the source; the rest an open chevron at the target. */
  readonly marker: 'contains' | 'arrow';
  readonly markerAt: 'source' | 'target';
  /** Every kind but `contains` is drawn dashed. */
  readonly dashed: boolean;
}

/** How relation lines are drawn: v12 drew them with `flowchart.curve` (class's precedent). */
export type RequirementCurve =
  | 'curved'
  | 'linear'
  | 'step'
  | 'stepBefore'
  | 'stepAfter'
  | 'rounded';

export interface RequirementPrepared {
  readonly graph: LayoutGraph;
  /** Requirements, then elements, in model order. */
  readonly boxes: readonly BoxView[];
  /** The relations whose two ends name boxes, in model order (D434). */
  readonly relations: readonly RelationView[];
  /** `flowchart.curve`, `rounded` when unset; the graph's `routing` follows it. */
  readonly curve: RequirementCurve;
  /** The theme's marker geometry, which the room was sized for and the renderer draws. */
  readonly markers: MarkerGeometry;
  /** The front-matter title (D218), as plain text in the theme's font; unset without one. */
  readonly title?: MeasuredLabel;
}

/** v12's curve names; any other name is an S-curve (flowchart's `curveKind`). */
export function requirementCurve(curve: string | undefined): RequirementCurve {
  return curve === 'linear' ||
    curve === 'step' ||
    curve === 'stepBefore' ||
    curve === 'stepAfter' ||
    curve === 'rounded'
    ? curve
    : 'curved';
}

/** How the engine routes each curve (flowchart's table): the rest are right angles. */
const ROUTING: Readonly<Partial<Record<RequirementCurve, EdgeRouting>>> = {
  linear: 'straight',
  curved: 'curved',
};

/** The least bold font weight. */
const BOLD = 600;

function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= BOLD;
  const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
  const size = fontSizePx(t['font-size'], font.size);
  return [size !== undefined && size > 0 && size < M.maxFontSize ? { ...font, size } : font, bits];
}

type Measure = (text: string, font: FontKey, bits: number) => MeasuredLabel;

/** `<<text>>`, as v12 wrote it (entities, decoded by the label layout). */
export const angled = (text: string): string => `&lt;&lt;${text}&gt;&gt;`;

/** v12's head and body lines, in order: an empty field draws nothing. */
export function linesOf(of: BoxOf): { kind: string; body: [LinePart, string][] } {
  const [kind, fields]: [string, [LinePart, string, string][]] =
    of.is === 'requirement'
      ? [
          of.box.kind,
          [
            ['id', 'ID', of.box.requirementId],
            ['text', 'Text', of.box.text],
            ['risk', 'Risk', of.box.risk],
            ['verification', 'Verification', of.box.verifyMethod],
          ],
        ]
      : [
          'Element',
          [
            ['type', 'Type', of.box.type],
            ['docRef', 'Doc Ref', of.box.docRef],
          ],
        ];
  const body = fields
    .filter(([, , v]) => v !== '')
    .map(([part, key, v]): [LinePart, string] => [part, `${key}: ${v}`]);
  return { kind: angled(kind), body };
}

/** What every box view is measured with. */
interface BoxEnv {
  readonly font: FontKey;
  readonly measure: Measure;
  readonly styleOf: (styles: readonly string[]) => CheckedStyle;
}

/**
 * v12's `requirementBox`: `<<Kind>>` and the bold name centred, then, after `gap` and the
 * divider, the body lines `bodyInset` in; as wide as the widest line plus `padding`, as tall as
 * the lines (and the gap, with a body) plus `padding`. v12 put the text `padding` less half the
 * first line's height below the top (8 px at 24 px lines, the rest below) and the divider the
 * two head lines and `gap` down from the top; both are kept, the text never above the top. Each
 * line has its own line box (v12 centred each on its offset, so a taller line overlapped the
 * one above).
 */
function boxView(of: BoxOf, { font, measure, styleOf }: BoxEnv): BoxView {
  const { box } = of;
  const style = styleOf(box.styles);
  const [f, bits] = textStyle(style, font);
  const content = linesOf(of);
  const head: [LinePart, MeasuredLabel][] = [
    ['kind', measure(content.kind, f, bits)],
    ['name', measure(box.name, f, bits | Style.Bold)],
  ];
  const body = content.body.map(([part, text]): [LinePart, MeasuredLabel] => [
    part,
    measure(text, f, bits),
  ]);
  let widest = 0;
  for (const [, l] of [...head, ...body]) widest = Math.max(widest, l.width);
  const width = widest + M.padding;
  const top = Math.max(0, M.padding - head[0]![1].height / 2);
  const lines: LineView[] = [];
  let y = top;
  for (const [part, label] of head) {
    lines.push({ part, label, x: (width - label.width) / 2, y, align: 'center' });
    y += label.height;
  }
  const nameBottom = y;
  if (body.length > 0) y += M.gap;
  for (const [part, label] of body) {
    lines.push({ part, label, x: M.bodyInset, y, align: 'start' });
    y += label.height;
  }
  return {
    ...of,
    id: box.ast,
    style,
    classes: box.classes,
    slot: box.slot,
    width,
    height: y - top + M.padding,
    lines,
    ...(body.length > 0 ? { divider: nameBottom + M.gap - top } : {}),
  };
}

/**
 * The text form of a box (#588, D438): ER's box with a divider. The kind and the name centred,
 * the divider row, then the body lines `nodePad.x` in from the side, each value cut to
 * `C.value` cells; `nodePad.y` blank rows above and below each band. `x` and `y` count cells
 * from the box's top left, its border included.
 */
function cellBoxView(of: BoxOf, { font, measure, styleOf }: BoxEnv, units: UnitProfile): BoxView {
  const { box } = of;
  const pad = units.builder.nodePad;
  const style = styleOf(box.styles);
  const content = linesOf(of);
  const head: [LinePart, MeasuredLabel][] = [
    ['kind', measure(content.kind, font, 0)],
    ['name', measure(box.name, font, 0)],
  ];
  const body = content.body.map(([part, text]): [LinePart, MeasuredLabel, number] => [
    part,
    measure(text, font, 0),
    text.indexOf(': ') + ': '.length + C.value,
  ]);
  let widest = 0;
  for (const [, l] of head) widest = Math.max(widest, l.width);
  for (const [, l, cut] of body) widest = Math.max(widest, Math.min(l.width, cut));
  const border = 1;
  const width = widest + 2 * (pad.x + border);
  const lines: LineView[] = [];
  let y = border + pad.y;
  for (const [part, label] of head) {
    const x = border + pad.x + Math.floor((widest - label.width) / 2);
    lines.push({ part, label, x, y, align: 'center' });
    y += label.lines.length;
  }
  y += pad.y;
  const divider = y;
  if (body.length > 0) y += border + pad.y;
  for (const [part, label, cut] of body) {
    lines.push({ part, label, x: border + pad.x, y, align: 'start', cut });
    y += label.lines.length;
  }
  if (body.length > 0) y += pad.y;
  return {
    ...of,
    id: box.ast,
    style,
    classes: box.classes,
    slot: box.slot,
    width,
    height: y + border,
    lines,
    ...(body.length > 0 ? { divider } : {}),
  };
}

/** The engine metrics: self-loops and edge ends along a side sized for the markers. */
function requirementMetrics(room: MarkerExtent): LayoutMetrics {
  const m = pxProfile.engine;
  return {
    ...m,
    loop: Math.max(m.loop, room.length + m.loopGap),
    portPitch: Math.max(m.portPitch, room.width + m.minPitch),
  };
}

/**
 * The graph in cells (#588): the cell profile's spacing, with a rank gap that holds both ends'
 * marks and a line cell beside the label (`C.rank`); with the ranks running down, ends along a
 * side far enough apart for the `contains` mark across a line, and self-loops reaching out far
 * enough for it along theirs; stepped routes on the grid. The marks take no head room of
 * their own: the rank gap holds them, as ER's ends.
 */
function cellGraph(
  model: RequirementModel,
  boxes: readonly BoxView[],
  relations: readonly RelationView[],
  units: UnitProfile
): LayoutGraph {
  const b = units.builder;
  const m = units.engine;
  const across = model.direction === 'LR' || model.direction === 'RL';
  return {
    direction: model.direction,
    nodes: boxes.map(
      (v): LayoutNode => ({ id: v.id, width: v.width, height: v.height, shape: 'requirementBox' })
    ),
    edges: relations.map(
      (e): LayoutEdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        minLen: 1,
        label: { width: e.label.width + b.labelPatch.x, height: e.label.height + b.labelPatch.y },
      })
    ),
    groups: [],
    spacing: { node: b.spacing.node, rank: Math.max(b.spacing.rank, C.rank), edge: b.spacing.edge },
    diagramPadding: b.diagramPadding,
    routing: 'stepped',
    headRoom: b.headRoom,
    metrics: {
      ...m,
      // A self-loop leaves its side straight for the `contains` mark along it before it turns.
      loop: Math.max(m.loop, C.containsWidth + m.loopGap),
      // Lines leave the top and bottom sides only when the ranks run down.
      ...(across ? {} : { portPitch: Math.max(m.portPitch, C.containsWidth + m.minPitch) }),
    },
    grid: units.grid,
  };
}

/** Measures the model and builds the graph the layout engine gets. */
export function prepareRequirement(
  model: RequirementModel,
  ctx: RequirementRenderContext
): RequirementPrepared {
  const { measurer, theme } = ctx;
  const font: FontKey = {
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  };
  const measure: Measure = (text, f, bits) =>
    layoutLabel(text, f, Infinity, measurer, { markdown: true, style: bits, inline: ctx.inline });
  const styles = new Map<string, CheckedStyle>();
  const styleOf = (decls: readonly string[]): CheckedStyle => {
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, (w) => ctx.warn(w))));
    return style;
  };
  const env: BoxEnv = { font, measure, styleOf };
  // Text output (#588): the cell profile sizes the boxes and the graph in cells.
  const cells = ctx.units?.grid === undefined ? undefined : ctx.units;
  const view = (of: BoxOf): BoxView => (cells ? cellBoxView(of, env, cells) : boxView(of, env));
  const boxes = [
    ...model.requirements.map((box) => view({ is: 'requirement', box })),
    ...model.elements.map((box) => view({ is: 'element', box })),
  ];
  const relations: RelationView[] = [];
  model.relations.forEach((r, n) => {
    // D434: a relation to a name no box has stays out of the layout.
    if (r.from === undefined || r.to === undefined) return;
    const contains = r.kind === 'contains';
    relations.push({
      id: r.ast,
      dataId: `${r.src}-${r.dst}-${n}`,
      relation: r,
      source: r.from,
      target: r.to,
      label: measure(angled(r.kind), font, 0),
      marker: contains ? 'contains' : 'arrow',
      markerAt: contains ? 'source' : 'target',
      dashed: !contains,
    });
  });
  const curve = requirementCurve(ctx.config.flowchart?.curve ?? 'rounded');
  const b = pxProfile.builder;
  const markers = markerGeometry(theme);
  const room = markerRoom(markers);
  const graph: LayoutGraph = cells
    ? cellGraph(model, boxes, relations, cells)
    : {
        direction: model.direction,
        nodes: boxes.map(
          (v): LayoutNode => ({
            id: v.id,
            width: v.width,
            height: v.height,
            shape: 'requirementBox',
          })
        ),
        edges: relations.map(
          (e): LayoutEdge => ({
            id: e.id,
            source: e.source,
            target: e.target,
            minLen: 1,
            label: {
              width: e.label.width + b.labelPatch.x,
              height: e.label.height + b.labelPatch.y,
            },
            ...(e.markerAt === 'source'
              ? { startMarker: { ...room } }
              : { endMarker: { ...room } }),
          })
        ),
        groups: [],
        spacing: { node: M.spacing.node, rank: M.spacing.rank, edge: b.spacing.edge },
        diagramPadding: M.viewBoxPadding,
        routing: ROUTING[curve] ?? 'stepped',
        headRoom: room.length,
        metrics: requirementMetrics(room),
      };
  // v12 `insertTitle` writes the title as plain text in the diagram's font.
  const title = model.title?.trim();
  return {
    graph,
    boxes,
    relations,
    curve,
    markers,
    ...(title ? { title: layoutLabel(title, font, Infinity, measurer) } : {}),
  };
}
