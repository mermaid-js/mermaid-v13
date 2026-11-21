/**
 * The defaults `RuleParser` gives the langium-family parsers: `unexpected` (the default `fail`
 * body) with its `unmatched` and `failHint` hooks, `lineEnd`, `textStatement` and `finish`
 * (D218). They are tested here through a small parser over a grammar of `go`, `end`, `warn`
 * and the three text statements.
 */
import { describe, expect, it } from 'vitest';
import {
  ExpectedTable,
  FIRST_DIAGRAM_KIND,
  isBlank,
  Kind,
  kindSet,
  newlineAt,
} from '@mermaid-js/core/parser-kit';
import type { Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { isBreak, RuleLexer, SKIP } from './rule-lexer.ts';
import { RuleParser } from './rule-parser.ts';
import type { RuleGrammar, TextNode } from './rule-parser.ts';
import { textProbeMode, textStatements } from './rule-text.ts';
import type { TextValues } from './rule-text.ts';
import { STOP } from './support.ts';

const F = FIRST_DIAGRAM_KIND;
const T = { Go: F, End: F + 1, Warn: F + 2, AccDescr: F + 3, AccTitle: F + 4, Title: F + 5 };
const TEXT = [T.Title, T.AccTitle, T.AccDescr];
const STATEMENTS = [T.Go, T.Warn, ...TEXT];
const DOC = [...STATEMENTS, Kind.Newline, Kind.EOF];
const TEXTS = textStatements(T.Title, T.AccTitle, T.AccDescr);

class TestLexer extends RuleLexer {
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.keyword('go', p, T.Go);
    if (e < 0) e = this.keyword('end', p, T.End);
    if (e < 0) e = this.keyword('warn', p, T.Warn);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    return e;
  }
}

const lex = (src: string, from: number, view: SourceView): TokenStream =>
  new TestLexer(src, from, view, {
    accDescr: T.AccDescr,
    accTitle: T.AccTitle,
    title: T.Title,
    charsPerToken: 4,
  }).run();

const EXPECTED = new ExpectedTable([
  ['`go`', [T.Go]],
  ['`warn`', [T.Warn]],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

const GRAMMAR: RuleGrammar = {
  lex,
  trivia: kindSet(Kind.Comment, Kind.Space),
  probeMode: textProbeMode({ texts: TEXTS, accDescr: T.AccDescr }),
  expected: EXPECTED,
  statements: STATEMENTS,
  onePerLine: 'one statement per line',
};

type Unmatched = 'default' | 'report' | 'return';

class TestParser extends RuleParser<PreprocessResult> {
  readonly children: TextNode[] = [];
  readonly texts: TextValues = { title: '', accTitle: '', accDescr: '' };
  readonly unmatchedCalls: { where: Range; want: readonly number[] }[] = [];

  constructor(
    src: string,
    grammar: RuleGrammar = GRAMMAR,
    private readonly mode: Unmatched = 'default'
  ) {
    super(src, preprocess(src), true, grammar, undefined);
  }

  parse() {
    for (;;) {
      this.tested(DOC);
      const k = this.kind();
      if (k === Kind.EOF) break;
      if (k === Kind.Newline) {
        this.i++;
        continue;
      }
      const text = TEXTS[k];
      this.statement(() => {
        if (text) this.textStatement(text, this.texts, this.children);
        else if (k === T.Go || k === T.Warn) {
          if (k === T.Warn) this.st.diagnostics.warning('TEST_WARN', 'a warning', this.range());
          this.i++;
          this.lineEnd();
        } else this.fail(DOC);
      });
    }
    return this.finish({ count: this.children.length }, this.texts, this.children, {});
  }

  protected override unmatched(where: Range, want: readonly number[]): void {
    if (this.mode === 'default') return super.unmatched(where, want);
    this.unmatchedCalls.push({ where, want });
    if (this.mode === 'report') {
      this.st.diagnostics.error('TEST_UNMATCHED', `Unmatched \`${this.raw()}\`.`, where);
      throw STOP;
    }
  }
}

/** The messages of the parse's error diagnostics. */
function errors(parser: TestParser): string[] {
  const result = parser.parse();
  return result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
}

describe('RuleParser.unexpected (the default fail)', () => {
  it('names what the grammar expected, from its `expected` table', () => {
    expect(errors(new TestParser('end'))).toEqual([
      'Expected `go`, `warn`, `title`, `accTitle:` or `accDescr`, a line break or the end of the text, got `end`.',
    ]);
  });

  it('gives no hint by default (failHint)', () => {
    const [message] = errors(new TestParser('end'));
    expect(message).not.toContain(';');
  });

  it('reports an error token as unexpected when unmatched returns (the default)', () => {
    const result = new TestParser('go ???').parse();
    expect(result.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['UNEXPECTED', 'Expected a line break or the end of the text, got `???`.'],
    ]);
  });

  it('hands an error token to unmatched first, with where and what was expected', () => {
    const parser = new TestParser('go ???', GRAMMAR, 'return');
    const result = parser.parse();
    expect(parser.unmatchedCalls).toEqual([
      { where: { start: 3, end: 6 }, want: [Kind.Newline, Kind.EOF] },
    ]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
  });

  it('lets unmatched report the token itself and stop the statement', () => {
    const result = new TestParser('go ???\ngo', GRAMMAR, 'report').parse();
    expect(result.diagnostics.map((d) => [d.code, d.message, d.range])).toEqual([
      ['TEST_UNMATCHED', 'Unmatched `???`.', { start: 3, end: 6 }],
    ]);
  });

  it('names "something else" when the grammar has no `expected` table', () => {
    const { expected: _, ...bare } = GRAMMAR;
    expect(errors(new TestParser('end', bare))).toEqual(['Expected something else, got `end`.']);
  });

  it('recovers at the line end and goes on with the next statement', () => {
    const result = new TestParser('end\ntitle After').parse();
    expect(result.model.title).toBe('After');
  });
});

describe('RuleParser.lineEnd', () => {
  it('gives the onePerLine hint when a statement follows another on its line', () => {
    expect(errors(new TestParser('go go'))).toEqual([
      'Expected a line break or the end of the text, got `go`; one statement per line.',
    ]);
  });

  it('gives no hint for a token that is not a statement', () => {
    expect(errors(new TestParser('go end'))).toEqual([
      'Expected a line break or the end of the text, got `end`.',
    ]);
  });

  it('accepts a line break or the end of the text', () => {
    expect(errors(new TestParser('go\ngo\n\ngo'))).toEqual([]);
  });

  it('gives no hint when the grammar names no statements', () => {
    const { statements: _, ...bare } = GRAMMAR;
    expect(errors(new TestParser('go go', bare))).toEqual([
      'Expected a line break or the end of the text, got `go`.',
    ]);
  });
});

describe('RuleParser.textStatement', () => {
  it('keeps the last value of each, as v12 did, with a node and a statement span each', () => {
    const src = 'title First\n  accTitle: Acc\naccDescr: Descr\ntitle Second';
    const parser = new TestParser(src);
    const result = parser.parse();
    expect(parser.texts).toEqual({ title: 'Second', accTitle: 'Acc', accDescr: 'Descr' });
    expect(result.ast.children).toEqual([
      { id: 'title', type: 'Title', range: { start: 0, end: 11 }, text: 'First' },
      { id: 'accTitle', type: 'AccTitle', range: { start: 14, end: 27 }, text: 'Acc' },
      { id: 'accDescr', type: 'AccDescr', range: { start: 28, end: 43 }, text: 'Descr' },
      { id: 'title@2', type: 'Title', range: { start: 44, end: 56 }, text: 'Second' },
    ]);
    expect(result.statements.map((s) => s.kind)).toEqual([
      'title',
      'accTitle',
      'accDescr',
      'title',
    ]);
  });
});

describe('RuleParser.finish', () => {
  it('takes the in-text title over the front-matter one (D218)', () => {
    const { model } = new TestParser('---\ntitle: Front\n---\ntitle Body').parse();
    expect(model.title).toBe('Body');
  });

  it('falls back to the front-matter title when the in-text one is empty (D218)', () => {
    expect(new TestParser('---\ntitle: Front\n---\ngo').parse().model.title).toBe('Front');
    expect(new TestParser('---\ntitle: Front\n---\ntitle \ngo').parse().model.title).toBe('Front');
  });

  it('leaves `title` out when there is neither', () => {
    const { model } = new TestParser('go').parse();
    expect('title' in model).toBe(false);
  });

  it('puts the fields first, then the text values and the warnings, all frozen', () => {
    const { model } = new TestParser('warn\naccTitle: A\naccDescr: D\ntitle T').parse();
    expect(Object.keys(model)).toEqual(['count', 'title', 'accTitle', 'accDescr', 'warnings']);
    expect(model).toMatchObject({ count: 3, title: 'T', accTitle: 'A', accDescr: 'D' });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.warnings)).toBe(true);
  });

  it('keeps only the warnings, which are also in the diagnostics', () => {
    const result = new TestParser('warn\nend').parse();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['TEST_WARN', 'UNEXPECTED']);
    expect(result.model.warnings.map((d) => d.code)).toEqual(['TEST_WARN']);
  });

  it('makes a Document node over the body, holding the children', () => {
    const src = '---\ntitle: Front\n---\ntitle Body\n';
    const parser = new TestParser(src);
    const { ast } = parser.parse();
    expect(ast).toEqual({
      id: 'doc',
      type: 'Document',
      range: { start: src.indexOf('title Body'), end: src.length },
      children: parser.children,
    });
  });
});
