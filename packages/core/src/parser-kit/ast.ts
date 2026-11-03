/**
 * AST base types and semantic AST ids (DESIGN §4.2, R-PARSE-8, D53, D69).
 *
 * An `AstId` is built from the user's own names, never from offsets, so it survives edits
 * elsewhere in the text, including edits to the element's own label:
 *
 * | element                       | id          |
 * | ----------------------------- | ----------- |
 * | node `A`                      | `n:A`       |
 * | the 2nd mention of node `A`   | `n:A@2`     |
 * | edge `A --> B`                | `e:A>B`     |
 * | the 2nd parallel `A`→`B` edge | `e:A>B#2`   |
 * | subgraph `one`                | `s:one`     |
 * | 3rd unnamed `st` statement    | `st:3`      |
 *
 * `%`, `>`, `@` and `#` inside names are percent-encoded (`%25`, `%3E`, `%40`, `%23`).
 * Renderers write the id as `data-ast`.
 */
import type { Range } from './positions.ts';

/** Semantic AST id, e.g. `n:A`, `e:A>B#2`, `st:3`. */
export type AstId = string;

/**
 * Base of every AST node. Diagrams export one interface per node kind that extends this
 * with a literal `type` and their own fields (e.g. `FlowNodeStmt`, `FlowEdge`).
 */
export interface AstNode<T extends string = string> {
  id: AstId;
  type: T;
  /** Source span in the original text. */
  range: Range;
  children?: AstNode[];
}

/**
 * A `click … callback` / `call` statement as an AST node carries it (R-SVG-5, DESIGN §12.3):
 * the AST node of the statement has a `callback` field of this shape. Diagram-agnostic, so
 * an extension (the interactions plugin) can find callbacks in any diagram's AST.
 */
export interface AstCallback {
  /** Ids of the elements the callback is bound to (the rendered `data-id`), as written. */
  targets: string[];
  /** The function name as written (`fn`, `app.handlers.fn`). */
  name: string;
  /** The text between the parentheses of `call fn(…)`, as written. */
  args?: string;
}

function esc(name: string): string {
  return /[%>@#]/.test(name)
    ? name.replace(/[%>@#]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    : name;
}

/** `n:<name>`: the id of a node's first mention, which is also its vertex's id. */
export function nodeId(name: string): AstId {
  return `n:${esc(name)}`;
}

/** Hands out the ids of one parse. Create one per parse; ids depend on call order. */
export class AstIds {
  private readonly seen = new Map<string, number>();

  private count(key: string): number {
    const n = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, n);
    return n;
  }

  /** `n:<name>`, then `n:<name>@2`, `@3`, … for later mentions. */
  node(name: string): AstId {
    const id = nodeId(name);
    const n = this.count(id);
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `e:<from>><to>`, then `#2`, `#3`, … for parallel edges. */
  edge(from: string, to: string): AstId {
    const id = `e:${esc(from)}>${esc(to)}`;
    const n = this.count(id);
    return n === 1 ? id : `${id}#${n}`;
  }

  /** `s:<id>`, then `@2`, … if the same subgraph id is opened again. */
  subgraph(name: string): AstId {
    const id = `s:${esc(name)}`;
    const n = this.count(id);
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `<kind>:<n>`: 1-based ordinal among the statements of `kind` with no user name. */
  statement(kind: string): AstId {
    return `${kind}:${this.count(`\0${kind}`)}`;
  }
}
