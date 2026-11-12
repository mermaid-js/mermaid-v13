/**
 * AST id stems from names (D427, `ast.ts`): `%`, `>`, `@` and `#` percent-encoded as core's
 * ids are, so the `->` of a link id and the `@n` of a repeat are never part of a name.
 */
import { idEscaper } from '@mermaid-js/core/parser-kit';
import type { AstId } from '@mermaid-js/core/parser-kit';

const esc = /* @__PURE__ */ idEscaper();

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
