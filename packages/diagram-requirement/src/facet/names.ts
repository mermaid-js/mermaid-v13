// cspell:words acctitle accdescr
/**
 * Which names a rename may write bare, and how one is quoted (D437, D191). A name goes in many
 * places: a box header, either end of a relation, the `:::` shorthand, and the targets of `style`
 * and `class`, which lex as `\w+` only (v12's style state). A bare name must read back as itself
 * in every one of them, so only `\w+` that is no keyword, nor starts one (`title x`), is bare; any
 * other name a quoted string can hold is written in quotes (`quoteId`).
 *
 * Neither check parses per name, so completion costs the same whatever the names are: a `\w+`
 * that no keyword rule can take is bare, and the few words one can (the keywords, `title`, the
 * `acc…` openers, `direction`) are parsed in each place once per word (case-insensitive, as the
 * lexer) and remembered. Quoting is decided by the two things that read text inside quotes:
 * v12's `#name;` entities and core's directives. `quotedReadsBack` is the parse-based check the
 * spec holds that rule to.
 */
import { kindSet } from '@mermaid-js/core/parser-kit';
import { requirementTokens } from '../parser/index.ts';
import { parseRequirement } from '../parser/parser.ts';
import { KEYWORD_SPELLINGS, T } from '../parser/tokens.ts';

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
const BOX_KINDS = ['requirement', 'element'];

/** Kinds a word may lex as other than a name: the keyword rules, `title …`, the `acc…` openers. */
const KEYWORD_KINDS = kindSet(
  ...KEYWORD_SPELLINGS.map(([kind]) => kind),
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrOpen
);

/**
 * The lower-case words a token other than a name can start with (the keyword rules, `title x`,
 * `accDescr {`, a line-start `direction LR`); every other `\w+` reads back bare everywhere.
 */
const KEYWORD_LIKE_WORDS: ReadonlySet<string> = new Set([
  ...KEYWORD_SPELLINGS.map(([, s]) => s.toLowerCase()),
  'title',
  'acctitle',
  'accdescr',
  'direction',
]);

/** v12 reads `#name;` as an entity, in quotes too: such a name never reads back. */
const ENTITY = /#\w+;/;
/** `%%{` and a word is a directive (core's `scanDirectives`), in quotes too. */
const DIRECTIVE_OPENER = /%%\{[ \t]*\w/;

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

const places = (kind: string | undefined) => (kind === 'class' ? CLASS_PLACES : BOX_PLACES);
const kindsOf = (kind: string | undefined) => (kind === 'class' ? ['class'] : BOX_KINDS);

/** Whether the lexer reads a keyword (`test`, `title x`) where `as` starts in `place`. */
function keywordAt(place: string, as: string): boolean {
  const at = HEADER.length + place.indexOf('@');
  return requirementTokens(HEADER + place.replace('@', () => as)).some(
    (t) => t.range.start === at && KEYWORD_KINDS[t.kind] === 1
  );
}

/**
 * For each keyword-like word (lower case) and symbol kind: `keyword`, `unread` (it does not read
 * back bare somewhere) or `bare`. A bounded table, filled on first use.
 */
const keywordLikeVerdicts = new Map<string, 'keyword' | 'unread' | 'bare'>();

function keywordLikeVerdict(word: string, kind: string | undefined): 'keyword' | 'unread' | 'bare' {
  const key = `${kind === 'class' ? 'class' : 'box'}:${word}`;
  let verdict = keywordLikeVerdicts.get(key);
  if (verdict === undefined) {
    const failed = places(kind).find((p) => !readsBack(p, word, word, kindsOf(kind)));
    if (failed === undefined) verdict = 'bare';
    else verdict = keywordAt(failed, word) ? 'keyword' : 'unread';
    keywordLikeVerdicts.set(key, verdict);
  }
  return verdict;
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
  const word = name.toLowerCase();
  if (!KEYWORD_LIKE_WORDS.has(word)) return undefined;
  switch (keywordLikeVerdict(word, kind)) {
    case 'bare':
      return undefined;
    case 'keyword':
      return `'${name}' is a keyword.`;
    case 'unread':
      return `'${name}' is written in quotes: it does not read back bare.`;
  }
}

/** `name` in double quotes, when a quoted string holds it as written (`quoteId`). */
export function quoteName(name: string, kind?: string): string | undefined {
  if (name === '' || /["\r\n]/.test(name) || (kind === 'class' && name === 'default')) {
    return undefined;
  }
  return ENTITY.test(name) || DIRECTIVE_OPENER.test(name) ? undefined : `"${name}"`;
}

/** Whether `"name"` reads back as `name` in every place a `kind` name goes (by parsing each). */
export function quotedReadsBack(name: string, kind?: string): boolean {
  return places(kind).every((p) => readsBack(p, `"${name}"`, name, kindsOf(kind)));
}

/** The text that stands for `name` where a name goes: bare, else quoted, else none. */
export function nameAsWritten(name: string, kind: string): string | undefined {
  return nameReason(name, kind) === undefined ? name : quoteName(name, kind);
}
