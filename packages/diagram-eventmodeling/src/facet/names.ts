/**
 * Event modeling names (D528): what `isValidId` accepts for each symbol kind. A frame id is one
 * to three digits (`0`, `00` and `01` are three ids). A data name is one name token and an
 * entity name one or more joined by `.`, as the lexer reads them where they go: so a keyword
 * (`tf`, `data`, `eventmodeling`), a non-ASCII or punctuated name, a leading digit, and a name the
 * lexer reads as a `title`, `accTitle` or `accDescr` after a blank (`titleBar`) are refused. An
 * id already in use is refused by the service's clash check, and an entity name with a `.`
 * where a `gwt` step names it (a step takes one name) by its read-back check.
 */
import { Kind, significantTokens } from '@mermaid-js/core/parser-kit';
import { lex } from '../parser/lexer.ts';
import { EVENTMODELING_TRIVIA, KEYWORDS, T } from '../parser/tokens.ts';
import { eventModelingView } from '../parser/view.ts';

/** Where a data or entity name goes, before and after it. */
const CONTEXTS: Readonly<Record<'data' | 'entity', readonly (readonly [string, string])[]>> = {
  data: [
    ['eventmodeling\ndata ', ' {\n}\n'],
    ['eventmodeling\ntf 01 evt A [[', ']]\n'],
  ],
  entity: [['eventmodeling\nentity ', '\n']],
};

const LETTERS = 'names are ASCII letters, digits and `_`, and start with a letter or `_`';

/** The kinds of the significant tokens over `name`, read between `before` and `after`. */
function tokensOf(name: string, before: string, after: string): number[] | undefined {
  const src = `${before}${name}${after}`;
  const { bodyStart, view } = eventModelingView(src);
  const t = significantTokens(lex(src, bodyStart, view), EVENTMODELING_TRIVIA);
  const from = before.length;
  const to = from + name.length;
  const out: number[] = [];
  for (let j = 0; j < t.length; j++) {
    const start = t.start[j] ?? 0;
    const end = t.end[j] ?? 0;
    if (end <= from || start >= to) continue;
    // A token running past the name (or starting before it) does not read it as written.
    if (start < from || end > to) return undefined;
    out.push(t.kind[j] ?? Kind.EOF);
  }
  return out;
}

/** Why `name` is not a name the lexer reads as `ID ('.' ID)*` (`dots`) or `ID`. */
function nameReason(name: string, kind: 'data' | 'entity'): string | undefined {
  const dots = kind === 'entity';
  const parts = dots ? name.split('.') : [name];
  for (const part of parts) {
    if (part === 'eventmodeling' || KEYWORDS.has(part)) {
      return `\`${part}\` is a keyword and cannot be a name.`;
    }
  }
  if (!parts.every((p) => /^[_a-zA-Z]\w*$/.test(p))) {
    const shape = dots ? `${LETTERS}; an entity name may join several with \`.\`` : LETTERS;
    return `\`${name}\` is not ${kind === 'entity' ? 'an' : 'a'} ${kind} name: ${shape}.`;
  }
  for (const [before, after] of CONTEXTS[kind]) {
    const kinds = tokensOf(name, before, after);
    const ok = kinds?.every((k, i) => k === (i % 2 === 0 ? T.Id : T.Dot)) && kinds.length % 2 === 1;
    if (ok) continue;
    return `\`${name}\` would not read as one name: after a blank, \`title\`, \`accTitle\` and \`accDescr\` start a statement.`;
  }
  return undefined;
}

/**
 * Why `name` cannot be an identifier of symbol kind `kind` (`frame` when omitted), if it
 * cannot.
 */
export function idReason(name: string, kind = 'frame'): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (kind === 'data' || kind === 'entity') return nameReason(name, kind);
  if (!/^\d{1,3}$/.test(name)) {
    return `\`${name}\` is not a frame id: a frame id is one to three digits, such as \`01\`.`;
  }
  return undefined;
}
