import { describe, expect, it } from 'vitest';
import { Kind } from '@mermaid-js/core/parser-kit';
import { classTokens, lexClass } from './tokens-api.ts';
import { JISON_NAMES } from './jison-names.ts';

const names = (src: string) =>
  classTokens(src).map((t) => `${JISON_NAMES[t.kind] ?? t.kind}:${JSON.stringify(t.text)}`);
const slices = (src: string) => classTokens(src).map((t) => src.slice(t.range.start, t.range.end));

describe('class lexer', () => {
  it('lexes both headers as CLASS_DIAGRAM (D101)', () => {
    expect(names('classDiagram\nA')).toEqual([
      'CLASS_DIAGRAM:"classDiagram"',
      'NEWLINE:"\\n"',
      'ALPHA:"A"',
      'NEWLINE:""',
      'EOF:""',
    ]);
    expect(names('classDiagram-v2\nA')[0]).toBe('CLASS_DIAGRAM:"classDiagram-v2"');
  });

  // Expected streams: the v12 jison lexer's output for the same text.
  it('lexes class bodies, generics, strings and relations', () => {
    expect(
      names('classDiagram\nclass A~T~ {\n  +int x\n}\nA <|-- B : "1" uses\nnote for A "hi"')
    ).toEqual([
      'CLASS_DIAGRAM:"classDiagram"',
      'NEWLINE:"\\n"',
      'CLASS:"class"',
      'ALPHA:"A"',
      'GENERICTYPE:"T"',
      'STRUCT_START:"{"',
      'MEMBER:"  +int x"',
      'STRUCT_STOP:"}"',
      'NEWLINE:"\\n"',
      'ALPHA:"A"',
      'EXTENSION:"<|"',
      'LINE:"--"',
      'ALPHA:"B"',
      'LABEL:": \\"1\\" uses"',
      'NEWLINE:"\\n"',
      'NOTE_FOR:"note for"',
      'ALPHA:"A"',
      'STR:"hi"',
      'NEWLINE:""',
      'EOF:""',
    ]);
  });

  it('gives every token its source range, across CRLF and removed comment lines', () => {
    const src = 'classDiagram\r\n%% gone\r\nnote "a\r\n%% inside\r\nb"\r\n';
    expect(slices(src)).toEqual([
      'classDiagram',
      '\r\n',
      'note',
      // One STR token for v12's one STR token: its range covers the removed comment.
      'a\r\n%% inside\r\nb',
      '\r\n',
      '',
    ]);
    expect(classTokens(src)[3]?.text).toBe('a\nb');
  });

  it('writes removed comments and directives as trivia, in source order', () => {
    const src = '%%{init: {}}%%\nclassDiagram\n%% c\nA %% tail\nB';
    const l = lexClass(src);
    const trivia: string[] = [];
    let last = -1;
    for (let i = 0; i < l.tokens.length; i++) {
      const start = l.tokens.start[i] ?? 0;
      expect(start).toBeGreaterThanOrEqual(last);
      last = start;
      const k = l.tokens.kind[i];
      if (k === Kind.Comment || k === Kind.Directive)
        trivia.push(src.slice(start, l.tokens.end[i]));
    }
    expect(trivia).toEqual(['%%{init: {}}%%', '%% c\n', '%% tail\n']);
  });

  it('keeps entity text as v12 read it, and stops a label where v12 did', () => {
    expect(names('classDiagram\nA : x #35; y;z')).toContain('LABEL:": x &#35; y"');
  });

  it('writes an error token for input jison rejects, and carries on', () => {
    expect(names('classDiagram\n}\nA')).toEqual([
      'CLASS_DIAGRAM:"classDiagram"',
      'NEWLINE:"\\n"',
      'INVALID:"}"',
      'NEWLINE:"\\n"',
      'ALPHA:"A"',
      'NEWLINE:""',
      'EOF:""',
    ]);
  });
});
