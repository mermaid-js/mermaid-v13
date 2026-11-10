/**
 * The ER model (DESIGN §4.2): plain, serialisable data in insertion order, as v12's `ErDB`
 * holds it after a parse, minus v12's rendering fields (`look`, DOM ids, colour indexes).
 *
 * {@link ErBuilder} replays the calls v12's grammar actions made on `ErDB` (`addEntity`,
 * `addAttributes`, `addRelationship`, `setClass`, `addCssStyles`, `addClass`, `addSubGraph`,
 * …), with v12's ordering and lookup rules, so the conformance suite can compare the two.
 */
import { ID_RESERVED, idEscaper } from '@mermaid-js/core/parser-kit';
import type { AstId, Diagnostic, Range } from '@mermaid-js/core/parser-kit';

/** How many of an entity one end of a relationship allows. */
export type ErCardinality = 'zeroOrOne' | 'zeroOrMore' | 'oneOrMore' | 'onlyOne' | 'mdParent';

export type ErDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface ErAttribute {
  /** `a:<entity>.<name>`, `#2`, `#3`, … for a repeated name (AST id). */
  id: AstId;
  /** As written, with a `?` suffix kept (`string?`) and `~T~` generics unexpanded. */
  type: string;
  name: string;
  /** `PK`, `FK`, `UK` as written (any case), in order. */
  keys: string[];
  /** The `"…"` comment without its quotes; `''` for none. */
  comment: string;
}

export interface ErEntity {
  /** `n:<name>`: the AST id of the entity's first mention. */
  id: AstId;
  name: string;
  /** `A[alias]`: the displayed name; `''` for none. The first alias given wins. */
  alias: string;
  /** Attributes from every `{ … }` block of the entity, in source order. */
  attributes: ErAttribute[];
  /** Class names from `:::` and `class`, in order (v12's `cssClasses` without `default`). */
  classes: string[];
  /** `style` declarations, in order. */
  styles: string[];
}

/** One end of a relationship. */
export interface ErEnd {
  name: string;
  /**
   * The name was a subgraph id when the relationship was read (v12 checks only subgraphs
   * already closed); otherwise it names an entity.
   */
  subgraph: boolean;
  /** The cardinality written next to this end. */
  cardinality: ErCardinality;
}

export interface ErRelationship {
  /** `e:<from>><to>`, `#2`, … for parallel relationships (AST id). */
  id: AstId;
  from: ErEnd;
  to: ErEnd;
  /** `--` / `to` (solid line) rather than `..`, `.-`, `-.`, `optionally to` (dashed). */
  identifying: boolean;
  label: string;
}

export interface ErSubgraph {
  /** `s:<name>`, `@2` when the same id is opened again (AST id). */
  id: AstId;
  /** The subgraph id. Reopening an id adds a second subgraph, as v12 does. */
  name: string;
  /** `[title]`, else the id; trimmed. */
  title: string;
  /**
   * Entities and subgraphs directly inside it, in v12's order, each in at most one subgraph
   * (the first to close takes it).
   */
  members: string[];
  /** The last `direction` inside it; unset for none. */
  direction?: ErDirection;
  classes: string[];
  styles: string[];
}

/** A `classDef`. */
export interface ErClass {
  name: string;
  styles: string[];
  /** Styles that mention `color`, with `fill` read as `bgFill` (v12's label styles). */
  textStyles: string[];
}

export interface ErModel {
  /** Top-level `direction`, default `TB`. */
  direction: ErDirection;
  /** In first-mention order; names that are subgraph ids are left out (v12 draws none). */
  entities: ErEntity[];
  relationships: ErRelationship[];
  /** In the order their `end` was read (inner subgraphs first). */
  subgraphs: ErSubgraph[];
  classes: ErClass[];
  accTitle: string;
  accDescr: string;
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  warnings: Diagnostic[];
}

/** What one statement contributes to the body of the subgraph around it (v12's `$$`). */
export type ErDocItem = string | { dir: ErDirection };

export interface ErBuilderOptions {
  maxNodes: number;
  maxEdges: number;
  error(code: string, message: string, range: Range): void;
}

/** Percent-encodes what AST ids reserve, plus `.` (it separates entity and attribute). */
const esc = /* @__PURE__ */ idEscaper(`${ID_RESERVED}.`);
export function attributeId(entity: string, name: string, n: number): AstId {
  const id = `a:${esc(entity)}.${esc(name)}`;
  return n === 1 ? id : `${id}#${n}`;
}

/** v12's `ErDB`, as a builder for {@link ErModel}. One per parse. */
export class ErBuilder {
  private readonly entities = new Map<string, ErEntity>();
  private readonly relationships: ErRelationship[] = [];
  private readonly classes = new Map<string, ErClass>();
  private readonly subgraphs: ErSubgraph[] = [];
  /** Subgraph by id: the last one closed with that id. */
  private readonly subgraphById = new Map<string, ErSubgraph>();
  /** Raw members already taken by a closed subgraph. */
  private readonly taken = new Set<string>();
  private direction: ErDirection = 'TB';
  private accTitle = '';
  private accDescr = '';
  private limited = false;

  constructor(private readonly options: ErBuilderOptions) {}

  addEntity(name: string, id: AstId, range: Range, alias = ''): ErEntity | undefined {
    let e = this.entities.get(name);
    if (!e) {
      if (this.entities.size >= this.options.maxNodes) {
        this.limit('NODE_LIMIT', `more than ${this.options.maxNodes} entities`, range);
        return undefined;
      }
      e = { id, name, alias, attributes: [], classes: [], styles: [] };
      this.entities.set(name, e);
    } else if (!e.alias && alias) e.alias = alias;
    return e;
  }

  addAttributes(entity: string, attributes: readonly ErAttribute[]): void {
    this.entities.get(entity)?.attributes.push(...attributes);
  }

  /** Whether `name` is a closed subgraph's id now (v12 resolves ends at read time). */
  isSubgraph(name: string): boolean {
    return this.subgraphById.has(name);
  }

  addRelationship(rel: ErRelationship, range: Range): void {
    if (this.relationships.length >= this.options.maxEdges) {
      this.limit('EDGE_LIMIT', `more than ${this.options.maxEdges} relationships`, range);
      return;
    }
    this.relationships.push(rel);
  }

  setClass(ids: readonly string[], classNames: readonly string[]): void {
    for (const id of ids) {
      this.entities.get(id)?.classes.push(...classNames);
      this.subgraphById.get(id)?.classes.push(...classNames);
    }
  }

  addCssStyles(ids: readonly string[], styles: readonly string[]): void {
    for (const id of ids) {
      this.entities.get(id)?.styles.push(...styles);
      this.subgraphById.get(id)?.styles.push(...styles);
    }
  }

  addClass(ids: readonly string[], styles: readonly string[]): void {
    for (const id of ids) {
      let c = this.classes.get(id);
      if (!c) this.classes.set(id, (c = { name: id, styles: [], textStyles: [] }));
      for (const s of styles) {
        if (s.includes('color')) c.textStyles.push(s.replace('fill', 'bgFill'));
        c.styles.push(s);
      }
    }
  }

  setDirection(dir: ErDirection): void {
    this.direction = dir;
  }

  setAccTitle(text: string): void {
    this.accTitle = text.replace(/^\s+/, '');
  }

  setAccDescr(text: string): void {
    this.accDescr = text.replace(/\n\s+/g, '\n');
  }

  /** v12 `addSubGraph`: members from the body's items, deduplicated, each taken once. */
  addSubgraph(id: AstId, name: string, title: string, items: readonly ErDocItem[]): void {
    const seen = new Set<string>();
    const members: string[] = [];
    let direction: ErDirection | undefined;
    for (const item of items) {
      if (typeof item !== 'string') {
        direction = item.dir;
        continue;
      }
      const t = item.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (!this.taken.has(item)) members.push(item);
    }
    for (const m of members) this.taken.add(m);
    const sg: ErSubgraph = { id, name, title: title.trim(), members, classes: [], styles: [] };
    if (direction) sg.direction = direction;
    this.subgraphs.push(sg);
    this.subgraphById.set(name, sg);
  }

  model(warnings: Diagnostic[]): ErModel {
    const ids = new Set(this.subgraphs.map((s) => s.name));
    const entities: ErEntity[] = [];
    for (const e of this.entities.values()) {
      if (ids.has(e.name)) continue;
      entities.push(e);
    }
    // Members that name neither an entity nor a subgraph (v12 also collected `classDef`,
    // `accTitle` values, … there) place nothing, so they are left out.
    const known = (m: string) => this.entities.has(m) || ids.has(m);
    const model: ErModel = {
      direction: this.direction,
      entities,
      relationships: this.relationships,
      subgraphs: this.subgraphs.map((s) => ({ ...s, members: s.members.filter(known) })),
      classes: [...this.classes.values()],
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      warnings,
    };
    return model;
  }

  private limit(code: string, what: string, range: Range): void {
    if (this.limited) return;
    this.limited = true;
    this.options.error(code, `The diagram has ${what}, the limit; the rest were left out.`, range);
  }
}
