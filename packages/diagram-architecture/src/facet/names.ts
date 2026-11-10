// cspell:words ackend LRTB
/**
 * Architecture ids (D508): what `isValidId` accepts as a new id. Services, junctions and groups
 * share one namespace and one spelling, so the rule is the same for every kind. The lexer
 * decides: a name is valid when the lexer, reading it everywhere an id goes (a declaration, both
 * ends of an edge, `{group}` after the left one, after `in` and in `align`), gives one `ID`
 * token over all of it. So v12's lexer refuses, and so does a rename: an initial capital `L`,
 * `R`, `T` or `B` (a side, so `Backend` is `B` and `ackend`), a keyword, a name starting with
 * `title`, a character other than ASCII `\w` and `-`, and a `-` at either end. An id cannot be
 * quoted, so there is no `quoteId`: a refused name is refused.
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { lex } from '../parser/lexer.ts';
import { KEYWORDS, T } from '../parser/tokens.ts';

/** Where an id goes, the name between the two. */
const CONTEXTS: readonly (readonly [before: string, after: string])[] = [
  ['architecture-beta\nservice ', '\n'],
  ['architecture-beta\n', ':R -- L:b\n'],
  ['architecture-beta\n', '{group}:R -- L:b\n'],
  ['architecture-beta\na:R -- L:', '\n'],
  ['architecture-beta\nservice a in ', '\n'],
  ['architecture-beta\nalign row ', ' b\n'],
];

const KEYWORD_WORDS: ReadonlySet<string> = new Set(KEYWORDS.map(([w]) => w));

const LETTERS = 'an id is ASCII letters, digits, `_` and `-`, and cannot start or end with `-`';

/** Whether `name` reads as one `ID` token between `before` and `after`. */
function readsAsId(name: string, before: string, after: string): boolean {
  const src = `${before}${name}${after}`;
  const tokens = lex(src, 0, sourceView(src, 0, []));
  const from = before.length;
  for (let j = 0; j < tokens.length; j++) {
    const end = tokens.end[j] ?? 0;
    if (end <= from) continue;
    const k = tokens.kind[j] ?? Kind.EOF;
    return k === T.Id && tokens.start[j] === from && end === from + name.length;
  }
  return false;
}

/** Why `name` cannot be an id, if it cannot (the same for every kind, D508). */
export function idReason(name: string): string | undefined {
  if (name === '') return 'An id cannot be empty.';
  if (KEYWORD_WORDS.has(name)) {
    return `\`${name}\` is a keyword, and an id cannot be one: choose another name, such as \`${name}1\`.`;
  }
  if (/[^\w-]/.test(name) || /^-|-$/.test(name)) return `\`${name}\` is not an id: ${LETTERS}.`;
  if (/^[LRTB]/.test(name)) {
    const lower = `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
    return `\`${name}\` starts with a capital \`${name.charAt(0)}\`, which reads as a side: an id cannot start with \`L\`, \`R\`, \`T\` or \`B\`. Choose another name, such as \`${lower}\`.`;
  }
  if (name.startsWith('title')) {
    return `\`${name}\` starts with \`title\`, which starts a title: choose another name.`;
  }
  for (const [before, after] of CONTEXTS) {
    if (!readsAsId(name, before, after)) {
      return `\`${name}\` does not read as one id everywhere an id goes: ${LETTERS}.`;
    }
  }
  return undefined;
}
