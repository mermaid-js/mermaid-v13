/**
 * Sankey AST ids (D397, DESIGN §4.2): `node:<name>` for a node's first occurrence and
 * `link:<source>-><target>` for a row, with `@2`, `@3`, … for later rows between the same two
 * nodes (pitfall 9). Names are escaped with the rules of core's `AstIds` (copied: core does not
 * export its escape): `%`, `>`, `@` and `#` are percent-encoded, so the `->` between the two
 * names and the `@` before a count are the only ones in an id, and two rows get the same id
 * only when they link the same two names.
 */
import { AT, GT, HASH, PERCENT } from '@mermaid-js/core/parser-kit';
import type { AstId } from '@mermaid-js/core/parser-kit';

/** A name with `%`, `>`, `@` and `#` percent-encoded (core `ast.ts` `esc`, copied). */
function escapeName(name: string): string {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === PERCENT || c === GT || c === AT || c === HASH) {
      return name.replace(/[%>@#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }
  return name;
}

/** `node:<name>`. */
export const nodeAstId = (name: string): AstId => `node:${escapeName(name)}`;

/** Hands out the link ids of one parse, counting rows per source and target. */
export class LinkIds {
  /** Rows so far by source index, then target index. */
  private readonly seen: Map<number, number>[] = [];

  /**
   * `link:<source>-><target>`, then `@2`, `@3`, … Rows are counted by the nodes' indexes
   * (`from`, `to`), which name the nodes one to one, so no id string is hashed.
   */
  next(source: string, target: string, from: number, to: number): AstId {
    const row = (this.seen[from] ??= new Map());
    const n = (row.get(to) ?? 0) + 1;
    row.set(to, n);
    const id = `link:${escapeName(source)}->${escapeName(target)}`;
    return n === 1 ? id : `${id}@${n}`;
  }
}
