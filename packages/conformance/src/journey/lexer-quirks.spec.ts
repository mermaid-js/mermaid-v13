import { describe, expect, it } from 'vitest';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { excludeAccEof, v12Tokens, v13Tokens } from './gate.ts';

/**
 * The T1 quirks of spec #290, and the ones found while gating (#310): each written out as the
 * tokens jison gives, then checked against the oracle and the v13 lexer. A quirk that changes in
 * either fails here by name, not as one diff among the parity gate's.
 */
const J: JisonToken[] = [
  ['journey', 'journey'],
  ['NEWLINE', '\n'],
];
const NL: JisonToken = ['NEWLINE', '\n'];
const EOF: JisonToken = ['EOF', ''];
/** The line break v12 appended, clipped to the end of the source. */
const END: JisonToken = ['NEWLINE', ''];

const QUIRKS: { name: string; source: string; tokens: JisonToken[] }[] = [
  {
    name: 'a bare `title` takes the next line as its text (`\\s` matches a line break)',
    source: 'journey\ntitle\nfoo\nT: 1',
    tokens: [...J, ['title', 'title\nfoo'], NL, ['taskName', 'T'], ['taskData', ': 1'], END, EOF],
  },
  {
    name: 'a bare `section` takes the next line as its name',
    source: 'journey\nsection\nA\nT: 5',
    tokens: [...J, ['section', 'section\nA'], NL, ['taskName', 'T'], ['taskData', ': 5'], END, EOF],
  },
  {
    name: 'a bare `title` before a blank line is a task name (`[^#\\n;]+` needs a character)',
    source: 'journey\ntitle\n\nfoo',
    tokens: [...J, ['taskName', 'title'], ['NEWLINE', '\n\n'], ['taskName', 'foo'], END, EOF],
  },
  {
    name: 'the line break after `title` in a CRLF source is one `\\s`',
    source: 'journey\r\ntitle\r\nfoo\r\n',
    tokens: [...J, ['title', 'title\nfoo'], NL, EOF],
  },
  {
    name: '`accTitle:` at a line end takes the next line: `accTitle:\\nsection A` opens no section',
    source: 'journey\naccTitle:\nsection A',
    tokens: [...J, ['acc_title', 'accTitle:\n'], ['acc_title_value', 'section A'], END, EOF],
  },
  {
    name: '`accDescr:` at a line end takes the next non-blank line',
    source: 'journey\naccDescr:\n\n  T: 1',
    tokens: [...J, ['acc_descr', 'accDescr:\n\n  '], ['acc_descr_value', 'T: 1'], END, EOF],
  },
  {
    name: '`\\s+` swallows a line break after other blanks: a blank line gives no NEWLINE',
    source: 'journey\nA: 1\n  \nB: 2',
    tokens: [
      ...J,
      ['taskName', 'A'],
      ['taskData', ': 1'],
      NL,
      ['taskName', 'B'],
      ['taskData', ': 2'],
      END,
      EOF,
    ],
  },
  {
    name: 'blanks after `journey` take its line break: no NEWLINE before the first statement',
    source: 'journey  \ntitle x',
    tokens: [['journey', 'journey'], ['title', 'title x'], END, EOF],
  },
  {
    name: '`%%` after the start of a token is data: `T: 5 %% note`',
    source: 'journey\nT: 5 %% note',
    tokens: [...J, ['taskName', 'T'], ['taskData', ': 5 %% note'], END, EOF],
  },
  {
    name: '`Task:%% x` is `Task` and a comment that eats the `:` (`[^\\}]%%[^\\n]*`)',
    source: 'journey\nTask:%% x',
    tokens: [...J, ['taskName', 'Task'], END, EOF],
  },
  {
    name: 'a bare `%%` line also eats the line break before it',
    source: 'journey\nT: 1\n%%\nU: 2',
    tokens: [
      ...J,
      ['taskName', 'T'],
      ['taskData', ': 1'],
      NL,
      ['taskName', 'U'],
      ['taskData', ': 2'],
      END,
      EOF,
    ],
  },
  {
    name: 'one `%` where a token starts is a comment (`\\%%` is `%` to jison), `%{` is not',
    source: 'journey\n%x: 1\n%{y: 2',
    tokens: [...J, NL, ['taskName', '%{y'], ['taskData', ': 2'], END, EOF],
  },
  {
    name: '`journey planning: 5` is the keyword, then a task',
    source: 'journey planning: 5',
    tokens: [['journey', 'journey'], ['taskName', 'planning'], ['taskData', ': 5'], END, EOF],
  },
  {
    name: '`journey` ends at an ASCII word boundary, in any case',
    source: 'journey\njourney_x: 1\njourney-x: 2\nJOURNEY: 3',
    tokens: [
      ...J,
      ['taskName', 'journey_x'],
      ['taskData', ': 1'],
      NL,
      ['journey', 'journey'],
      ['taskName', '-x'],
      ['taskData', ': 2'],
      NL,
      ['journey', 'JOURNEY'],
      ['taskData', ': 3'],
      END,
      EOF,
    ],
  },
  {
    name: 'a line starting `title ` is a title even with a colon',
    source: 'journey\nTitle X: 5',
    tokens: [...J, ['title', 'Title X: 5'], END, EOF],
  },
  {
    name: '`section A: b` is a section and a stray `taskData`',
    source: 'journey\nsection A: b',
    tokens: [...J, ['section', 'section A'], ['taskData', ': b'], END, EOF],
  },
  {
    name: '`Make tea # c: 5` is a task name and a comment',
    source: 'journey\nMake tea # c: 5',
    tokens: [...J, ['taskName', 'Make tea '], END, EOF],
  },
  {
    name: '`#59;` is an entity placeholder, never a comment and a `;`',
    source: 'journey\nT: #59; x',
    tokens: [...J, ['taskName', 'T'], ['taskData', ': &#59; x'], END, EOF],
  },
  {
    name: 'a `:` with nothing after it is the `:` terminal; `;` is INVALID',
    source: 'journey\nT:\nU: 2;V: 3',
    tokens: [
      ...J,
      ['taskName', 'T'],
      [':', ':'],
      NL,
      ['taskName', 'U'],
      ['taskData', ': 2'],
      ['INVALID', ';'],
      ['taskName', 'V'],
      ['taskData', ': 3'],
      END,
      EOF,
    ],
  },
  {
    name: 'an accessibility value that ends the text is followed by no EOF (exclusion)',
    source: 'journey\naccTitle:',
    tokens: [...J, ['acc_title', 'accTitle:'], ['acc_title_value', '']],
  },
  {
    name: 'an unclosed `accDescr {` ends in an empty value and no EOF (exclusion)',
    source: 'journey\naccDescr {\nunclosed',
    tokens: [...J, ['acc_descr_multiline_value', 'unclosed'], ['acc_descr_multiline_value', '']],
  },
];

describe('journey lexer quirks (spec #290 T1), checked against mermaid@12', () => {
  it.each(QUIRKS)('$name', async ({ source, tokens }) => {
    const oracle = await loadJisonLexerOracle('journey');
    const v12 = await v12Tokens(oracle, source);
    expect(v12).toEqual(tokens);
    expect(excludeAccEof(tokens, v13Tokens(source))).toEqual(tokens);
  });

  it('writes the EOF jison leaves out after an accessibility value at the end', () => {
    expect(v13Tokens('journey\naccTitle:').at(-1)).toEqual(EOF);
  });
});
