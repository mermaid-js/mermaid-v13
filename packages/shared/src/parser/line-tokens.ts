/**
 * The token view of the parsers that read one statement per line (treeView, treemap): the
 * significant tokens without the line breaks, where each is in the stream and which start a
 * line; and how their error messages quote a token's text.
 */
import { Kind, TRIVIA } from '@mermaid-js/core/parser-kit';
import type { KindSet, TokenStream, TokenView } from '@mermaid-js/core/parser-kit';

/**
 * A {@link TokenView} of a stream without its line breaks, which says where each token is in
 * the stream and whether a line starts with it.
 */
export interface LineTokenView extends TokenView {
  /** The token's index in the stream (for its text). */
  readonly index: Uint32Array;
  /** 1 when a line break comes between the token and the significant one before it. */
  readonly lineStart: Uint8Array;
}

/**
 * The tokens of `stream` that are neither in `trivia` nor line breaks, in order, each with its
 * stream index and whether a line break comes before it. The first token starts a line.
 */
export function lineTokens(stream: TokenStream, trivia: KindSet = TRIVIA): LineTokenView {
  const skip = (k: number) => k === Kind.Newline || trivia[k] === 1;
  let n = 0;
  for (let j = 0; j < stream.length; j++) if (!skip(stream.kind[j] ?? Kind.EOF)) n++;
  const kind = new Uint16Array(n);
  const start = new Uint32Array(n);
  const end = new Uint32Array(n);
  const index = new Uint32Array(n);
  const lineStart = new Uint8Array(n);
  let o = 0;
  let line = 1;
  for (let j = 0; j < stream.length; j++) {
    const k = stream.kind[j] ?? Kind.EOF;
    if (k === Kind.Newline) line = 1;
    if (skip(k)) continue;
    kind[o] = k;
    start[o] = stream.start[j] ?? 0;
    end[o] = stream.end[j] ?? 0;
    index[o] = j;
    lineStart[o] = line;
    line = 0;
    o++;
  }
  return { kind, start, end, index, lineStart, length: n };
}

/** The longest text {@link excerpt} quotes. */
const EXCERPT = 24;

/**
 * How an error message quotes `text`: its first line (up to `\n`), at most 24 characters, with
 * `…` when anything is cut.
 */
export function excerpt(text: string): string {
  const line = text.split('\n', 1)[0] ?? '';
  return line.length > EXCERPT || line !== text ? `${line.slice(0, EXCERPT)}…` : line;
}
