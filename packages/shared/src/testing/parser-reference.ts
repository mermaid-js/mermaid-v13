/**
 * The flow family's lexer and model paths as they were before their fast paths, kept as the
 * reference the specs compare the fast paths with: {@link referencePaths} runs a function with
 * these installed on the shared prototypes and puts the fast ones back after. Workspace-only:
 * specs import it, the build and the tarball leave it out.
 */
import { CR, LF } from '@mermaid-js/core/parser-kit';
import type { TokenWriter } from '@mermaid-js/core/parser-kit';
import { FlowBuilderBase } from '../parser/flow-model.ts';
import type { FlowClassRecord } from '../parser/flow-model.ts';
import { FlowLexer } from '../parser/flow-lexer.ts';
import { StateLexer } from '../parser/state-lexer.ts';

/** The members the reference paths read: TypeScript-private, there at run time. */
interface Lexer {
  p: number;
  len: number;
  src: string;
  crStart: boolean;
  holes: readonly unknown[];
  covered: number;
  w: TokenWriter;
  source(i: number): number;
  sourceEnd(i: number): number;
  trivia(at: number): void;
  dropAt(b: number): number;
  keyword(c: number): boolean;
  direction(): boolean;
  linkId(c: number): boolean;
  punctuation(c: number): boolean;
  blankRule(c: number): boolean;
  word(c: number): boolean;
}

interface Builder {
  edges: readonly { id: string }[];
  classes: Map<string, FlowClassRecord>;
}

/** The INITIAL rules, in jison's order, every one tried. */
function initial(this: Lexer, c: number): boolean {
  return (
    this.keyword(c) ||
    this.direction() ||
    this.linkId(c) ||
    this.punctuation(c) ||
    this.blankRule(c) ||
    this.word(c)
  );
}

/** A token's range, always through the offset maps. */
function emit(this: Lexer, kind: number, s: number, end: number, next: number = end): void {
  let a = this.source(s);
  const last = Math.min(end, this.len);
  let b = last > s ? this.sourceEnd(last - 1) : a;
  if (this.crStart && b > a) {
    const { src } = this;
    if (src.charCodeAt(a) === LF && src.charCodeAt(a - 1) === CR) a--;
  }
  if (this.holes.length > 0) {
    this.trivia(a);
    if (b > a) b = this.dropAt(b);
  }
  this.w.push(kind, a, b);
  if (b > this.covered) this.covered = b;
  this.p = next;
}

/** The first edge given the id `id`, of every edge made so far. */
function edgeNamed(this: Builder, id: string): unknown {
  return this.edges.find((edge) => edge.id === id);
}

function hasEdge(this: Builder, id: string): boolean {
  return this.edges.some((edge) => edge.id === id);
}

/** v12's `addClass`: always through the `§§§` swap. */
function addClass(this: Builder, ids: string, styles: string[]): void {
  const style = styles
    .join()
    .replace(/\\,/g, '§§§')
    .replace(/,/g, ';')
    .replace(/§§§/g, ',')
    .split(';');
  for (const id of ids.split(',')) {
    let def = this.classes.get(id);
    if (def === undefined) {
      def = { id, styles: [], textStyles: [] };
      this.classes.set(id, def);
    }
    for (const s of style) {
      if (s.includes('color')) def.textStyles.push(s.replace('fill', 'bgFill'));
      def.styles.push(s);
    }
  }
}

const REFERENCE: [object, string, unknown][] = [
  [FlowLexer.prototype, 'initial', initial],
  [StateLexer.prototype, 'emit', emit],
  [FlowBuilderBase.prototype, 'edgeNamed', edgeNamed],
  [FlowBuilderBase.prototype, 'hasEdge', hasEdge],
  [FlowBuilderBase.prototype, 'addClass', addClass],
];

/** `run` with the reference paths in place of the fast ones. */
export function referencePaths<T>(run: () => T): T {
  const saved = REFERENCE.map(([proto, key]) => (proto as Record<string, unknown>)[key]);
  for (const [proto, key, fn] of REFERENCE) (proto as Record<string, unknown>)[key] = fn;
  try {
    return run();
  } finally {
    REFERENCE.forEach(([proto, key], k) => ((proto as Record<string, unknown>)[key] = saved[k]));
  }
}
