/**
 * Requirement AST ids (D437, DESIGN §4.2): `requirement:<name>`, `element:<name>`,
 * `relation:<src>-><dst>` and `classDef:<name>`, each with `@2`, `@3`, … for a later one of the
 * same names (pitfall 9); statements without a name of their own are core's `<kind>:<n>`
 * (`style:1`, `class:2`). Names are escaped with the rules of core's `AstIds` (copied: core does
 * not export its escape): `%`, `>`, `@` and `#` are percent-encoded, so the `->` between two
 * names and the `@` before a count are the only ones in an id.
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

/** Hands out the named ids of one parse. */
export class NameIds {
  private readonly seen = new Map<string, number>();

  private bump(id: string): AstId {
    const n = (this.seen.get(id) ?? 0) + 1;
    this.seen.set(id, n);
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `<prefix>:<name>` (`requirement`, `element`, `classDef`), then `@2`, `@3`, … */
  named(prefix: 'requirement' | 'element' | 'classDef', name: string): AstId {
    return this.bump(`${prefix}:${escapeName(name)}`);
  }

  /** `relation:<src>-><dst>`, then `@2`, `@3`, … */
  relation(src: string, dst: string): AstId {
    return this.bump(`relation:${escapeName(src)}->${escapeName(dst)}`);
  }
}
