/**
 * The wardley parser's hints (R-ERR-2, R-ERR-5): what an error message adds after its
 * `Expected …, got …` to say why and how to fix it, in Mermaid terms. Pure functions of the tokens at the
 * error, so the parser keeps only the choice of which applies.
 */
import { ASCII_MAX, Kind } from '@mermaid-js/core/parser-kit';
import { words } from './tables.ts';
import { STRATEGIES, T } from './tokens.ts';

/** Why a `size` value must be an integer. */
export const SIZE_HINT = 'a size is whole pixels, such as `size [1100, 800]`';

/** Why a `label` offset must be an integer. */
export const LABEL_HINT = 'a label offset is whole pixels, such as `label [-10, 5]`';

/** Why no token rule matched `text` (`next`: the character after it), or `''`. */
export function characterHint(text: string, next: string): string {
  if (text === ';') return '; a `; label` after a link needs text: `A -> B; label`';
  if (text.startsWith('+'))
    return "; a flow is `+>`, `+<`, `+<>`, or a labelled one such as `+'label'>`";
  if (text.startsWith('.') || /^[0-9]/.test(text)) {
    return '; a coordinate is a decimal with digits on both sides of its `.`, such as `0.5`';
  }
  if (text.charCodeAt(0) > ASCII_MAX) {
    return '; an unquoted name is ASCII letters, digits, blanks, `_`, `-`, `&` and parentheses: quote other names';
  }
  if (/[0-9]/.test(next) && text.endsWith('.')) {
    return '; a coordinate has a digit before its `.`, such as `0.5`';
  }
  return '';
}

/** D423: `word` (a keyword or strategy) read at the start of the unquoted name `whole`. */
export function keywordHint(word: string, whole: string): string {
  const head =
    whole === word
      ? `\`${word}\` is a keyword`
      : `\`${whole}\` starts with the keyword \`${word}\``;
  return `${head}, and an unquoted name cannot be or start with one: quote it, as \`"${whole}"\``;
}

/** In a `component` statement, at a token of kind `k` (`next` after it), `want` expected. */
export function componentHint(
  k: number,
  next: number,
  want: readonly number[]
): string | undefined {
  if (k === T.Label && !want.includes(T.Label)) {
    return "a component's `label [x, y]` comes before its strategy and `inertia`";
  }
  if (k === T.LParen && next === T.Strategy && !want.includes(T.LParen)) {
    return 'the strategy comes before `inertia`';
  }
  if (k === T.LParen || (k === T.Name && want.includes(T.Strategy))) {
    return `a strategy is ${words(STRATEGIES.map((w) => `(${w})`))}, and \`(inertia)\` may follow it`;
  }
  return undefined;
}

/** In a link from the name `from` (an unquoted name when `bare`), at a token of kind `k`. */
export function linkHint(
  k: number,
  want: readonly number[],
  from: string,
  bare: boolean
): string | undefined {
  if (want.includes(T.Arrow) && (k === Kind.Newline || k === Kind.EOF)) {
    if (bare && /[\t ]/.test(from)) {
      return `\`${from}\` is one name: join two names with an arrow, such as \`A -> B\` (only quoted names may go without one)`;
    }
    return 'a link joins two names, such as `A -> B`';
  }
  if ((k === T.Arrow || k === T.LinkArrow) && !want.includes(k)) {
    return 'a link has one arrow: write each link on its own line';
  }
  return undefined;
}

/** Inside a pipeline's braces, at a token of kind `k`. */
export function pipelineHint(k: number, want: readonly number[]): string | undefined {
  if (k === T.Comma && want.includes(T.RBracket)) {
    return "a pipeline component has one coordinate, its evolution (its visibility is the pipeline's): `component Kettle [0.5]`";
  }
  if (k === T.RBrace && want.includes(Kind.Newline)) return 'the `}` goes on a line of its own';
  if ((k === T.LParen || k === T.Inertia) && want.includes(Kind.Newline)) {
    return 'a pipeline component has no strategy or `inertia`';
  }
  if (k === T.RBrace) return 'a pipeline has at least one component';
  return undefined;
}
