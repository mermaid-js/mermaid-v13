/** Small naming helpers of the state parser. */
import { CR, LF } from '@mermaid-js/core/parser-kit';

/** The composite state a document is the body of. */
export interface Scope {
  name: string;
  depth: number;
}

/** The name a mention's AST id is built from: `[*]` is scoped to its composite. */
export function keyOf(name: string, scope: Scope | undefined, end: boolean | undefined): string {
  if (name !== '[*]') return name;
  return `${scope ? `${scope.name}/` : ''}[*]${end ? 'end' : 'start'}`;
}

/** How a message names the blank (or the end) at `at`. */
export function blankAt(src: string, at: number): string {
  const c = src.charCodeAt(at);
  if (Number.isNaN(c)) return 'end of the text';
  return c === LF || c === CR ? 'line break' : 'space';
}

/** v12's `trimColon`: a description without its `:`. */
export function trimColon(s: string): string {
  return s.startsWith(':') ? s.slice(1).trim() : s.trim();
}
