/**
 * The model as v12 built it (`wardleyParser.ts` `populateDb`, `wardleyBuilder.ts`), from the
 * parsed statements. v12 populated its builder by category, not in source order: the title and
 * accessibility, `size`, `evolution`, anchors, components, notes, pipelines, links, evolves, the
 * annotations box, annotations, accelerators, deaccelerators. The categories are kept here, as
 * the order decides which node a link end resolves to, where a merged node sits and what a
 * pipeline child's visibility is.
 *
 * v12 threw at the first range error (or a pipeline naming no node) and drew nothing. Here each
 * is an error diagnostic with v12's message (R-PARSE-4), in source order once the parser sorts
 * them; the value is kept as 100, so one mistake gives one diagnostic and no other follows from
 * it. v12's silent drops warn (D425), and so do coordinates in (1, 2) (D428).
 */
import type {
  AstId,
  Diagnostics,
  Range,
  RelatedInfo,
  SourceView,
} from '@mermaid-js/core/parser-kit';
import { code as inCode } from '@mermaid-js/shared/parser/facet';
import { checkLimits, type WardleyLimitOptions } from './limits.ts';
import {
  WARDLEY_COORDINATE_AMBIGUOUS,
  WARDLEY_EVOLVE_PIPELINE_COMPONENT,
  WARDLEY_LINK_DROPPED,
  WARDLEY_OUT_OF_RANGE,
  WARDLEY_PIPELINE_REPLACED,
  WARDLEY_UNKNOWN_PARENT,
  WARDLEY_UNKNOWN_TARGET,
} from '../codes.ts';
import type {
  WardleyAccelerator,
  WardleyAnnotation,
  WardleyFlow,
  WardleyLink,
  WardleyModel,
  WardleyNode,
  WardleyNodeClass,
  WardleyNote,
  WardleyPipeline,
  WardleyStrategy,
  WardleyTrend,
} from '../model.ts';
import type {
  WardleyAcceleratorNode,
  WardleyAnchorNode,
  WardleyAnnotationNode,
  WardleyComponentNode,
  WardleyEvolutionNode,
  WardleyEvolveNode,
  WardleyLinkNode,
  WardleyNoteNode,
  WardleyNumber,
  WardleyPipelineComponentNode,
  WardleyPipelineNode,
  WardleyStatementNode,
} from './ast.ts';
import { displayText, toPercent } from './convert.ts';
import { astName, childId } from './ids.ts';

/** What the parser read, for {@link normalise}. */
export interface Parsed {
  /** The source text, which a warning quotes as drawn (`displayText`), and its view. */
  src: string;
  view: SourceView;
  /** The statements in source order (only the ones that parsed). */
  statements: readonly WardleyStatementNode[];
  /** Components of pipelines whose name failed to parse (no node; values still checked). */
  orphans: readonly WardleyPipelineComponentNode[];
  /** The last in-text values (`''` when none). */
  title: string;
  titleAstId: AstId | undefined;
  accTitle: string;
  accDescr: string;
  frontMatterTitle: string | undefined;
  /** The integrator's node and link caps (R-SEC-5). */
  limits: WardleyLimitOptions;
}

/** One node while the builder runs: v12's `WardleyNode`, keys set to `undefined` included. */
export interface NodeDraft {
  id: string;
  label: string;
  x: number;
  y: number;
  className?: WardleyNodeClass;
  labelOffsetX?: number;
  labelOffsetY?: number;
  inertia?: boolean;
  sourceStrategy?: WardleyStrategy;
  inPipeline?: boolean;
  isPipelineParent?: boolean;
}

/**
 * v12's builder node table (`WardleyBuilder` `addNode`, `getNode`, `resolveNodeId`): nodes by
 * id in first-insertion order, a later add merging into the earlier one.
 */
export class WardleyNodes {
  private readonly byId = new Map<string, NodeDraft>();
  /** Label → the first node id with that label, built on the first resolve after an add. */
  private byLabel: Map<string, string> | undefined;

  /**
   * v12 `addNode`: the new node's keys win (an `undefined` one too), except that the class and
   * label offsets fall back to the existing node's; the node keeps its first position.
   */
  add(node: NodeDraft): void {
    const existing: NodeDraft = this.byId.get(node.id) ?? {
      id: node.id,
      label: node.label,
      x: 0,
      y: 0,
    };
    this.byId.set(node.id, {
      ...existing,
      ...node,
      className: node.className ?? existing.className,
      labelOffsetX: node.labelOffsetX ?? existing.labelOffsetX,
      labelOffsetY: node.labelOffsetY ?? existing.labelOffsetY,
    });
    this.byLabel = undefined;
  }

  get(id: string): NodeDraft | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** v12 `resolveNodeId`: the id if a node has it, else the first node with that label, else the name. */
  resolve(name: string): string {
    if (this.byId.has(name)) return name;
    if (!this.byLabel) {
      const index = new Map<string, string>();
      for (const [id, n] of this.byId) if (!index.has(n.label)) index.set(n.label, id);
      this.byLabel = index;
    }
    return this.byLabel.get(name) ?? name;
  }

  values(): IterableIterator<NodeDraft> {
    return this.byId.values();
  }
}

/** A link as read, with what its D425 warning names. */
interface ReadLink {
  link: WardleyLink;
  range: Range;
  from: string;
  to: string;
  /** How the warning quotes the link: `from -> to`, or the source text when it has no arrow. */
  quoted: string;
}

/** One place a warning kind was raised. */
interface Raised {
  /** The warning's message when this place is the first. */
  message: string;
  /** Its `related` message otherwise. */
  also: string;
  range: Range;
  /** The AST id of the statement at this place (`''` for a component without a pipeline). */
  astId: AstId;
  /** A further place this one points at (the first `pipeline` a second one replaces). */
  extra?: { readonly info: RelatedInfo; readonly astId: AstId };
}

/** A statement with a position: `[visibility, evolution]` and its AST id. */
interface Positioned {
  readonly visibility: WardleyNumber;
  readonly evolution: WardleyNumber;
  readonly id: AstId;
}

/** v12 `getFlowFromPort`. */
function portFlow(port: string | undefined): WardleyFlow | undefined {
  if (port === '+<>') return 'bidirectional';
  if (port === '+<') return 'backward';
  if (port === '+>') return 'forward';
  return undefined;
}

/**
 * v12 `extractFlowFromArrow`: the label of a `+'…'` arrow, and its flow from the `<>`, `<` or
 * `>` anywhere in the arrow (the label's text included, as v12 tested the whole arrow).
 */
function arrowFlow(arrow: string | undefined): { flow?: WardleyFlow; label?: string } {
  if (!arrow?.startsWith('+')) return {};
  const q = arrow.charAt(1) === "'" ? arrow.indexOf("'", 2) : -1;
  const label = q > 0 ? arrow.slice(2, q) : undefined;
  if (arrow.includes('<>')) return { flow: 'bidirectional', label };
  if (arrow.includes('<')) return { flow: 'backward', label };
  if (arrow.includes('>')) return { flow: 'forward', label };
  return { label };
}

/**
 * Builds the model from the statements as v12's `populateDb` did, recording the semantic
 * errors and the D425/D428 warnings.
 */
class Populate {
  private readonly nodes = new WardleyNodes();
  private readonly raised = new Map<string, Raised[]>();
  /** A pipeline component's name → its first pipeline's parent, for the D745 warning. */
  private readonly childOf = new Map<string, string>();

  constructor(
    private readonly parsed: Parsed,
    private readonly diagnostics: Diagnostics
  ) {}

  run(): Omit<WardleyModel, 'warnings'> {
    const all = this.parsed.statements;
    const of = <K extends WardleyStatementNode['type']>(type: K) =>
      all.filter((s): s is Extract<WardleyStatementNode, { type: K }> => s.type === type);

    let size: WardleyModel['size'];
    for (const s of of('Size')) {
      size = { width: s.width.value, height: s.height.value, astId: s.id };
    }
    let evolution: WardleyModel['evolution'];
    for (const e of of('Evolution')) evolution = this.evolution(e);

    for (const a of of('Anchor')) this.anchor(a);
    for (const c of of('Component')) this.component(c);
    const notes = of('Note').map((n) => this.note(n));
    const pipelines = this.pipelines(of('Pipeline'));
    this.check(this.parsed.orphans);
    const read = of('Link').map((l) => this.link(l));
    const trends = this.trends(of('Evolve'));
    const box = of('Annotations')[0];
    const annotationsBox = box && {
      ...this.at(box, 'Annotations box'),
      astId: box.id,
    };
    const annotations = of('Annotation').map((a) => this.annotation(a));
    const accelerators: WardleyAccelerator[] = [];
    const deaccelerators: WardleyAccelerator[] = [];
    for (const a of all) {
      if (a.type === 'Accelerator') accelerators.push(this.accelerator(a, 'Accelerator'));
      else if (a.type === 'Deaccelerator')
        deaccelerators.push(this.accelerator(a, 'Deaccelerator'));
    }
    this.drops(read, pipelines);
    const links = read.map((r) => r.link);
    this.flush();

    const { title, titleAstId, frontMatterTitle } = this.parsed;
    const model: Omit<WardleyModel, 'warnings'> = {
      nodes: Object.freeze([...this.nodes.values()].map(freezeNode)),
      links: Object.freeze(links),
      trends: Object.freeze(trends),
      pipelines: Object.freeze(pipelines),
      notes: Object.freeze(notes),
      annotations: Object.freeze(annotations),
      ...(annotationsBox && { annotationsBox: Object.freeze(annotationsBox) }),
      accelerators: Object.freeze(accelerators),
      deaccelerators: Object.freeze(deaccelerators),
      ...(evolution && { evolution }),
      ...(size && { size: Object.freeze(size) }),
      accTitle: this.parsed.accTitle,
      accDescr: this.parsed.accDescr,
    };
    if (title !== '') return { ...model, title, ...(titleAstId && { titleAstId }) };
    if (frontMatterTitle) return { ...model, title: frontMatterTitle };
    return model;
  }

  // ---- values ---------------------------------------------------------------------------

  /**
   * v12 `toPercent`: a fraction up to 1, else a percentage; above 100 an error (kept as 100).
   * `astId` is the statement's, which a D428 warning names.
   */
  private percent(n: WardleyNumber, context: string, astId: AstId): number {
    const { value, range } = n;
    const { percent, fraction, inRange } = toPercent(value);
    if (!inRange) {
      this.diagnostics.error(
        WARDLEY_OUT_OF_RANGE,
        `${context} must be between 0-1 (decimal) or 0-100 (percentage). Received: ${value}`,
        range
      );
      return percent;
    }
    if (!fraction && value < 2) {
      this.raise(WARDLEY_COORDINATE_AMBIGUOUS, {
        message: `\`${value}\` is read as ${value} %, not as a fraction: only values up to 1 are fractions of the axis (\`1.0\` is 100 %). Write the fraction you meant, such as \`0.5\`, or a percentage of 2 or more.`,
        range,
        astId,
        also: `\`${value}\` is read as ${value} % too`,
      });
    }
    return percent;
  }

  /** v12 `toCoordinates`: `[visibility, evolution]` as `{ x: evolution, y: visibility }`. */
  private at(s: Positioned, context: string) {
    return {
      x: this.percent(s.evolution, `${context} evolution`, s.id),
      y: this.percent(s.visibility, `${context} visibility`, s.id),
    };
  }

  // ---- categories -----------------------------------------------------------------------

  private evolution(e: WardleyEvolutionNode): WardleyModel['evolution'] {
    const stages = e.stages.map((s) =>
      s.secondName ? `${s.name.value.trim()} / ${s.secondName.value.trim()}` : s.name.value.trim()
    );
    const boundaries: number[] = [];
    for (const s of e.stages) if (s.boundary) boundaries.push(s.boundary.value);
    return Object.freeze({
      stages: Object.freeze(stages),
      boundaries: Object.freeze(boundaries),
      astId: e.id,
    });
  }

  private anchor(a: WardleyAnchorNode): void {
    const name = a.name.value;
    const { x, y } = this.at(a, `Anchor "${name}"`);
    this.nodes.add({
      id: name,
      label: name,
      x,
      y,
      className: 'anchor',
      labelOffsetX: undefined,
      labelOffsetY: undefined,
      inertia: undefined,
      sourceStrategy: undefined,
    });
  }

  private component(c: WardleyComponentNode): void {
    const name = c.name.value;
    const { x, y } = this.at(c, `Component "${name}"`);
    this.nodes.add({
      id: name,
      label: name,
      x,
      y,
      className: 'component',
      labelOffsetX: c.label?.x,
      labelOffsetY: c.label?.y,
      inertia: c.inertia,
      sourceStrategy: c.strategy,
    });
  }

  private note(n: WardleyNoteNode): WardleyNote {
    return Object.freeze({
      text: n.text,
      ...this.at(n, `Note "${n.text}"`),
      astId: n.id,
    });
  }

  private pipelines(list: readonly WardleyPipelineNode[]): WardleyPipeline[] {
    const byParent = new Map<
      string,
      { nodeId: string; componentIds: string[]; astId: AstId; firstAstId: AstId; range: Range }
    >();
    for (const p of list) {
      const parent = p.parent.value;
      const parentNode = this.nodes.get(parent);
      if (!parentNode) {
        this.diagnostics.error(
          WARDLEY_UNKNOWN_PARENT,
          `Pipeline "${parent}" must reference an existing component with coordinates.`,
          p.parent.range
        );
        // v12 stopped here; the children's values are still checked (R-PARSE-4).
        this.check(p.children);
        continue;
      }
      const parentY = parentNode.y;
      const before = byParent.get(parent);
      if (before) {
        this.raise(WARDLEY_PIPELINE_REPLACED, {
          message: `A second \`pipeline ${parent}\` replaces the first one's components, which stay on the map outside the pipeline. Write one \`pipeline ${parent} { … }\` with all its components.`,
          range: p.parent.range,
          astId: p.id,
          also: `\`pipeline ${parent}\` repeated`,
          extra: {
            info: { message: `the first \`pipeline ${parent}\``, range: before.range },
            astId: before.firstAstId,
          },
        });
      }
      // v12 `startPipeline`: a new child list, at the first block's position.
      const pipeline = {
        nodeId: parent,
        componentIds: [] as string[],
        astId: p.id,
        firstAstId: p.id,
        range: p.parent.range,
      };
      if (before) {
        before.componentIds = pipeline.componentIds;
        before.astId = p.id;
      } else byParent.set(parent, pipeline);
      parentNode.isPipelineParent = true;
      const target = before ?? pipeline;
      for (const c of p.children) target.componentIds.push(this.child(parent, parentY, c));
    }
    return [...byParent.values()].map(({ nodeId, componentIds, astId }) =>
      Object.freeze({ nodeId, componentIds: Object.freeze(componentIds), astId })
    );
  }

  /** Adds one pipeline component at its parent's y; returns its node id. */
  private child(parent: string, parentY: number, c: WardleyPipelineComponentNode): string {
    const id = childId(parent, c.name.value);
    if (!this.childOf.has(c.name.value)) this.childOf.set(c.name.value, parent);
    const x = this.percent(c.evolution, `Pipeline component "${c.name.value}" evolution`, c.id);
    this.nodes.add({
      id,
      label: c.name.value,
      x,
      y: parentY,
      className: 'pipeline-component',
      labelOffsetX: c.label?.x,
      labelOffsetY: c.label?.y,
      inertia: undefined,
      sourceStrategy: undefined,
    });
    const child = this.nodes.get(id);
    if (child) child.inPipeline = true;
    return id;
  }

  /** Range checks of pipeline components that add no node (their parent is unknown or failed). */
  private check(children: readonly WardleyPipelineComponentNode[]): void {
    for (const c of children) {
      this.percent(c.evolution, `Pipeline component "${c.name.value}" evolution`, c.id);
    }
  }

  private link(l: WardleyLinkNode): ReadLink {
    const arrow = l.arrow;
    const dashed = !!arrow && (arrow.includes('-.->') || arrow.includes('.-.'));
    const fromArrow = arrowFlow(arrow);
    const flow = portFlow(l.fromPort) ?? portFlow(l.toPort) ?? fromArrow.flow;
    const label = fromArrow.label ?? l.linkLabel;
    const link: WardleyLink = Object.freeze({
      source: this.nodes.resolve(l.from.value),
      target: this.nodes.resolve(l.to.value),
      dashed,
      ...(label !== undefined && { label }),
      ...(flow && { flow }),
      astId: l.id,
    });
    const { src, view } = this.parsed;
    const quoted = arrow
      ? `${l.from.value} -> ${l.to.value}`
      : displayText(src, l.range.start, l.range.end, view).trim();
    return { link, range: l.range, from: l.from.value, to: l.to.value, quoted };
  }

  private trends(list: readonly WardleyEvolveNode[]): WardleyTrend[] {
    const byNode = new Map<string, WardleyTrend>();
    for (const e of list) {
      const name = e.name.value;
      const node = this.nodes.get(name);
      if (!node) {
        this.skipped(e);
        continue;
      }
      const targetX = this.percent(e.target, `Evolve target for "${name}"`, e.id);
      byNode.set(name, Object.freeze({ nodeId: name, targetX, targetY: node.y, astId: e.id }));
    }
    return [...byNode.values()];
  }

  /**
   * D425, D745: an `evolve` naming no node is skipped. A pipeline component's name gets its own
   * warning, as it names a component that exists (v12 found a child by its id only).
   */
  private skipped(e: WardleyEvolveNode): void {
    const name = e.name.value;
    const parent = this.childOf.get(name);
    const place = { range: e.name.range, astId: e.id };
    if (parent === undefined) {
      this.raise(WARDLEY_UNKNOWN_TARGET, {
        ...place,
        message: `\`evolve ${name}\` names no anchor or component, so it draws nothing. Name a component by its name as written.`,
        also: `\`evolve ${name}\` names no node either`,
      });
      return;
    }
    this.raise(WARDLEY_EVOLVE_PIPELINE_COMPONENT, {
      ...place,
      message: `\`${name}\` is a pipeline component of \`${parent}\`; it can't evolve by its name. Use its id \`${childId(parent, name)}\`.`,
      also: `\`${name}\` is a pipeline component of \`${parent}\` too; use its id \`${childId(parent, name)}\``,
    });
  }

  private annotation(a: WardleyAnnotationNode): WardleyAnnotation {
    const n = a.number.value;
    return Object.freeze({
      number: n,
      ...this.at(a, `Annotation ${n}`),
      text: a.text,
      astId: a.id,
    });
  }

  private accelerator(a: WardleyAcceleratorNode, context: string): WardleyAccelerator {
    const name = a.name.value;
    return Object.freeze({
      name,
      ...this.at(a, `${context} "${name}"`),
      astId: a.id,
    });
  }

  // ---- warnings -------------------------------------------------------------------------

  /**
   * D425: a link not drawn because an end names no node, because it links a node to itself, or
   * because its ends are at the same place (v12 drew NaN; #490). Parents whose pipeline moves
   * them are left out of the last: their place is the layout's, which raises the warning when
   * none is raised here.
   */
  private drops(links: readonly ReadLink[], pipelines: readonly WardleyPipeline[]): void {
    const moved = new Set(pipelines.filter((p) => p.componentIds.length > 0).map((p) => p.nodeId));
    const children = new Map(pipelines.map((p) => [p.nodeId, new Set(p.componentIds)]));
    const together = (a: string, b: string): boolean => {
      const s = this.nodes.get(a);
      const t = this.nodes.get(b);
      if (!s || !t || moved.has(a) || moved.has(b) || children.get(b)?.has(a)) return false;
      return s.x === t.x && s.y === t.y;
    };
    for (const { link, range, from, to, quoted } of links) {
      const unknown: string[] = [];
      if (!this.nodes.has(link.source)) unknown.push(inCode(from));
      if (!this.nodes.has(link.target) && to !== from) unknown.push(inCode(to));
      let why: string | undefined;
      if (unknown.length > 0) {
        why = `${unknown.join(' and ')} ${unknown.length > 1 ? 'name' : 'names'} no anchor or component`;
      } else if (link.source === link.target) why = `it links ${inCode(from)} to itself`;
      else if (together(link.source, link.target))
        why = `${inCode(from)} and ${inCode(to)} are at the same place`;
      if (!why) continue;
      this.raise(WARDLEY_LINK_DROPPED, {
        message: `The link ${inCode(quoted)} is not drawn: ${why}.`,
        range,
        astId: link.astId,
        also: `the link ${inCode(quoted)} is not drawn either: ${why}`,
      });
    }
  }

  /** Record a place for the warning of `code`. */
  private raise(code: string, place: Raised): void {
    const list = this.raised.get(code);
    if (list) list.push(place);
    else this.raised.set(code, [place]);
  }

  /**
   * One warning per kind (D425, D428): at its first place in the text, the others in
   * `related`. v12's categories are not in source order, so the places are sorted first. The
   * warning also names the AST ids of its places, in the same order and each once, which
   * `render()` reports (`Warning.astIds`; it keeps no ranges).
   */
  private flush(): void {
    for (const [code, list] of this.raised) {
      list.sort((a, b) => a.range.start - b.range.start);
      const [first, ...rest] = list;
      if (!first) continue;
      const related: RelatedInfo[] = [];
      const ids = [first.astId];
      for (const r of list) {
        if (!r.extra) continue;
        related.push(r.extra.info);
        ids.push(r.extra.astId);
      }
      for (const r of rest) {
        related.push({ message: r.also, range: r.range });
        ids.push(r.astId);
      }
      const d = this.diagnostics.warning(
        code,
        first.message,
        first.range,
        related.length > 0 ? { related } : undefined
      );
      const astIds: readonly AstId[] = [...new Set(ids.filter((id) => id !== ''))];
      Object.assign(d, { astIds });
    }
  }
}

function freezeNode(n: NodeDraft): WardleyNode {
  const node: WardleyNode = {
    id: n.id,
    label: n.label,
    x: n.x,
    y: n.y,
    className: n.className ?? 'component',
    ...(n.labelOffsetX !== undefined && { labelOffsetX: n.labelOffsetX }),
    ...(n.labelOffsetY !== undefined && { labelOffsetY: n.labelOffsetY }),
    inertia: n.inertia === true,
    ...(n.sourceStrategy && { sourceStrategy: n.sourceStrategy }),
    inPipeline: n.inPipeline === true,
    isPipelineParent: n.isPipelineParent === true,
    astId: astName('node', n.id),
  };
  return Object.freeze(node);
}

/** The model of the parsed statements, as v12 populated its builder. */
export function normalise(
  parsed: Parsed,
  diagnostics: Diagnostics
): Omit<WardleyModel, 'warnings'> {
  checkLimits(parsed.statements, parsed.limits, diagnostics);
  return new Populate(parsed, diagnostics).run();
}
