// cspell:words acctitle accdescr
/**
 * Which names a rename may write bare, and how one is quoted (D437, D191). A name goes in many
 * places: a box header, either end of a relation, the `:::` shorthand, and the targets of `style`
 * and `class`, which lex as `\w+` only (v12's style state). A bare name must read back as itself
 * in every one of them, so only `\w+` that is no keyword, nor starts one (`title x`), is bare; any
 * other name a quoted string can hold is written in quotes (`quoteId`). The checks parse each
 * place, so the parser's own rules (D431, D432, keyword prefixes) decide.
 */
import { kindSet } from '@mermaid-js/core/parser-kit';
import { requirementTokens } from '../parser/index.ts';
import { KEYWORDS as LEXER_KEYWORDS } from '../parser/lexer.ts';
import { parseRequirement } from '../parser/parser.ts';
import { REQ_FIELDS, ELEMENT_FIELDS, METHODS, REQ_KINDS, RELS, RISKS } from '../parser/syntax.ts';
import { T } from '../parser/tokens.ts';

const HEADER = 'requirementDiagram\n';

/** Where a name of each symbol kind goes, `@` standing for it. */
const BOX_PLACES = [
  'requirement @ {\n}\n',
  'element @ {\n}\n',
  '@ - traces -> x\n',
  'x <- traces - @\n',
  '@:::c\n',
  'style @ fill:#f00\n',
  'class @ c\n',
];
const CLASS_PLACES = ['classDef @ fill:#f00\n', 'x:::@\n', 'class x @\n'];

const KINDS = ['requirement', 'element'];
/** Keyword kinds a word may lex as. */
const WORDS = kindSet(
  ...REQ_KINDS,
  ...REQ_FIELDS,
  ...ELEMENT_FIELDS,
  ...RISKS,
  ...METHODS,
  ...RELS,
  T.Rd,
  T.Element,
  T.Style,
  T.ClassDef,
  T.Class,
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrOpen
);

/** Whether `as` (the name as written) reads back as one `name` symbol of `kinds` there. */
function readsBack(place: string, as: string, name: string, kinds: readonly string[]): boolean {
  const at = HEADER.length + place.indexOf('@');
  const { diagnostics, symbols } = parseRequirement(HEADER + place.replace('@', () => as));
  const hits = symbols.filter((s) => s.range.start === at);
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hits.length === 1 &&
    kinds.includes(hits[0]!.kind) &&
    hits[0]!.name === name &&
    hits[0]!.range.end === at + as.length
  );
}

/**
 * Words that may start a token other than a name somewhere (the keywords, `title x`, the `acc…`
 * openers, a line-start `direction`): a `\w+` name that is none of them reads back bare
 * everywhere, so only these are parsed (completion asks for every box).
 */
const SLOW_WORDS = new Set([
  ...LEXER_KEYWORDS.map(([w]) => w),
  'title',
  'acctitle',
  'accdescr',
  'direction',
]);
/** Characters the preprocessing or the lexer may read inside quotes (entities, comments). */
const QUOTE_SLOW = /[#%;&]/;

const places = (kind: string | undefined) => (kind === 'class' ? CLASS_PLACES : BOX_PLACES);
const kindsOf = (kind: string | undefined) => (kind === 'class' ? ['class'] : KINDS);

/** Whether the lexer reads a keyword (`test`, `title x`) where `as` starts in `place`. */
function keywordAt(place: string, as: string): boolean {
  const at = HEADER.length + place.indexOf('@');
  return requirementTokens(HEADER + place.replace('@', () => as)).some(
    (t) => t.range.start === at && WORDS[t.kind] === 1
  );
}

/** Why `name` cannot be written bare as a symbol of `kind`, if it cannot (`isValidId`). */
export function nameReason(name: string, kind?: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (name.includes('"')) return 'A name cannot contain `"`.';
  if (kind === 'class' && name === 'default') return "'default' is the class every box has.";
  if (!/^\w+$/.test(name)) {
    return `'${name}' is written in quotes: a bare name is letters, digits and \`_\` only.`;
  }
  if (!SLOW_WORDS.has(name.toLowerCase())) return undefined;
  const failed = places(kind).find((p) => !readsBack(p, name, name, kindsOf(kind)));
  if (failed === undefined) return undefined;
  return keywordAt(failed, name)
    ? `'${name}' is a keyword.`
    : `'${name}' is written in quotes: it does not read back bare.`;
}

/** `name` in double quotes, when it reads back so in every place (`quoteId`). */
export function quoteName(name: string, kind?: string): string | undefined {
  if (name === '' || /["\r\n]/.test(name) || (kind === 'class' && name === 'default')) {
    return undefined;
  }
  const quoted = `"${name}"`;
  if (!QUOTE_SLOW.test(name) && name.trim() !== '') return quoted;
  return places(kind).every((p) => readsBack(p, quoted, name, kindsOf(kind))) ? quoted : undefined;
}

/** `name` as a rename or completion writes it: bare when it can be, else quoted, else none. */
export function written(name: string, kind: string): string | undefined {
  return nameReason(name, kind) === undefined ? name : quoteName(name, kind);
}
