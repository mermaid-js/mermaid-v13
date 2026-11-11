/**
 * The flow family's model builder base: what v12's `FlowDB` did with the statements every
 * dialect has (links, `linkStyle`, `classDef`, `class`, `click`, the direction and the
 * accessibility fields), in v12's order. Ported from Pele's `src/diagrams/flowchart/db.ts` at
 * 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano) and checked against
 * v12.2's `flowDb.ts`. A diagram's builder extends {@link FlowBuilderBase} with its vertices
 * and containers (`addVertex`, subgraphs or flows) and builds its model.
 *
 * Differences from v12's FlowDB: text is kept as written (no sanitising: that happens when SVG
 * is written), links keep the URL as written (checked at render time), callbacks are recorded
 * instead of bound, and errors are diagnostics instead of exceptions.
 */
// cspell:words kepano
import { LIMIT_CODES } from '@mermaid-js/core/limits';
import type { AstId, Range } from '@mermaid-js/core/parser-kit';
import type { FlowLabelType } from './flow-ast.ts';
import type { FlowLinkInfo, FlowLinkParts } from './flow-parser-base.ts';

/** What the base reads and writes of a vertex. */
export interface FlowVertexRecord {
  ast: AstId;
  classes: string[];
  /** `click` URL as written (trimmed). Checked against `securityLevel` when SVG is written. */
  link?: string;
  linkTarget?: string;
}

/** An edge of the model, as every dialect has it. */
export interface FlowEdgeRecord {
  /** Model id: the user's `id@` or `L_<start>_<end>_<n>`. */
  id: string;
  ast: AstId;
  isUserDefinedId: boolean;
  start: string;
  end: string;
  type: string;
  stroke: string;
  length?: number;
  text: string;
  labelType: FlowLabelType;
  classes: string[];
  style?: string[];
  interpolate?: string;
  animate?: boolean;
  animation?: string;
}

export interface FlowClassRecord {
  id: string;
  styles: string[];
  textStyles: string[];
}

/** A `click … href`/URL statement. */
export interface FlowLinkRecord {
  /** Vertex id. */
  id: string;
  url: string;
  target?: string;
  range: Range;
}

/** A `click … callback` or `call` statement. */
export interface FlowCallbackRecord {
  /** Vertex id. */
  id: string;
  name: string;
  args?: string;
  range: Range;
}

export interface FlowBuilderOptions {
  maxEdges: number;
  maxNodes: number;
  inheritDir: boolean;
  error(code: string, message: string, range: Range): void;
  warn(code: string, message: string, range: Range): void;
}

/** A `labelType` as v12 read it: anything but `text` and `string` is markdown. */
export function flowLabelType(type: unknown): FlowLabelType {
  return type === 'markdown' || type === 'string' || type === 'text' ? type : 'markdown';
}

/** `text` without the quotes around it, if it has both. */
export function unquoteLabel(text: string): string {
  return text.startsWith('"') && text.endsWith('"') ? text.substring(1, text.length - 1) : text;
}

/** How often the character `ch` is in `str`. */
export function countChar(ch: string, str: string): number {
  let count = 0;
  for (const c of str) if (c === ch) count++;
  return count;
}

/**
 * Collects what every dialect's model has, in v12 FlowDB order. `V` and `E` are the dialect's
 * vertex and edge records, `L` what its `destructLink` returns.
 */
export abstract class FlowBuilderBase<
  V extends FlowVertexRecord,
  E extends FlowEdgeRecord,
  L extends FlowLinkInfo,
  O extends FlowBuilderOptions,
> {
  direction = 'TB';
  readonly vertices = new Map<string, V>();
  readonly edges: E[] = [];
  readonly classes = new Map<string, FlowClassRecord>();
  readonly tooltips = new Map<string, string>();
  readonly links: FlowLinkRecord[] = [];
  readonly callbacks: FlowCallbackRecord[] = [];
  defaultInterpolate: string | undefined;
  defaultStyle: string[] | undefined;
  accTitle = '';
  accDescr = '';
  protected readonly edgeById = new Map<string, E>();
  /** Edges so far per start, then per end. */
  private readonly pairCount = new Map<string, Map<string, number>>();
  /** Limits already reported, so a breach is one diagnostic, not one per item. */
  private readonly limitHit = new Set<'edges' | 'nodes'>();

  constructor(protected readonly options: O) {}

  // ---- what a dialect writes ----------------------------------------------------------

  /**
   * The dialect's edge record from the family's, once its type, stroke and length are set: what
   * `info` says besides goes on it here.
   */
  protected abstract edgeOf(edge: FlowEdgeRecord, info: L): E;

  /** The container (a subgraph, a flow) with the id `id`, which `class` and `click` may name. */
  protected abstract container(id: string): { classes: string[] } | undefined;

  /** What to say of `linkStyle <pos>` when no edge has that number. */
  protected abstract noEdgeAt(pos: string): string;

  // ---- vertices -----------------------------------------------------------------------

  /**
   * Whether the diagram is at its node limit, so a new vertex (mentioned at `at`) is not made;
   * the breach is reported once.
   */
  protected atNodeLimit(at: Range): boolean {
    if (this.vertices.size < this.options.maxNodes) return false;
    if (!this.limitHit.has('nodes')) {
      this.limitHit.add('nodes');
      this.options.error(
        LIMIT_CODES.maxNodes,
        `Node limit exceeded: the diagram has more than ${this.options.maxNodes} nodes. The limit is set by the page or app that renders the diagram.`,
        at
      );
    }
    return true;
  }

  // ---- edges --------------------------------------------------------------------------

  /** Whether `id` names an edge (`id@`), which v12 never turns into a vertex. */
  hasEdge(id: string): boolean {
    return this.edgeById.has(id);
  }

  /** The edge `id` names (the first one given it), if any. */
  edgeNamed(id: string): E | undefined {
    return this.edgeById.get(id);
  }

  // An edge's `@{…}` keys, typed: anything else is dropped with a warning rather than reaching
  // the model as the wrong type (an `animation` of free text would land in the class list).
  protected edgeData(edge: E, doc: Readonly<Record<string, unknown>>, at: Range): void {
    const drop = (key: string, want: string) => {
      this.options.warn(
        'EDGE_DATA_DROPPED',
        `Edge ${JSON.stringify(edge.id)}: ${key} must be ${want}; ${JSON.stringify(doc[key])} was ignored.`,
        at
      );
    };
    const { animate, animation, curve } = doc;
    if (animate !== undefined) {
      if (typeof animate === 'boolean') edge.animate = animate;
      else if (animate === 'true' || animate === 'false') edge.animate = animate === 'true';
      else drop('animate', 'true or false');
    }
    if (animation !== undefined) {
      if (animation === 'fast' || animation === 'slow') edge.animation = animation;
      else drop('animation', 'fast or slow');
    }
    if (curve !== undefined) {
      if (typeof curve === 'string') edge.interpolate = curve;
      else drop('curve', 'a curve name');
    }
  }

  private addSingleLink(parts: {
    start: string;
    end: string;
    info: L;
    /** The user's id, when this edge takes it. */
    id: string | undefined;
    ast: AstId;
  }): void {
    const { start, end, info, id, ast } = parts;
    const record: FlowEdgeRecord = {
      id: '',
      ast,
      isUserDefinedId: false,
      start,
      end,
      type: info.type,
      stroke: info.stroke,
      text: '',
      labelType: 'text',
      classes: [],
    };
    if (info.length !== undefined) record.length = info.length > 10 ? 10 : info.length;
    const edge = this.edgeOf(record, info);
    if (this.defaultInterpolate !== undefined) edge.interpolate = this.defaultInterpolate;
    if (info.text !== undefined) {
      edge.text = unquoteLabel(info.text.text.trim());
      edge.labelType = flowLabelType(info.text.type);
    }
    let ends = this.pairCount.get(start);
    if (!ends) this.pairCount.set(start, (ends = new Map<string, number>()));
    const count = ends.get(end) ?? 0;
    if (id && !this.edgeById.has(id)) {
      edge.id = id;
      edge.isUserDefinedId = true;
    } else edge.id = `L_${start}_${end}_${count === 0 ? 0 : count + 1}`;
    this.edges.push(edge);
    ends.set(end, count + 1);
    if (!this.edgeById.has(edge.id)) this.edgeById.set(edge.id, edge);
  }

  /** v12 `addLink`: every start to every end; the user id goes to the last-start/first-end pair. */
  addLink(parts: FlowLinkParts<L>): void {
    const { starts, ends, info, astFor, at } = parts;
    if (this.limitHit.has('edges')) return;
    // Checked before making any: `A & … --> B & …` multiplies, so one short line can ask for
    // millions of edges (v12 checked one edge at a time).
    const max = this.options.maxEdges;
    const wanted = this.edges.length + starts.length * ends.length;
    if (wanted > max) {
      this.limitHit.add('edges');
      this.options.error(
        LIMIT_CODES.maxEdges,
        `Edge limit exceeded: the diagram asks for ${wanted} edges, but the limit is ${max}. The limit is set by the page or app that renders the diagram.`,
        at
      );
      return;
    }
    const id = info.id?.replace('@', '');
    const lastStart = starts[starts.length - 1];
    const firstEnd = ends[0];
    for (const start of starts) {
      for (const end of ends) {
        const own = start === lastStart && end === firstEnd ? id : undefined;
        this.addSingleLink({ start, end, info, id: own, ast: astFor(start, end) });
      }
    }
  }

  /** v12 indexed `edges[pos]` with the index text, so only canonical integers hit an edge. */
  private edgeAt(pos: string, at: Range): E | undefined {
    const edge = /^(?:0|[1-9]\d*)$/.test(pos) ? this.edges[Number(pos)] : undefined;
    if (!edge) this.options.error('LINK_STYLE_INDEX', this.noEdgeAt(pos), at);
    return edge;
  }

  /** v12 `updateLinkInterpolate`; returns false (after reporting) for a missing edge. */
  updateLinkInterpolate(positions: string[], interpolate: string, at: Range): boolean {
    for (const pos of positions) {
      if (pos === 'default') this.defaultInterpolate = interpolate;
      else {
        const edge = this.edgeAt(pos, at);
        if (!edge) return false;
        edge.interpolate = interpolate;
      }
    }
    return true;
  }

  /** v12 `updateLink`; returns false (after reporting) for a missing edge. */
  updateLink(positions: string[], style: string[], at: Range): boolean {
    for (const pos of positions) {
      if (pos === 'default') {
        this.defaultStyle = style;
        continue;
      }
      const edge = this.edgeAt(pos, at);
      if (!edge) return false;
      edge.style = style;
      if (style.length > 0 && !style.some((s) => s.startsWith('fill'))) style.push('fill:none');
    }
    return true;
  }

  // ---- classes, clicks and the rest ---------------------------------------------------

  addClass(ids: string, styles: string[]): void {
    const style = styles
      .join()
      .replace(/\\,/g, '§§§')
      .replace(/,/g, ';')
      .replace(/§§§/g, ',')
      .split(';');
    for (const id of ids.split(',')) {
      let def = this.classes.get(id);
      if (def === undefined) {
        def = { id, styles: [], textStyles: [] };
        this.classes.set(id, def);
      }
      for (const s of style) {
        if (s.includes('color')) def.textStyles.push(s.replace('fill', 'bgFill'));
        def.styles.push(s);
      }
    }
  }

  setDirection(dir: string): void {
    let d = dir.trim();
    if (d.includes('<')) d = 'RL';
    if (d.includes('^')) d = 'BT';
    if (d.includes('>')) d = 'LR';
    if (d.includes('v')) d = 'TB';
    if (d === 'TD') d = 'TB';
    this.direction = d;
  }

  setClass(ids: string, className: string): void {
    for (const id of ids.split(',')) {
      this.vertices.get(id)?.classes.push(className);
      this.edgeById.get(id)?.classes.push(className);
      this.container(id)?.classes.push(className);
    }
  }

  setTooltip(ids: string, tooltip: string): void {
    for (const id of ids.split(',')) this.tooltips.set(id, tooltip);
  }

  setLink(ids: string, url: string, at: Range, target?: string): void {
    const trimmed = url.trim();
    for (const id of ids.split(',')) {
      this.links.push(
        target === undefined
          ? { id, url: trimmed, range: at }
          : { id, url: trimmed, target, range: at }
      );
      const vertex = this.vertices.get(id);
      if (vertex !== undefined) {
        vertex.link = trimmed;
        if (target === undefined) delete vertex.linkTarget;
        else vertex.linkTarget = target;
      }
    }
    this.setClass(ids, 'clickable');
  }

  setClickEvent(ids: string, name: string, at: Range, args?: string): void {
    for (const id of ids.split(',')) {
      this.callbacks.push(
        args === undefined ? { id, name, range: at } : { id, name, args, range: at }
      );
    }
    this.setClass(ids, 'clickable');
  }

  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/g, '');
  }

  setAccDescription(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }
}
