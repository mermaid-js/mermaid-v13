// ErModel → LayoutGraph (DESIGN §6.1): every entity measured as a table, every relationship and
// subgraph title measured, before layout. Groups and edge ends follow v12's `ErDB.getData`.
// Every length comes from the unit profile (ADR-13); this file holds no length literal
// (`packages/conformance/src/er-prepare-literals.spec.ts`).
import type {
  Dir,
  LayoutGraph,
  LayoutGroup,
  LayoutNode,
  UnitProfile,
} from '@mermaid-js/core/layout';
import { fromPx, pxProfile } from '@mermaid-js/core/layout';
import { erConfigDefaults } from '../generated/config-defaults.ts';
import { styleCache, type CheckedStyle } from '@mermaid-js/core/svg';
import {
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type {
  ErAttribute,
  ErEntity,
  ErModel,
  ErRelationship,
  ErSubgraph,
} from '../parser/index.ts';
import { configLengths, type ConfigLength } from './config-length.ts';
import type { ErRenderContext } from './context.ts';
import { END_CELLS, erMetrics } from './ends.ts';

/** A band of a table: its offset from the table's top (or left) border and its size. */
export interface Band {
  /** Offset of the band's start from the box's top or left side, rules included. */
  readonly at: number;
  readonly size: number;
}

/** One attribute row: the type, name, keys and comment cells, measured. */
export interface RowView {
  readonly attribute: ErAttribute;
  /** The vertical band of the row. */
  readonly band: Band;
  /** `[type, name, keys, comment]`, as drawn: generics as `<T>`, keys joined with `,`. */
  readonly cells: readonly [MeasuredLabel, MeasuredLabel, MeasuredLabel, MeasuredLabel];
}

/** An entity measured as a table (v12 `erBox`), or as a plain box when it has no attributes. */
export interface EntityView {
  /** Layout node id: the entity's AST id. */
  readonly id: string;
  readonly entity: ErEntity;
  /** The name row's text: the alias, else the name. */
  readonly label: MeasuredLabel;
  readonly style: CheckedStyle;
  /** `default` plus the entity's classes, as v12's `cssClasses`. */
  readonly classes: readonly string[];
  /** Layout group id of the subgraph it sits in. */
  readonly parent?: string;
  /** Declaration order, for the palette slot (v12 `colorIndex`). */
  readonly order: number;
  readonly width: number;
  readonly height: number;
  /**
   * The thickness of a table rule: 0 in px (strokes are drawn on the band edges), 1 in cells
   * (a border or divider takes a character cell).
   */
  readonly rule: number;
  /** The name band, under the top rule. */
  readonly header: Band;
  /**
   * The four column bands left to right (`type`, `name`, `keys`, `comment`), each with a rule
   * before it. A column no attribute fills has size 0 and draws no divider. Empty for a plain box.
   */
  readonly columns: readonly Band[];
  readonly rows: readonly RowView[];
}

export interface EdgeView {
  /** Layout edge id: the relationship's AST id. */
  readonly id: string;
  readonly relationship: ErRelationship;
  /** Layout ids of the ends: an entity's or a subgraph's. */
  readonly source: string;
  readonly target: string;
  readonly label: MeasuredLabel;
}

export interface GroupView {
  /** Layout group id: the subgraph's AST id. */
  readonly id: string;
  readonly subgraph: ErSubgraph;
  readonly label: MeasuredLabel;
  readonly style: CheckedStyle;
  readonly parent?: string;
  /** Nesting depth, 0 at the top. */
  readonly depth: number;
}

export interface ErPrepared {
  graph: LayoutGraph;
  entities: EntityView[];
  edges: EdgeView[];
  /** Outermost first. */
  groups: GroupView[];
  /** Padding inside every table cell, per side (D116). */
  pad: { readonly x: number; readonly y: number };
}

const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';

function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
  const size = fontSizePx(t['font-size'], font.size);
  return [size !== undefined && size > 0 && size < 1000 ? { ...font, size } : font, bits];
}

/**
 * v12 `parseGenericTypes`: `~T~` pairs read outside in become `<T>`; a comma splits the text
 * unless it sits inside one pair (`Map~K, V~`).
 */
export function genericType(input: string): string {
  const tildes = (s: string) => s.split('~').length - 1;
  const one = (set: string): string => {
    const count = tildes(set);
    if (count <= 1) return set;
    const lead = count % 2 !== 0 && set.startsWith('~');
    const text = lead ? set.slice(1) : set;
    const chars = [...text];
    let first = chars.indexOf('~');
    let last = chars.lastIndexOf('~');
    while (first !== -1 && first !== last) {
      chars[first] = '<';
      chars[last] = '>';
      first = chars.indexOf('~');
      last = chars.lastIndexOf('~');
    }
    return (lead ? '~' : '') + chars.join('');
  };
  const sets = input.split(/(,)/);
  const out: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    let set = sets[i]!;
    if (set === ',' && i > 0 && i + 1 < sets.length) {
      const prev = sets[i - 1]!;
      const next = sets[i + 1]!;
      if (tildes(prev) === 1 && tildes(next) === 1) {
        set = `${prev},${next}`;
        i++;
        out.pop();
      }
    }
    out.push(one(set));
  }
  return out.join('');
}

interface Measure {
  readonly font: FontKey;
  readonly pad: { readonly x: number; readonly y: number };
  readonly rule: number;
  readonly label: (text: string, f: FontKey, max: number, bits?: number) => MeasuredLabel;
  readonly styleOf: (classes: readonly string[], own?: readonly string[]) => CheckedStyle;
}

/** The smallest rank gap in cells that holds both ends of a line with line cells between. */
const ENDS_GAP = 2 * END_CELLS + 2;

type SizeKey = 'nodeSpacing' | 'rankSpacing' | 'minEntityWidth';

/**
 * D118, D124: a px size key as the builder reads it. In px every value counts, the generated
 * v12 default included. In cells only a value the author set converts; v12's px defaults (140,
 * 80, 100) do not, and the cell profile's own spacing and width apply. The resolved config
 * already carries the section defaults, so a value equal to the generated default counts as
 * not set (D124: setting it to exactly that value draws as not setting it).
 */
function sizeKey(units: UnitProfile, length: ConfigLength, key: SizeKey): number | undefined {
  const px = length(key);
  if (px === undefined || units.grid === undefined) return px;
  return px === erConfigDefaults[key] ? undefined : px;
}

/**
 * D116: `er.entityPadding` (px) pads every table cell, across and down, in place of the
 * layout's node padding. Text output keeps the cell profile's 1-cell padding.
 */
function cellPad(units: UnitProfile, length: ConfigLength): Measure['pad'] {
  const px = units.grid === undefined ? length('entityPadding') : undefined;
  if (px === undefined) return units.builder.nodePad;
  return { x: fromPx(units, px, 'x'), y: fromPx(units, px, 'y') };
}

/**
 * Measures the model and builds the graph the layout engine gets. Every length comes from the
 * unit profile: px config values through `fromPx`, the builder's own lengths from
 * `units.builder`.
 */
export function prepareEr(model: ErModel, ctx: ErRenderContext): ErPrepared {
  const units = ctx.units ?? pxProfile;
  const { measurer, theme } = ctx;
  const font: FontKey = {
    family: theme.value('fontFamily'),
    size: theme.number('fontSize'),
    weight: 400,
  };
  const length = configLengths(ctx.config.er ?? {}, erConfigDefaults, (w) => ctx.warn(w));
  const m: Measure = {
    font,
    pad: cellPad(units, length),
    // This is the only place the builder looks at which profile it has.
    rule: units.id === 'cell' ? 1 : 0,
    label: (text, f, max, bits = 0) =>
      layoutLabel(text, f, max, measurer, { style: bits, inline: ctx.inline }),
    styleOf: styleCache(
      new Map(model.classes.map((c) => [c.name, [...c.styles, ...c.textStyles]])),
      (w) => ctx.warn(w)
    ),
  };
  const minWidth = sizeKey(units, length, 'minEntityWidth');
  const nest = nesting(model);

  const entities = model.entities.map((e, order) =>
    entityView(
      e,
      order,
      nest.parentOf.get(e.id),
      m,
      minWidth === undefined ? 0 : fromPx(units, minWidth, 'x')
    )
  );
  const groups = model.subgraphs.map((sg): GroupView => {
    const style = m.styleOf(sg.classes, sg.styles);
    const [f, bits] = textStyle(style, m.font);
    const parent = nest.parentOf.get(sg.id);
    return {
      id: sg.id,
      subgraph: sg,
      label: m.label(sg.title, f, Infinity, bits),
      style,
      ...(parent !== undefined ? { parent } : {}),
      depth: nest.depthOf(sg.id),
    };
  });
  // Stable: siblings keep source (close) order.
  groups.sort((a, b) => a.depth - b.depth);

  const edgeWrap = units.builder.edgeWrap;
  const edges: EdgeView[] = [];
  for (const r of model.relationships) {
    const source = nest.endOf(r.from.name);
    const target = nest.endOf(r.to.name);
    if (source === undefined || target === undefined) continue;
    edges.push({
      id: r.id,
      relationship: r,
      source,
      target,
      label: m.label(r.label, m.font, edgeWrap),
    });
  }
  const graph = layoutGraph(model, { entities, groups, edges }, ctx, length);
  return { graph, entities, edges, groups, pad: m.pad };
}

interface Nesting {
  /** Layout id (entity or subgraph AST id) → the AST id of the subgraph it sits in. */
  readonly parentOf: ReadonlyMap<string, string>;
  depthOf(id: string): number;
  /** The layout id an edge end names: the entity, else the last subgraph with that id. */
  endOf(name: string): string | undefined;
}

/**
 * Group membership as v12's `getData` sets `parentId`: every member named in a subgraph sits in
 * it, and a reopened subgraph id names each subgraph with it. A link that would make a group
 * its own ancestor is dropped.
 */
function nesting(model: ErModel): Nesting {
  const entityId = new Map<string, string>();
  for (const e of model.entities) entityId.set(e.name, e.id);
  const subgraphIds = new Map<string, string[]>();
  for (const sg of model.subgraphs) {
    let ids = subgraphIds.get(sg.name);
    if (!ids) subgraphIds.set(sg.name, (ids = []));
    ids.push(sg.id);
  }
  const parentOf = new Map<string, string>();
  const above = (id: string, of: string): boolean => {
    const seen = new Set<string>();
    for (let p: string | undefined = of; p !== undefined && !seen.has(p); p = parentOf.get(p)) {
      if (p === id) return true;
      seen.add(p);
    }
    return false;
  };
  for (const sg of model.subgraphs) {
    for (const member of sg.members) {
      const e = entityId.get(member);
      if (e !== undefined) {
        if (!parentOf.has(e)) parentOf.set(e, sg.id);
        continue;
      }
      for (const id of subgraphIds.get(member) ?? []) {
        if (!parentOf.has(id) && !above(id, sg.id)) parentOf.set(id, sg.id);
      }
    }
  }
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    let d = depths.get(id);
    if (d === undefined) {
      const p = parentOf.get(id);
      d = p === undefined ? 0 : depthOf(p) + 1;
      depths.set(id, d);
    }
    return d;
  };
  return {
    parentOf,
    depthOf,
    endOf: (name) => entityId.get(name) ?? subgraphIds.get(name)?.at(-1),
  };
}

/** Lays a run of sizes out after one rule each, from `start`. */
function bands(sizes: readonly number[], start: number, rule: number): Band[] {
  const out: Band[] = [];
  let at = start;
  for (const size of sizes) {
    if (size > 0) at += rule;
    out.push({ at, size });
    at += size;
  }
  return out;
}

/**
 * v12 `erBox`: each column as wide as its widest cell plus padding, shared by every row; a name
 * wider than the columns spreads the difference over the columns in use. With no attributes,
 * the name in a padded box, at least `minWidth` wide.
 */
function entityView(
  entity: ErEntity,
  order: number,
  parent: string | undefined,
  m: Measure,
  minWidth: number
): EntityView {
  const classes = ['default', ...entity.classes];
  const style = m.styleOf(classes, entity.styles);
  const [f, bits] = textStyle(style, m.font);
  const label = m.label(entity.alias || entity.name, f, Infinity, bits);
  const { pad, rule } = m;
  const base = {
    id: entity.id,
    entity,
    label,
    style,
    classes,
    ...(parent !== undefined ? { parent } : {}),
    order,
    rule,
  };
  const headerHeight = label.height + 2 * pad.y;
  if (entity.attributes.length === 0) {
    return {
      ...base,
      width: Math.max(label.width + 2 * (pad.x + rule), minWidth),
      height: headerHeight + 2 * rule,
      header: { at: rule, size: headerHeight },
      columns: [],
      rows: [],
    };
  }
  const cells = entity.attributes.map(
    (a) =>
      [
        m.label(genericType(a.type), f, Infinity, bits),
        m.label(a.name, f, Infinity, bits),
        m.label(a.keys.join(','), f, Infinity, bits),
        m.label(a.comment, f, Infinity, bits),
      ] as const
  );
  // A column is in use when some cell in it has text; type and name always are.
  const widths = [0, 1, 2, 3].map((c) => {
    let w = 0;
    for (const row of cells) w = Math.max(w, row[c]!.width);
    return c < 2 || w > 0 ? w + 2 * pad.x : 0;
  });
  const used = widths.filter((w) => w > 0).length;
  const inner = widths.reduce((a, b) => a + b, 0) + (used - 1) * rule;
  const spare = label.width + 2 * pad.x - inner;
  if (spare > 0) {
    // Whole units in cells: the remainder goes to the last column in use.
    const share = rule > 0 ? Math.floor(spare / used) : spare / used;
    let left = spare;
    let last = 0;
    for (let c = 0; c < widths.length; c++) {
      if (widths[c]! === 0) continue;
      widths[c]! += share;
      left -= share;
      last = c;
    }
    widths[last]! += left;
  }
  const width = widths.reduce((a, b) => a + b, 0) + (used + 1) * rule;
  const header: Band = { at: rule, size: headerHeight };
  // The first column needs no rule of its own: the box side is its rule.
  const columns = bands(widths, 0, rule);
  let y = header.at + header.size + rule;
  const rows = entity.attributes.map((attribute, i): RowView => {
    const row = cells[i]!;
    let h = 0;
    for (const c of row) h = Math.max(h, c.height);
    const band = { at: y, size: h + 2 * pad.y };
    y += band.size;
    return { attribute, band, cells: row };
  });
  return { ...base, width, height: y + rule, header, columns, rows };
}

/** The graph the layout engine gets, every length from the unit profile. */
function layoutGraph(
  model: ErModel,
  { entities, groups, edges }: Pick<ErPrepared, 'entities' | 'groups' | 'edges'>,
  ctx: ErRenderContext,
  length: ConfigLength
): LayoutGraph {
  const units = ctx.units ?? pxProfile;
  const b = units.builder;
  // er.nodeSpacing runs across the flow, er.rankSpacing along it (px config values).
  const fromConfig = (
    px: number | undefined,
    fallback: number,
    axis: 'x' | 'y',
    min: number
  ): number => {
    return px === undefined ? fallback : fromPx(units, px, axis, min);
  };
  // D124: in cells a relationship's two ends take END_CELLS cells each, and a line cell
  // between them (or between an end and the label) keeps them readable as ends, so the rank
  // gap is at least that (6), over the cell profile's own 4. In px the marks size the
  // engine's self-loop and port pitch instead (`erMetrics`).
  const endRoom = units.grid === undefined ? 0 : ENDS_GAP;
  const spacingOn = (rank: 'x' | 'y', node: 'x' | 'y') => ({
    node: fromConfig(
      sizeKey(units, length, 'nodeSpacing'),
      b.spacing.node,
      node,
      b.minSpacing.node
    ),
    rank: Math.max(
      fromConfig(sizeKey(units, length, 'rankSpacing'), b.spacing.rank, rank, b.minSpacing.rank),
      endRoom
    ),
    edge: b.spacing.edge,
  });
  const along = sideways(model.direction) ? 'x' : 'y';
  const spacing = spacingOn(along, along === 'x' ? 'y' : 'x');
  const down = spacingOn('y', 'x');
  const turned = down.node !== spacing.node || down.rank !== spacing.rank;
  const graph: LayoutGraph = {
    direction: model.direction,
    nodes: entities.map((e): LayoutNode => {
      const node: LayoutNode = { id: e.id, width: e.width, height: e.height, shape: 'erBox' };
      if (e.parent !== undefined) node.parent = e.parent;
      return node;
    }),
    groups: groups.map((g): LayoutGroup => {
      const titled = g.label.height > 0;
      const group: LayoutGroup = {
        id: g.id,
        padding: {
          top: titled ? b.titlePad : b.groupPad,
          right: b.groupPad,
          bottom: b.groupPad,
          left: b.groupPad,
        },
      };
      if (titled) group.title = { width: g.label.width, height: g.label.height };
      if (g.parent !== undefined) group.parent = g.parent;
      if (g.subgraph.direction) group.direction = g.subgraph.direction;
      return group;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      minLen: 1,
      ...(e.label.width > 0
        ? {
            label: {
              width: e.label.width + b.labelPatch.x,
              height: e.label.height + b.labelPatch.y,
            },
          }
        : {}),
    })),
    spacing,
    ...(turned ? { turnedSpacing: down } : {}),
    // D116: er.diagramPadding (px) is the margin around the drawing. Text output trims the
    // empty margin, so in cells the profile's own applies (as the flowchart).
    diagramPadding:
      units.grid === undefined
        ? fromConfig(length('diagramPadding'), b.diagramPadding, 'x', 0)
        : b.diagramPadding,
    // v12's default ELK layout draws orthogonal routes; on the grid they are square anyway.
    routing: 'stepped',
    // Room for the cardinality marker at the head (D154): theme-independent.
    headRoom: b.headRoom,
    // Self-loops and port pitch sized for the cardinality marks (`ends.ts`).
    metrics: erMetrics(units),
  };
  if (units.grid !== undefined) graph.grid = units.grid;
  return graph;
}
