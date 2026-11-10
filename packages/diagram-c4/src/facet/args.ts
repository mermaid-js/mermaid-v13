/**
 * The macro call around an offset, read from the token stream (completion runs on text being
 * typed, where the statement may not parse yet, so the AST may have no node for it). The
 * arguments are grouped as `parser.ts` groups them: a bare text, a quoted one, a
 * `$name="value"` or an empty one each make one argument, and commas carry nothing.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';
import { SLOTS } from './tables.ts';

/** One argument as written: where it is, and its parts. */
export interface WrittenArg {
  /** From its first character (leading blanks included) to its last. */
  readonly range: Range;
  /** The text of a bare or quoted argument (between the quotes), when it has one. */
  readonly value?: Range;
  /** A quoted argument's opening quote. */
  readonly quoted: boolean;
  /** A named argument's name (after `$`, up to `=` or the end of what is written). */
  readonly name?: Range;
}

export interface CallAt {
  /** The macro's keyword kind. */
  readonly kind: number;
  /** The macro keyword's range. */
  readonly keyword: Range;
  /** The arguments written, in order. */
  readonly args: readonly WrittenArg[];
  /** The index of the argument holding the offset, or the one a new argument there gets. */
  readonly index: number;
  /** The argument holding the offset, if any. */
  readonly at?: WrittenArg;
}

/** Tokens that may lie between a macro keyword and an offset in its arguments. */
const IN_ARGS = new Set<number>([
  T.ArgsOpen,
  T.AttributeEmpty,
  T.Str,
  T.Comma,
  T.QuoteOpen,
  T.QuoteClose,
  T.KeyStart,
  T.StrKey,
  T.KeyEquals,
  T.StrValue,
  T.ValueClose,
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
]);

/** The index of the last token starting before `at`, or -1. */
function lastStartBefore(tokens: TokenStream, at: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) < at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The arguments of the call whose keyword is token `k`, read up to its `)` or line end. */
function readArgs(
  tokens: TokenStream,
  text: string,
  k: number
): { args: WrittenArg[]; open: number } {
  const args: WrittenArg[] = [];
  const start = (j: number) => tokens.start[j] ?? 0;
  const end = (j: number) => tokens.end[j] ?? 0;
  const kind = (j: number) => tokens.kind[j] ?? Kind.EOF;
  let j = k + 1;
  while (j < tokens.length && (kind(j) === Kind.Comment || kind(j) === Kind.Directive)) j++;
  let open: number;
  if (kind(j) === T.ArgsOpen) open = end(j);
  else if (kind(j) === T.AttributeEmpty) {
    // `(` then blanks and `,`: an empty first argument between them.
    open = start(j) + 1;
    args.push({ range: { start: open, end: end(j) - 1 }, quoted: false });
  } else return { args, open: -1 };
  const OPEN = Number.MAX_SAFE_INTEGER;
  for (j++; j < tokens.length; j++) {
    const kj = kind(j);
    if (kj === T.ArgsClose || kj === Kind.Newline || kj === Kind.Error || kj === T.Eof) break;
    if (kj === T.Str) {
      const range = { start: start(j), end: end(j) };
      args.push({ range, value: range, quoted: false });
    } else if (kj === T.AttributeEmpty) {
      // `,,` holds an empty argument between its commas; blanks and `""` are one.
      const at = start(j) + 1;
      if (text.charAt(start(j)) === ',')
        args.push({ range: { start: at, end: at }, quoted: false });
      else {
        const quote = end(j) - 1;
        args.push({
          range: { start: start(j), end: end(j) },
          value: { start: quote, end: quote },
          quoted: true,
        });
      }
    } else if (kj === T.QuoteOpen) {
      // `"text"`; still open, it runs to the end.
      const from = start(j);
      const value = { start: end(j), end: end(j) };
      let to = OPEN;
      if (kind(j + 1) === T.Str) value.end = end(++j);
      if (kind(j + 1) === T.QuoteClose) to = end(++j);
      args.push({ range: { start: from, end: to }, value, quoted: true });
    } else if (kj === T.KeyStart) {
      // `$name="value"`; still open, it runs to the end.
      const from = start(j);
      const name = { start: end(j), end: end(j) };
      let to = OPEN;
      if (kind(j + 1) === T.StrKey) name.end = end(++j);
      if (kind(j + 1) === T.KeyEquals) {
        j++;
        if (kind(j + 1) === T.StrValue) j++;
        if (kind(j + 1) === T.ValueClose) to = end(++j);
      }
      args.push({ range: { start: from, end: to }, name, quoted: false });
    }
  }
  return { args, open };
}

/**
 * The macro call whose arguments hold `at` (after its `(`, before its `)`, on its line), or
 * undefined. `text` is the document the tokens are of.
 */
export function callAt(tokens: TokenStream, text: string, at: number): CallAt | undefined {
  let j = lastStartBefore(tokens, at);
  while (j >= 0 && IN_ARGS.has(tokens.kind[j] ?? Kind.EOF)) j--;
  if (j < 0) return undefined;
  const kind = tokens.kind[j] ?? Kind.EOF;
  if (!SLOTS.has(kind)) return undefined;
  const { args, open } = readArgs(tokens, text, j);
  if (open < 0 || at < open) return undefined;
  // A `)` before the offset closes the call.
  for (let i = j + 1; i < tokens.length && (tokens.start[i] ?? 0) < at; i++) {
    if (tokens.kind[i] === T.ArgsClose && (tokens.end[i] ?? 0) <= at) return undefined;
  }
  const keyword = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
  let index = 0;
  for (const arg of args) {
    if (arg.range.start <= at && at <= arg.range.end)
      return { kind, keyword, args, index, at: arg };
    if (arg.range.end < at) index++;
  }
  return { kind, keyword, args, index };
}
