/**
 * Sankey AST ids (D397, DESIGN §4.2): `node:<name>` for a node's first occurrence and
 * `link:<source>-><target>` for a row, with `@2`, `@3`, … for later rows between the same two
 * nodes (pitfall 9). Names are escaped with the rules of core's `AstIds` (copied: core does not
 * export its escape): `%`, `>`, `@` and `#` are percent-encoded, so the `->` between the two
 * names and the `@` before a count are the only ones in an id, and two rows get the same id
 * only when they link the same two names.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';

const SPECIAL = /[%>@#]/g;

/** A name with `%`, `>`, `@` and `#` percent-encoded (core `ast.ts` `esc`). */
function escapeName(name: string): string {
  SPECIAL.lastIndex = 0;
  if (!SPECIAL.test(name)) return name;
  return name.replace(SPECIAL, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `node:<name>`. */
export const nodeAstId = (name: string): AstId => `node:${escapeName(name)}`;

/** Hands out the link ids of one parse, counting rows per source and target. */
export class LinkIds {
  private readonly seen = new Map<string, number>();

  /** `link:<source>-><target>`, then `@2`, `@3`, … */
  next(source: string, target: string): AstId {
    const id = `link:${escapeName(source)}->${escapeName(target)}`;
    const n = (this.seen.get(id) ?? 0) + 1;
    this.seen.set(id, n);
    return n === 1 ? id : `${id}@${n}`;
  }
}
