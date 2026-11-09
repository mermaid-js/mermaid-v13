/**
 * AST id stems from names (D427, `ast.ts`): `%`, `>`, `@` and `#` percent-encoded as core's
 * ids are, so the `->` of a link id and the `@n` of a repeat are never part of a name.
 */
import { AT, GT, HASH, PERCENT } from '@mermaid-js/core/parser-kit';
import type { AstId } from '@mermaid-js/core/parser-kit';

function esc(name: string): string {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === PERCENT || c === GT || c === AT || c === HASH) {
      return name.replace(/[%>@#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }
  return name;
}

/** `<kind>:<name>`, e.g. `node:Tea`, `evolve:Kettle`. */
export function astName(kind: string, name: string): AstId {
  return `${kind}:${esc(name)}`;
}

/** `link:<a>-><b>`. */
export function linkName(from: string, to: string): AstId {
  return `link:${esc(from)}->${esc(to)}`;
}

/** A pipeline component's node id, `<parent>_<name>`, as v12 built it (D427). */
export function childId(parent: string, name: string): string {
  return `${parent}_${name}`;
}
