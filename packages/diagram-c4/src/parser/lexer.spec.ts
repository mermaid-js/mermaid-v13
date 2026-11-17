import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { c4Tokens, JISON_NAMES } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

/** The full stream (trivia and the final `Kind.EOF` included). */
const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
/** Each token of `kind` as its text and its source slice. */
const slices = (src: string, kind: number) =>
  c4Tokens(src)
    .filter((t) => t.kind === kind)
    .map((t) => [t.text, src.slice(t.range.start, t.range.end)]);
/** jison terminal and text of each token with one, as the parity gate sees them. */
const jison = (src: string) =>
  c4Tokens(src).flatMap((t) => {
    const name = JISON_NAMES[t.kind];
    return name ? [`${name}:${t.text}`] : [];
  });
/** {@link jison}, cut after the first lexical error as jison stops there. */
const untilError = (src: string) => {
  const all = jison(src);
  const e = all.findIndex((t) => t.startsWith('LEXICAL_ERROR:'));
  return e === -1 ? all : [...all.slice(0, e), 'LEXICAL_ERROR:'];
};

const H = ['C4_CONTEXT:C4Context', 'NEWLINE:\n'];
const END = ['NEWLINE:', 'EOF:'];

// The expected streams below are v12's (the jison lexer oracle), for the quirks spec #522 lists.
describe('c4Diagram.jison quirks', () => {
  it('lexes a bare header as C4_CONTEXT, the clipped appended NEWLINE and EOF', () => {
    expect(jison('C4Context')).toEqual(['C4_CONTEXT:C4Context', ...END]);
  });

  it('stops an unquoted argument at `)` and at a line break (D452)', () => {
    // v12's `[^,]+` ran over both to the next comma (`STR:a)\nPerson(b`).
    expect(jison('C4Context\nPerson(a)\nPerson(b, "B")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:b',
      'STR:B',
      ...END,
    ]);
    expect(jison('C4Context\nPerson(a, "A", d)\nPerson(b, "B")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'STR: d',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:b',
      'STR:B',
      ...END,
    ]);
    expect(jison('C4Context\nPerson(a)')).toEqual([...H, 'PERSON:Person', 'STR:a', ...END]);
    // A line break in the arguments leaves them, with the macro open: the parser reports it.
    expect(jison('C4Context\nPerson(a, b\nPerson(c, "C")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR: b',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:c',
      'STR:C',
      ...END,
    ]);
    expect(jison('C4Context\nPerson(a, "A"\n)')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'NEWLINE:\n',
      'LEXICAL_ERROR:)',
      ...END,
    ]);
    // A quoted argument still runs over line breaks to its closing quote.
    expect(jison('C4Context\nPerson(a, "A\nB")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A\nB',
      ...END,
    ]);
  });

  it('keeps a blank before a comma: in an unquoted argument, and as one after a quote', () => {
    expect(jison('C4Context\nPerson(a , "A" , "D")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a ',
      'STR:A',
      'STR: ',
      'STR:D',
      ...END,
    ]);
  });

  it('has no escapes in a quoted argument: `\\"` ends it', () => {
    expect(jison('C4Context\nPerson(a, "A \\"q\\" B")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A \\',
      // The rest is unquoted, to the `)` (D452; v12 ran on to the end and rejected).
      'STR:q\\" B"',
      ...END,
    ]);
  });

  it('ends an unclosed quoted argument at the line break before a statement (#681)', () => {
    // v12's `[^"]*` ran on to the next quote, taking the statements in between.
    expect(jison('C4Context\nPerson(a, "A)\nPerson(b, "B")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A)',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:b',
      'STR:B',
      ...END,
    ]);
    // Also across blank lines and an indent, and in a named argument's value.
    expect(jison('C4Context\nPerson(a, "A", $descr="d\n\n  Rel(a, b)')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'STR_KEY:descr',
      'STR_VALUE:d\n',
      'NEWLINE:\n',
      'REL:Rel',
      'STR:a',
      'STR: b',
      ...END,
    ]);
    // A line that only starts like a macro, or is not one, is text; so is a header.
    expect(slices('C4Context\nPerson(a, "A\nPerson is\nFoo(x)\nC4Context")', T.Str)[1]).toEqual([
      'A\nPerson is\nFoo(x)\nC4Context',
      'A\nPerson is\nFoo(x)\nC4Context',
    ]);
  });

  it('reads a tab before an opening quote as a blank (#681)', () => {
    // v12's `[ ]*"` took no tab, so the quotes stayed in the unquoted argument.
    expect(jison('C4Context\nPerson(a,\t"A", \t"")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'ATTRIBUTE_EMPTY: \t""',
      ...END,
    ]);
  });

  it('leaves the line breaks after a `%%` comment to NEWLINE (D452)', () => {
    // v12's comment rule ate them, so the next statement followed with no NEWLINE.
    const src = 'C4Context\nPerson(a,"A") %% c\n\nPerson(b,"B")';
    expect(jison(src)).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'NEWLINE:\n\n',
      'PERSON:Person',
      'STR:b',
      'STR:B',
      ...END,
    ]);
    const comment = stream(src).find((t) => t.kind === Kind.Comment);
    expect(comment && src.slice(comment.start, comment.end)).toBe('%% c');
  });

  it('reads `direction[ \\t]+(TB|BT|RL|LR)\\b` where a token starts, not inside a label (#730)', () => {
    // 12.2.0's `.*direction\\s+LR[^\\n]*` took the line from `Person` on, a label included.
    expect(jison('C4Context\nPerson(a, "the direction LR is")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:the direction LR is',
      ...END,
    ]);
    expect(jison('C4Context\n  direction\tRL\nPerson(a, "A")')).toEqual([
      ...H,
      'direction_rl:direction\tRL',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:a',
      'STR:A',
      ...END,
    ]);
    // The token stops at the value: what follows lexes as usual.
    expect(untilError('C4Context\ndirection LR then direction TB\nx')).toEqual([
      ...H,
      'direction_lr:direction LR',
      'LEXICAL_ERROR:',
    ]);
    expect(untilError('C4Context\ndirection BT Person(a, "A")')).toEqual([
      ...H,
      'direction_bt:direction BT',
      'PERSON:Person',
      'STR:a',
      'STR:A',
      ...END,
    ]);
  });

  it('takes only blanks and a tab between `direction` and its value, and a whole word (#730)', () => {
    // No blank, a line break, U+2028, a longer word and a lower-case value are no `direction`.
    for (const text of [
      'directionTB',
      'direction\nTB',
      'direction\u2028TB',
      'direction TBX',
      'direction tb',
      'direction',
    ]) {
      expect(untilError(`C4Context\n${text}\nPerson(a, "A")`)).toEqual([...H, 'LEXICAL_ERROR:']);
    }
    // A word before it is no statement start: `x` stops the lexer first.
    expect(untilError('C4Context\nxdirection TB')).toEqual([...H, 'LEXICAL_ERROR:']);
  });

  it('reads `title\\s[^\\n;]+` (blanks kept), and a lone `title` as a title (D452)', () => {
    // v12's `\\s` took the line break, and the next line was the title.
    expect(jison('C4Context\ntitle\nPerson(a, "A")')).toEqual([
      ...H,
      'title:title',
      'NEWLINE:\n',
      'PERSON:Person',
      'STR:a',
      'STR:A',
      ...END,
    ]);
    expect(jison('C4Context\ntitle')).toEqual([...H, 'title:title', ...END]);
    expect(untilError('C4Context\ntitle  X  ;y')).toEqual([
      ...H,
      'title:title  X  ',
      'LEXICAL_ERROR:',
    ]);
    // An entity's `#` and `;` were a placeholder to v12, so the title runs over it.
    expect(jison('C4Context\ntitle Caf#233; A')).toEqual([...H, 'title:title Caf&#233; A', ...END]);
  });

  it('runs `title` and `accDescription` over a `#` (#683, v12 fix mermaid-js/mermaid#8039)', () => {
    // 12.2.0's `[^#\n;]+` stopped at the `#` and the rest of the line was a lexical error.
    expect(jison('C4Context\ntitle Order #42')).toEqual([...H, 'title:title Order #42', ...END]);
    expect(jison('C4Context\naccDescription Covers #4864 (#1)')).toEqual([
      ...H,
      'accDescription:accDescription Covers #4864 (#1)',
      ...END,
    ]);
    // `;` and the line break still end them.
    expect(untilError('C4Context\ntitle #1 ;x')).toEqual([
      ...H,
      'title:title #1 ',
      'LEXICAL_ERROR:',
    ]);
    // A title that is only a `#` is one too.
    expect(jison('C4Context\ntitle #')).toEqual([...H, 'title:title #', ...END]);
  });

  it('has no blank rule after a macro keyword', () => {
    expect(untilError('C4Context\nPerson (a, "A")')).toEqual([
      ...H,
      'PERSON:Person',
      'LEXICAL_ERROR:',
    ]);
    expect(untilError('C4Context\nPerson (a)')).toEqual([...H, 'PERSON:Person', 'LEXICAL_ERROR:']);
    // The appended line break: jison throws before it reaches `<<EOF>>`.
    expect(untilError('C4Context\nPerson')).toEqual([...H, 'PERSON:Person', 'LEXICAL_ERROR:']);
  });

  it('reads keywords case-sensitively and word-bounded', () => {
    expect(untilError('C4Context\nPersonX(a)')).toEqual([...H, 'LEXICAL_ERROR:']);
    expect(untilError('C4Context\nperson(a)')).toEqual([...H, 'LEXICAL_ERROR:']);
    expect(jison('C4Context\nRel_Up(a, b, "x")')[2]).toBe('REL_U:Rel_Up');
    expect(jison('C4Context\nDeployment_Node(a, "x") {\n}')[2]).toBe('NODE:Deployment_Node');
    expect(slices('C4Context\nNode_L(a, "x")', T.NodeL)).toEqual([['Node_L', 'Node_L']]);
  });

  it('writes empty arguments as ATTRIBUTE_EMPTY with the characters they matched', () => {
    expect(jison('C4Context\nPerson(, "A",, "")')).toEqual([
      ...H,
      'PERSON:Person',
      'ATTRIBUTE_EMPTY:(,',
      'STR:A',
      'ATTRIBUTE_EMPTY:,,',
      'ATTRIBUTE_EMPTY: ""',
      ...END,
    ]);
  });

  it('reads named arguments: `[^=]*` for the name, `="` then `[^"]+` for the value', () => {
    expect(jison('C4Context\nPerson(a, $k="v", $x)\nPerson(b)')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR_KEY:k',
      'STR_VALUE:v',
      'STR_KEY:x)\nPerson(b)',
    ]);
    expect(untilError('C4Context\nPerson(a, $k=x)')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR_KEY:k',
      'LEXICAL_ERROR:',
    ]);
    expect(jison('C4Context\nPerson(a, $k="v)')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR_KEY:k',
      'STR_VALUE:v)',
    ]);
  });

  it('matches the empty text at the end where a rule can', () => {
    // An unclosed quote: `[^"]*` matches once more.
    expect(jison('C4Context\nPerson(a, "A')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'STR:',
    ]);
    // An unclosed `accDescr {`: `[^\}]*` matches once more.
    expect(jison('C4Context\naccDescr {\n x')).toEqual([
      ...H,
      'acc_descr_multiline_value:x',
      'acc_descr_multiline_value:',
    ]);
  });

  it('reads the accessibility statements', () => {
    expect(jison('C4Context\naccTitle: T\naccDescr {\n x\n}\naccDescr:')).toEqual([
      ...H,
      'acc_title:accTitle: ',
      'acc_title_value:T',
      'NEWLINE:\n',
      'acc_descr_multiline_value:x\n',
      'NEWLINE:\n',
      'acc_descr:accDescr:',
      'acc_descr_value:',
    ]);
    // `accDescr {` and its `}` are kinds with no jison name.
    const src = 'C4Context\naccDescr {\n x\n}';
    expect(slices(src, T.AccDescrBlockStart)).toEqual([['accDescr {\n ', 'accDescr {\n ']]);
    expect(slices(src, T.AccDescrBlockEnd)).toEqual([['}', '}']]);
  });

  it('ends an accessibility statement left open at the end in an empty value', () => {
    // `\s*` after the colon takes the line break v12 appended.
    expect(jison('C4Context\naccTitle:')).toEqual([
      ...H,
      'acc_title:accTitle:',
      'acc_title_value:',
    ]);
    expect(untilError('C4Context\naccDescr x')).toEqual([...H, 'LEXICAL_ERROR:']);
    expect(untilError('C4Context\naccTitle {x}')).toEqual([...H, 'LEXICAL_ERROR:']);
  });

  it('puts the blanks before the last line break of a blank run in NEWLINE', () => {
    expect(jison('C4Context\n  \n  Person(a, "A")  \n')).toEqual([
      'C4_CONTEXT:C4Context',
      'NEWLINE:\n  \n',
      'PERSON:Person',
      'STR:a',
      'STR:A',
      'NEWLINE:  \n',
      'EOF:',
    ]);
  });

  it('reads braces in INITIAL', () => {
    expect(jison('C4Context\nBoundary(b, "B") {\n}')).toEqual([
      ...H,
      'BOUNDARY:Boundary',
      'STR:b',
      'STR:B',
      'LBRACE:{',
      'NEWLINE:\n',
      'RBRACE:}',
      ...END,
    ]);
  });

  it("reads a tag quote v12 turned into `'` as one, and gives entities as v12 decoded them", () => {
    expect(jison('C4Context\nPerson(a, "<b class="x">")')).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      "STR:<b class='x'>",
      ...END,
    ]);
    expect(jison('C4Context\nPerson(a, "x #amp; y")')[4]).toBe('STR:x &amp; y');
  });
});

describe('the C4 token stream', () => {
  it('writes the no-token kinds with their ranges', () => {
    const src = 'C4Context\nPerson(a, "A", $k = "v")';
    const kinds = c4Tokens(src)
      .filter((t) => !JISON_NAMES[t.kind])
      .map((t) => [t.kind, src.slice(t.range.start, t.range.end)]);
    expect(kinds).toEqual([
      [T.ArgsOpen, '('],
      [T.Comma, ','],
      [T.QuoteOpen, ' "'],
      [T.QuoteClose, '"'],
      [T.Comma, ','],
      [T.KeyStart, ' $'],
      [T.KeyEquals, '= "'],
      [T.ValueClose, '"'],
      [T.ArgsClose, ')'],
    ]);
    expect(slices(src, T.StrKey)).toEqual([['k ', 'k ']]);
  });

  it('makes one token across a removed comment line (pitfall 4)', () => {
    const src = 'C4Context\nPerson(a, "A\n%% c\nB")';
    expect(slices(src, T.Str)).toEqual([
      ['a', 'a'],
      ['A\nB', 'A\n%% c\nB'],
    ]);
    // The comment line is trivia inside the token's range, right after the token.
    const all = stream(src);
    const comment = all.findIndex((t) => t.kind === Kind.Comment);
    expect(src.slice(all[comment]?.start, all[comment]?.end)).toBe('%% c\n');
    expect(all[comment - 1]?.kind).toBe(T.Str);
  });

  it('maps ranges to the source with CRLF and CR line breaks', () => {
    const src = 'C4Context\r\nPerson(a, "A")\rPerson(b, "B\r\nC")';
    expect(slices(src, Kind.Newline)).toEqual([
      ['\n', '\r\n'],
      ['\n', '\r'],
      ['', ''],
    ]);
    expect(slices(src, T.Str).at(-1)).toEqual(['B\nC', 'B\r\nC']);
    expect(jison(src)).toEqual(jison(src.replace(/\r\n?/g, '\n')));
  });

  it('writes front matter, directives, comment lines and skipped blanks as trivia', () => {
    const src = '---\ntitle: x\n---\n%%{init: {}}%%\nC4Context\n%% c\n  Person(a, "A")';
    const kinds = stream(src).map((t) => t.kind);
    expect(kinds).toContain(Kind.Directive);
    expect(kinds).toContain(Kind.Comment);
    expect(kinds).toContain(Kind.Space);
    expect(jison(src)).toEqual([...H, 'PERSON:Person', 'STR:a', 'STR:A', ...END]);
    // Offsets never go backwards.
    const starts = stream(src).map((t) => t.start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });

  it('gives a `;` v12 dropped from a `style…:#…;` line to the token before it', () => {
    const src = 'C4Context\nPerson(a, "style:#f") ;';
    expect(slices(src, Kind.Newline).at(-1)).toEqual([' ', ' ;']);
    expect(jison(src)).toEqual([
      ...H,
      'PERSON:Person',
      'STR:a',
      'STR:style:#f',
      'NEWLINE: ',
      'EOF:',
    ]);
  });

  it('writes one-character errors and lexes on in the same state', () => {
    const src = 'C4Context\n;Person(a, "A")';
    const tokens = c4Tokens(src);
    expect(tokens.filter((t) => t.kind === Kind.Error).map((t) => t.text)).toEqual([';']);
    expect(tokens.some((t) => t.kind === T.Person)).toBe(true);
    // In the arguments `$k=x`: each character up to the next `="` is an error.
    const kv = c4Tokens('C4Context\nPerson(a, $k=x)');
    expect(
      kv
        .filter((t) => t.kind === Kind.Error)
        .map((t) => t.text)
        .join('')
    ).toBe('=x)');
  });

  it('ends in a line break after an error at it, and in nothing in a value', () => {
    const kinds = (src: string) => c4Tokens(src).map((t) => t.kind);
    // The line break v12 appended after a macro keyword is a (zero-width) error; it leaves the
    // macro, so jison's EOF_IN_STRUCT is never reached.
    expect(kinds('C4Context\nPerson').slice(-4)).toEqual([
      T.Person,
      Kind.Error,
      Kind.Newline,
      T.Eof,
    ]);
    const error = c4Tokens('C4Context\nPerson\n(a)\nPerson(b)').find((t) => t.kind === Kind.Error);
    expect(error?.range).toEqual({ start: 16, end: 16 });
    // The line break v12 appended leaves the arguments (D452): NEWLINE and EOF follow.
    expect(kinds('C4Context\nPerson(a').slice(-3)).toEqual([T.Str, Kind.Newline, T.Eof]);
    expect(kinds('C4Context\nPerson(a, "A').at(-1)).toBe(T.Str);
    expect(kinds('C4Context\nPerson(a, $k').at(-1)).toBe(T.StrKey);
    // `[^"]+` takes the line break v12 appended: an empty STR_VALUE once clipped.
    expect(kinds('C4Context\nPerson(a, $k="').at(-1)).toBe(T.StrValue);
  });

  it('reads a word no further than one past the longest keyword', () => {
    // `Person\b` fails at each of the first 18 characters, and matches the last `Person`.
    const tokens = c4Tokens(`C4Context\n${'Person'.repeat(4)}(a)`);
    expect(tokens.filter((t) => t.kind === Kind.Error)).toHaveLength(18);
    expect(tokens.filter((t) => t.kind === T.Person).map((t) => t.range.start)).toEqual([28]);
  });
});
