import { describe, expect, it } from 'vitest';
import { Kind, Probe, sourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { journeyTokens } from './index.ts';
import { lex } from './lexer.ts';
import { T } from './tokens.ts';

const view = (src: string) => {
  const pre = preprocess(src);
  return {
    from: pre.bodyStart,
    view: sourceView(
      src,
      pre.bodyStart,
      pre.directives.map((d) => d.range)
    ),
  };
};
const stream = (src: string) => {
  const { from, view: v } = view(src);
  const s = lex(src, from, v);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => journeyTokens(src).filter((t) => t.kind === kind);
const slices = (src: string, kind: number) =>
  stream(src)
    .filter((t) => t.kind === kind)
    .map((t) => src.slice(t.start, t.end));

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a token
// that runs over one stays one token (the parity gate compares token for token, but these pin
// the ranges too: pitfall 4).
describe('tokens across removed spans', () => {
  it('keeps a task name split by a directive one token, its range over the directive', () => {
    const src = 'journey\nMake %%{init: {}}%%tea: 5: Me';
    const names = of(src, T.TaskName);
    expect(names.map((t) => t.text)).toEqual(['Make tea']);
    expect(src.slice(names[0]?.range.start, names[0]?.range.end)).toBe('Make %%{init: {}}%%tea');
    expect(slices(src, Kind.Directive)).toEqual(['%%{init: {}}%%']);
  });

  it('takes the line after a bare `title` across a comment line', () => {
    const src = 'journey\ntitle\n%% c\nfoo\nT: 1';
    expect(of(src, T.Title).map((t) => t.text)).toEqual(['title\nfoo']);
    expect(slices(src, Kind.Comment)).toEqual(['%% c\n']);
  });

  it('keeps a multi-line accessibility description split by a comment line one token', () => {
    const src = 'journey\naccDescr {\na\n%% c\nb\n}\nT: 1';
    const values = of(src, T.AccDescrMultilineValue);
    expect(values.map((t) => t.text)).toEqual(['a\nb\n']);
    expect(src.slice(values[0]?.range.start, values[0]?.range.end)).toBe('a\n%% c\nb\n');
  });

  it('keeps a run of line breaks around comment lines one token, ranges in order', () => {
    const src = 'journey\nT: 1\n\n%% c\n\nU: 2';
    const tokens = stream(src);
    // The last is the line break v12 appended, clipped to the end of the source.
    expect(slices(src, Kind.Newline)).toEqual(['\n', '\n\n%% c\n\n', '']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('trivia and ranges', () => {
  it('writes the comments jison skipped as trivia, each with its own range', () => {
    const src = 'journey\nT: 1 # a\nTask:%% x\n%y: 2\nU: 3';
    expect(slices(src, Kind.Comment)).toEqual(['# a', ':%% x', '%y: 2']);
    expect(of(src, T.TaskName).map((t) => t.text)).toEqual(['T', 'Task', 'U']);
  });

  it('gives a bare `%%` line one comment that starts at the line break before it', () => {
    const src = 'journey\nT: 1\r\n%%\r\nU: 2';
    expect(slices(src, Kind.Comment)).toEqual(['\r\n%%']);
    expect(slices(src, Kind.Newline)).toEqual(['\n', '\r\n', '']);
  });

  it('gives a CRLF line break one token from its CR, and reads it as LF', () => {
    const src = 'journey\r\ntitle\r\nfoo\r\nT: 1\r\n\r\n';
    expect(slices(src, Kind.Newline)).toEqual(['\r\n', '\r\n', '\r\n\r\n']);
    expect(of(src, T.Title).map((t) => t.text)).toEqual(['title\nfoo']);
  });

  it('keeps task names untrimmed and decodes entities as v12 read them', () => {
    const src = 'journey\nMake #amp; tea  : 5: Me';
    expect(of(src, T.TaskName).map((t) => t.text)).toEqual(['Make &amp; tea  ']);
    expect(of(src, T.TaskData).map((t) => t.text)).toEqual([': 5: Me']);
  });

  it('ends the `accDescr {` opener at its brace and every stream in one zero-width EOF', () => {
    const src = 'journey\naccDescr {  x }';
    expect(slices(src, T.AccDescrMultiline)).toEqual(['accDescr {']);
    expect(slices(src, T.AccDescrMultilineValue)).toEqual(['x ']);
    expect(slices(src, T.AccDescrMultilineEnd)).toEqual(['}']);
    for (const s of [src, 'journey\naccTitle:', 'journey\naccDescr {', 'journey']) {
      const eof = of(s, T.Eof);
      expect(eof.map((t) => [t.range.start, t.range.end])).toEqual([[s.length, s.length]]);
    }
  });
});

describe('lexer modes for the probe', () => {
  const modeAt = (marked: string) => {
    const offset = marked.indexOf('|');
    const src = marked.slice(0, offset) + marked.slice(offset + 1);
    const { from, view: v } = view(src);
    const probe = new Probe(src, offset);
    lex(src, from, v, probe);
    return probe.mode;
  };

  it('names the jison start condition at the offset', () => {
    expect(modeAt('journey\nT: |1')).toBe('INITIAL');
    expect(modeAt('journey\naccTitle: a|b')).toBe('acc_title');
    expect(modeAt('journey\naccDescr: a|b')).toBe('acc_descr');
    expect(modeAt('journey\naccDescr {\na|b\n}')).toBe('acc_descr_multiline');
  });
});
