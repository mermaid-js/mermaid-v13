/**
 * The state model (DESIGN §4.2, R-ARCH-7) and its builder. The parser hands the builder v12's
 * statement tree (the values `stateDiagram.jison`'s actions build); the builder reproduces what
 * v12's `StateDB` made of it, one step per v12 method, so the model is what v12 drew:
 *
 * 1. `docTranslator`: `[*]` becomes `<scope>_start` or `<scope>_end` (scope: the composite or
 *    region it is written in, `root` at the top level), and the statements of a composite with
 *    `--` are split into regions;
 * 2. `extract`, over the top-level statements only: the state table that `classDef`, `class`,
 *    `style` and `click` act on (v12 ignores them inside composites);
 * 3. `dataFetcher`: the walk over the tree that makes v12's graph, with one node per state id
 *    across all composites, its descriptions in order and its last parent (never itself or a
 *    state inside it, #688).
 *
 * Every collection keeps insertion order.
 */
import { checkLimit } from '@mermaid-js/core/limits';
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

export type StateDirection = 'TB' | 'BT' | 'RL' | 'LR';

export type StateKind =
  | 'plain'
  | 'choice'
  | 'fork'
  | 'join'
  | 'start'
  | 'end'
  | 'composite'
  /** An embedded diagram block (ADR-15): `mermaid id["Title"] { … }`. */
  | 'embed';

/** One state: a node of the diagram. */
export interface StateNode {
  /** The id v12 gives it: the name as written, or `<scope>_start` / `<scope>_end` for `[*]`. */
  id: string;
  /** AST id of its first mention (a composite: of its first `state X { … }`). */
  ast: AstId;
  kind: StateKind;
  /** The label lines as written (`state "…" as X`, `X : …`); empty: the label is the id. */
  descriptions: string[];
  /** The composite or region it is drawn in; undefined at the top level. */
  parent?: string;
  /** Classes from `class` and `:::` (top-level statements only, as in v12). */
  classes: string[];
  /** Styles from `style` statements (top-level only). */
  styles: string[];
  /** A composite's `direction`, when it sets one. */
  dir?: StateDirection;
  /** An embedded diagram block's title (ADR-15); absent for an untitled block. */
  title?: string;
  /** A folded block (`id@{ view: collapsed }`, #670): drawn without its diagram. */
  folded?: boolean;
}

/** A concurrency region: the part of a composite between `--` separators. */
export interface StateRegion {
  /** `<composite>:region<k>`, k from 1. */
  id: string;
  /** `r:<composite>#<k>`. */
  ast: AstId;
  /** The composite. */
  parent: string;
  dir?: StateDirection;
}

export interface StateTransition {
  /** `edge<n>`, as v12 numbered them. */
  id: string;
  ast: AstId;
  from: string;
  to: string;
  /** The text after `:`; empty for none. */
  label: string;
}

export interface StateNote {
  ast: AstId;
  /** The state it is attached to. */
  target: string;
  side: 'left' | 'right';
  text: string;
}

export interface StateClass {
  id: string;
  styles: string[];
  /** v12's text styles: `color` attributes, read as the label's `fill`. */
  textStyles: string[];
}

/** `click <state> "url" "tooltip"` / `click <state> href "url"`. */
export interface StateLink {
  ast: AstId;
  id: string;
  /** The url as written, without its quotes. */
  url: string;
  /** The tooltip without its quotes; empty for none. */
  tooltip: string;
}

export interface StateModel {
  /** Top-level `direction` (the last one), `TB` by default. */
  direction: StateDirection;
  states: StateNode[];
  regions: StateRegion[];
  transitions: StateTransition[];
  notes: StateNote[];
  classes: StateClass[];
  links: StateLink[];
  /** The front-matter `title`, drawn above the diagram (D652); absent when there is none. */
  title?: string;
  accTitle: string;
  accDescr: string;
  warnings: Diagnostic[];
}

// ---- the statement tree (v12's `Stmt`, with AST ids) -----------------------------------

/** v12's state types; `undefined` is what a note statement carries. */
export type ItemType = 'default' | 'fork' | 'join' | 'choice' | 'divider' | undefined;

export interface StateItem {
  stmt: 'state';
  id: string;
  type: ItemType;
  description?: string | string[];
  doc?: Item[];
  note?: { position: string; text: string; ast: AstId };
  classes?: string[];
  /** Set by the translation: a `[*]` read as a start (true) or an end (false). */
  start?: boolean;
  /** AST id of this mention (a `--`: of the region it closes). */
  ast: AstId;
  /** A `--`: the ordinal of the region it closes within its composite. */
  region?: number;
  /** A composite split by `--`: its last region's AST id and ordinal. */
  tail?: { ast: AstId; region: number };
  /** An embedded diagram block (ADR-15), with its title; `folded` by `@{ view: collapsed }`. */
  embed?: { title?: string; folded?: boolean };
  range: Range;
}

export interface RelationItem {
  stmt: 'relation';
  state1: StateItem;
  state2: StateItem;
  description?: string;
  ast: AstId;
}

export type Item =
  | StateItem
  | RelationItem
  | { stmt: 'classDef'; id: string; classes: string }
  | { stmt: 'style'; id: string; styleClass: string }
  | { stmt: 'applyClass'; id: string; styleClass: string }
  | { stmt: 'dir'; value: StateDirection }
  | { stmt: 'click'; id: StateItem; url: string; tooltip: string; ast: AstId }
  /** A statement whose jison action returned a string, which v12 ignores (it still counts). */
  | { stmt: 'noop' };

// ---- building -------------------------------------------------------------------------

interface TableEntry {
  classes: string[];
  styles: string[];
}

/** v12's `nodeDb` record of one id. */
interface GraphNode {
  id: string;
  ast: AstId;
  range: Range;
  shape: string | undefined;
  description: string | string[];
  isGroup: boolean;
  region: boolean;
  dir?: StateDirection;
  parent?: string;
  classes: string[];
  styles: string[];
  /** An embedded diagram block (ADR-15), with its title; `folded` by `@{ view: collapsed }`. */
  embed?: { title?: string; folded?: boolean };
  /** Whether a mention gave it content of its own: a description or statements. */
  content?: boolean;
}

const START = '[*]';
const GROUP = 'roundedWithTitle';
const WITH_DESC = 'rectWithTitle';
const RECT = 'rect';
const DIVIDER = 'divider';

const KINDS: Readonly<Record<string, StateKind>> = {
  stateStart: 'start',
  stateEnd: 'end',
  fork: 'fork',
  join: 'join',
  choice: 'choice',
};

export interface BuildContext {
  error(code: string, message: string, range: Range): void;
  warn(code: string, message: string, range: Range): void;
  /** State cap (core `DEFAULT_LIMITS.maxNodes`): start and end dots, forks and choices count. */
  maxNodes?: number | undefined;
  /** Transition cap (core `DEFAULT_LIMITS.maxEdges`). */
  maxEdges?: number | undefined;
}

/** A region's model id. */
export function regionId(composite: string, k: number): string {
  return `${composite}:region${k}`;
}

/** v12's `getDir`: the last `direction` among the statements, if any. */
function dirOf(doc: readonly Item[] | undefined): StateDirection | undefined {
  let dir: StateDirection | undefined;
  for (const item of doc ?? []) if (item.stmt === 'dir') dir = item.value;
  return dir;
}

/** `s` without the `"` runs at its ends: `/^"+|"+$/g`, scanned (R-PARSE-7). */
function unquote(s: string): string {
  let from = 0;
  let to = s.length;
  while (from < to && s[from] === '"') from++;
  while (to > from && s[to - 1] === '"') to--;
  return s.slice(from, to);
}

/** Builds the {@link StateModel} from the top-level statements. One per parse. */
export class StateBuilder {
  private readonly table = new Map<string, TableEntry>();
  private readonly classes = new Map<string, StateClass>();
  private readonly links: StateLink[] = [];
  private readonly nodes: GraphNode[] = [];
  private readonly records = new Map<string, GraphNode>();
  private readonly regions: StateRegion[] = [];
  private readonly transitions: StateTransition[] = [];
  private readonly notes: StateNote[] = [];
  private edgeCount = 0;
  /** States made so far that the model draws, for the `maxNodes` cap. */
  private states = 0;
  private emptyRegionWarned = false;
  private accTitle = '';
  private accDescr = '';

  constructor(private readonly ctx: BuildContext) {}

  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/g, '');
  }

  setAccDescr(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }

  build(root: Item[]): StateModel {
    const top: StateItem = {
      stmt: 'state',
      id: 'root',
      type: 'default',
      doc: root,
      ast: 'doc',
      range: { start: 0, end: 0 },
    };
    this.translate('root', top, true);
    this.extract(top.doc ?? []);
    this.fetch(top);
    const states: StateNode[] = [];
    for (const n of this.nodes) {
      if (n.region) continue;
      const lines = typeof n.description === 'string' ? [n.description] : n.description;
      if (n.isGroup && lines.length > 1) {
        this.ctx.error(
          'COMPOSITE_DESCRIPTION',
          `A composite state takes one description, and \`${n.id}\` has ${lines.length}: remove the extra ones.`,
          n.range
        );
      }
      let kind: StateKind = n.isGroup ? 'composite' : (KINDS[n.shape ?? ''] ?? 'plain');
      if (n.embed) kind = 'embed';
      const state: StateNode = {
        id: n.id,
        ast: n.ast,
        kind,
        descriptions: lines.length === 1 && lines[0] === n.id ? [] : [...lines],
        classes: n.classes,
        styles: n.styles,
      };
      if (n.parent !== undefined) state.parent = n.parent;
      if (n.isGroup && n.dir !== undefined) state.dir = n.dir;
      if (n.embed?.title !== undefined) state.title = n.embed.title;
      if (n.embed?.folded) state.folded = true;
      states.push(state);
    }
    return {
      direction: dirOf(root) ?? 'TB',
      states,
      regions: this.regions,
      transitions: this.transitions,
      notes: this.notes,
      classes: [...this.classes.values()],
      links: this.links,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings: [],
    };
  }

  /** v12 `docTranslator`. `scope` is the id of the composite or region `item` is written in. */
  private translate(scope: string, item: Item, first: boolean): void {
    if (item.stmt === 'relation') {
      this.translate(scope, item.state1, true);
      this.translate(scope, item.state2, false);
      return;
    }
    if (item.stmt !== 'state') return;
    if (item.id === START) {
      item.id = scope + (first ? '_start' : '_end');
      item.start = first;
    } else item.id = item.id.trim();
    if (!item.doc) return;
    const regions: StateItem[] = [];
    let current: Item[] = [];
    for (const stmt of item.doc) {
      if (stmt.stmt === 'state' && stmt.type === DIVIDER) {
        regions.push({ ...stmt, doc: current });
        current = [];
      } else current.push(stmt);
    }
    if (regions.length > 0 && current.length > 0) {
      const last = regions[regions.length - 1] as StateItem;
      regions.push({
        ...last,
        doc: current,
        ast: item.tail?.ast ?? last.ast,
        region: item.tail?.region ?? regions.length + 1,
      });
      regions.forEach((r, k) => (r.id = regionId(item.id, r.region ?? k + 1)));
      item.doc = regions;
    } else if (regions.length > 0) {
      // v12 splits nothing when the last region is empty and draws each `--` as a stray node.
      // D115: drop them and warn, once per diagram.
      if (!this.emptyRegionWarned) {
        this.emptyRegionWarned = true;
        this.ctx.warn(
          'EMPTY_REGION',
          'A `--` separator needs states after it: a composite state whose last region is empty is drawn without regions.',
          regions[regions.length - 1]?.range ?? item.range
        );
      }
      item.doc = item.doc.filter((s) => !(s.stmt === 'state' && s.type === DIVIDER));
    }
    for (const stmt of item.doc) this.translate(item.id, stmt, true);
  }

  /** v12 `addState`, for the state table. */
  private addState(id: string, classes?: readonly string[]): TableEntry {
    const key = id.trim();
    let s = this.table.get(key);
    if (!s) this.table.set(key, (s = { classes: [], styles: [] }));
    for (const c of classes ?? []) this.setCssClass(key, c.trim());
    return s;
  }

  /** v12 `setCssClass`. */
  private setCssClass(ids: string, cls: string): void {
    for (const id of ids.split(',')) (this.table.get(id) ?? this.addState(id)).classes.push(cls);
  }

  /** v12 `extract`: the top-level statements fill the state table, classes and links. */
  private extract(root: readonly Item[]): void {
    for (const item of root) {
      switch (item.stmt) {
        case 'state':
          this.addState(item.id);
          this.classNotApplied(item, undefined);
          if (item.doc && item.type !== DIVIDER) this.classesInside(item.doc, item.id);
          break;
        case 'relation':
          this.addState(item.state1.id, item.state1.classes);
          this.addState(item.state2.id, item.state2.classes);
          break;
        case 'classDef':
          this.addStyleClass(item.id.trim(), item.classes);
          break;
        case 'style': {
          const styles = item.styleClass.split(',').map((x) => x.replace(/;/g, '').trim());
          for (const id of item.id.trim().split(',')) {
            (this.table.get(id) ?? this.addState(id)).styles = [...styles];
          }
          break;
        }
        case 'applyClass':
          this.setCssClass(item.id.trim(), item.styleClass);
          break;
        case 'click':
          this.links.push({
            ast: item.ast,
            id: item.id.id,
            url: unquote(item.url),
            tooltip: unquote(item.tooltip),
          });
          break;
        case 'dir':
        case 'noop':
          break;
      }
    }
  }

  /**
   * `A:::cls` that sets no class (D128): v12's `extract` applies `:::`
   * only from a transition at the top level, so a state written on its own and any `:::` inside
   * a composite do nothing. Rendering is unchanged (v12 parity); only the warning is new.
   */
  private classNotApplied(item: StateItem, composite: string | undefined): void {
    const cls = item.classes?.[0];
    if (cls === undefined) return;
    const where = composite
      ? `inside composite state \`${composite}\``
      : 'on a state written on its own';
    this.ctx.warn(
      'CLASS_NOT_APPLIED',
      `\`:::${cls}\` ${where} sets no class (v12 ignores it too): use it in a top-level transition, or write \`class ${item.id} ${cls}\` at the top level.`,
      item.range
    );
  }

  /** Every `:::` inside composite `composite` (regions included), which v12 ignores. */
  private classesInside(doc: readonly Item[], composite: string): void {
    for (const stmt of doc) {
      if (stmt.stmt === 'relation') {
        this.classNotApplied(stmt.state1, composite);
        this.classNotApplied(stmt.state2, composite);
      } else if (stmt.stmt === 'state') {
        this.classNotApplied(stmt, composite);
        if (stmt.doc) this.classesInside(stmt.doc, stmt.type === DIVIDER ? composite : stmt.id);
      }
    }
  }

  /** v12 `addStyleClass`. */
  private addStyleClass(id: string, attributes: string): void {
    let c = this.classes.get(id);
    if (!c) this.classes.set(id, (c = { id, styles: [], textStyles: [] }));
    if (!attributes) return;
    for (const attrib of attributes.split(',')) {
      const fixed = attrib.replace(/([^;]*);/, '$1').trim();
      if (attrib.includes('color')) {
        c.textStyles.push(fixed.replace('fill', 'bgFill').replace('color', 'fill'));
      }
      c.styles.push(fixed);
    }
  }

  /** v12 `dataFetcher` with `setupDoc`: the walk that makes the graph. */
  private fetch(item: StateItem, parent?: StateItem): void {
    if (item.id !== 'root') this.node(item, parent);
    for (const stmt of item.doc ?? []) {
      if (stmt.stmt === 'state') this.fetch(stmt, item);
      else if (stmt.stmt === 'relation') {
        this.fetch(stmt.state1, item);
        this.fetch(stmt.state2, item);
        const range = { start: stmt.state1.range.start, end: stmt.state2.range.end };
        this.transitions.push({
          id: `edge${this.edgeCount++}`,
          ast: stmt.ast,
          from: stmt.state1.id,
          to: stmt.state2.id,
          label: stmt.description ?? '',
        });
        const count = this.transitions.length;
        checkLimit(this.ctx, 'maxEdges', count, this.ctx.maxEdges, 'transitions', range);
      }
    }
  }

  /** One mention of a state in the walk (`dataFetcher` for an item that is not the root). */
  private node(item: StateItem, parent: StateItem | undefined): void {
    const { id } = item;
    let rec = this.records.get(id);
    let drawn = false;
    if (!rec) {
      let shape: string | undefined = RECT;
      if (item.start === true) shape = 'stateStart';
      else if (item.start === false) shape = 'stateEnd';
      if (item.type !== 'default') shape = item.type;
      const entry = this.table.get(id);
      rec = {
        id,
        ast: item.ast,
        range: item.range,
        shape,
        description: id,
        isGroup: false,
        region: false,
        classes: entry ? [...entry.classes] : [],
        styles: entry ? [...entry.styles] : [],
      };
      this.records.set(id, rec);
      drawn = id !== '' && id !== '</join></fork>' && id !== '</choice>';
      if (drawn) this.nodes.push(rec);
    }
    if (item.embed || rec.embed) this.blockMention(rec, item);
    this.describe(rec, item.description);
    if (!rec.isGroup && item.doc) this.group(rec, item, parent);
    // One check per state the model draws (D608); a region is not a state.
    if (drawn && !rec.region) this.countState(item.range);
    if (item.doc || (item.description && item.description !== '')) rec.content = true;
    if (parent && parent.id !== 'root' && !this.holds(id, parent.id)) rec.parent = parent.id;
    if (item.note) {
      const side = item.note.position === 'left of' ? 'left' : 'right';
      this.notes.push({ ast: item.note.ast, target: id, side, text: item.note.text });
      this.edgeCount++;
    }
  }

  private countState(range: Range): void {
    this.states++;
    checkLimit(this.ctx, 'maxNodes', this.states, this.ctx.maxNodes, 'states', range);
  }

  /**
   * Whether the scope `scope` is the state `id` or sits inside it, by the parents filed so far.
   * v12 files a state under every scope that mentions it, so `Boot --> Running` written inside
   * `Boot` made `Boot` its own parent, and no layout survives a loop in the tree (#688). Such a
   * mention moves nothing: the state stays where it was. The parents therefore always form a
   * tree, which is also why this walk ends.
   */
  private holds(id: string, scope: string): boolean {
    for (let at: string | undefined = scope; at !== undefined; at = this.records.get(at)?.parent)
      if (at === id) return true;
    return false;
  }

  /**
   * A mention of an embedded diagram block's id (ADR-15). Repeating a state id is legal, so a
   * plain mention (a transition, a note, `class`) refers to the block; a second block, or a
   * description or statements for the same id, is an error: the id names two things.
   */
  private blockMention(rec: GraphNode, item: StateItem): void {
    const { id } = rec;
    if (item.embed && !rec.embed) {
      if (rec.content) this.duplicate(id, item.range, false);
      else {
        rec.embed = item.embed;
        rec.ast = item.ast;
        rec.range = item.range;
      }
      return;
    }
    if (item.embed) this.duplicate(id, item.range, true);
    else if (item.doc || (item.description && item.description !== '')) {
      this.duplicate(id, item.range, false);
    }
  }

  private duplicate(id: string, range: Range, block: boolean): void {
    this.ctx.error(
      'EMBED_DUPLICATE_ID',
      block
        ? `Duplicate block id \`${id}\`: another \`mermaid ${id}\` block has it. Give each block its own id.`
        : `Duplicate id \`${id}\`: it names the \`mermaid ${id}\` block, so it cannot also be a composite state or a state with a description. Rename the state, or drop its description and body to refer to the block.`,
      range
    );
  }

  /** The description of one mention, as `dataFetcher` adds it to the node. */
  private describe(rec: GraphNode, d: string | string[] | undefined): void {
    const { id } = rec;
    if (d) {
      if (Array.isArray(rec.description)) {
        rec.shape = WITH_DESC;
        rec.description.push(...[d].flat());
      } else if (rec.description.length > 0) {
        rec.shape = WITH_DESC;
        rec.description = rec.description === id ? [d].flat() : [rec.description, d].flat();
      } else {
        rec.shape = RECT;
        rec.description = Array.isArray(d) ? [...d] : d;
      }
    }
    if (Array.isArray(rec.description) && rec.description.length === 1 && rec.shape === WITH_DESC)
      rec.shape = rec.isGroup ? GROUP : RECT;
  }

  /** The first mention with statements makes the node a composite (or a region). */
  private group(rec: GraphNode, item: StateItem, parent: StateItem | undefined): void {
    const { id } = rec;
    rec.isGroup = true;
    const dir = dirOf(item.doc);
    if (dir !== undefined) rec.dir = dir;
    if (item.type === DIVIDER && parent) {
      rec.shape = DIVIDER;
      rec.region = true;
      const region: StateRegion = { id, ast: item.ast, parent: parent.id };
      if (dir !== undefined) region.dir = dir;
      this.regions.push(region);
    } else {
      rec.shape = GROUP;
      if (item.ast.startsWith('s:')) rec.ast = item.ast;
    }
  }
}
