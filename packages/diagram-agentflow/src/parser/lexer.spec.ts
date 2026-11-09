import { describe, expect, it } from 'vitest';
import { cook, Kind } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { JISON_NAMES } from './jison-names.ts';
import { lex } from './lexer.ts';
import { agentflowSourceView } from './source.ts';
import { agentflowTokens } from './tokens-api.ts';
import { T } from './tokens.ts';

/**
 * Unit checks of the agentflow lexer. The token streams below are mermaid 12.2.0's for the
 * same input (checked through the shared jison oracle; the gate in `packages/conformance`
 * compares the whole corpus); ranges, trivia and one-token-per-v12-token are v13's own
 * (pitfalls 1 and 4).
 */
const H = 'agentflow-beta\n';

const OWN: Record<number, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

/**
 * `NAME:text` per significant token but the final `Kind.EOF`, by jison name (v13-only kinds
 * by their `T` name).
 */
function names(src: string): string[] {
  return significant(src).map((t) => `${JISON_NAMES[t.kind] ?? OWN[t.kind]}:${t.text}`);
}

const significant = (src: string) => agentflowTokens(src).filter((t) => t.kind !== Kind.EOF);

/** Every token of the stream, trivia included: kind, source range and text. */
function stream(src: string): [number, number, number, string][] {
  const pre = preprocess(src);
  const view = agentflowSourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  const out: [number, number, number, string][] = [];
  for (let j = 0; j < s.length; j++) {
    const a = s.start[j] ?? 0;
    const b = s.end[j] ?? 0;
    out.push([s.kind[j] ?? 0, a, b, cook(src, a, b, view)]);
  }
  return out;
}

describe('agentflow lexer', () => {
  it('lexes the header, its direction and a statement', () => {
    expect(names('agentflow-beta LR\n  a --> b')).toEqual([
      'GRAPH:agentflow-beta',
      'DIR: LR',
      'NEWLINE:\n',
      'SPACE: ',
      'SPACE: ',
      'NODE_STRING:a',
      'LINK: --> ',
      'NODE_STRING:b',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('keeps leading blank lines and comments: v12 lexed them untrimmed', () => {
    expect(names('%% c\n\n agentflow-beta\n a').slice(0, 5)).toEqual([
      'COMMENT:%% c',
      'NEWLINE:\n\n',
      'SPACE: ',
      'GRAPH:agentflow-beta',
      'NODIR:\n',
    ]);
  });

  it('lexes the agentflow keywords with jison’s word boundaries and trailing blanks', () => {
    expect(names(H + 'flow f\nend \t\nglobal  \nconnector gh\nflowx\nflow-x').slice(2)).toEqual([
      'flow:flow',
      'SPACE: ',
      'NODE_STRING:f',
      'NEWLINE:\n',
      'end:end \t',
      'NEWLINE:\n',
      'global:global  ',
      'NEWLINE:\n',
      'connector:connector',
      'SPACE: ',
      'NODE_STRING:gh',
      'NEWLINE:\n',
      'NODE_STRING:flowx',
      'NEWLINE:\n',
      'flow:flow',
      'NODE_STRING:-x',
      'NEWLINE:',
      'EOF:',
    ]);
  });

  it('lexes only agentflow’s links', () => {
    expect(names(H + 'a --x b -.- c --- d').slice(2)).toEqual([
      'NODE_STRING:a',
      'LINK: --x ',
      'NODE_STRING:b',
      'LINK: -.- ',
      'NODE_STRING:c',
      'START_LINK: --',
      'EDGE_TEXT:- d',
    ]);
    // `==>` and `~~~` match no agentflow rule; `<-->` is a `<` before a link.
    expect(names(H + 'a ==> b').slice(4, 5)).toEqual(['INVALID:=']);
    expect(names(H + 'a ~~~ b').slice(4, 5)).toEqual(['INVALID:~']);
    expect(names(H + 'a <--> b').slice(4, 6)).toEqual(['TAGSTART:<', 'LINK:--> ']);
  });

  it('lexes comments as tokens, blanks before them included, and `.*direction` first', () => {
    expect(names(H + ' a --> b %% c\n\t%% d\n%% direction LR').slice(2)).toEqual([
      'SPACE: ',
      'NODE_STRING:a',
      'LINK: --> ',
      'NODE_STRING:b',
      'COMMENT: %% c',
      'NEWLINE:\n',
      'COMMENT:\t%% d',
      'NEWLINE:\n',
      'direction_lr:%% direction LR',
      'NEWLINE:',
      'EOF:',
    ]);
    // `%` is an id character, so a comment needs a blank or a line start before it.
    expect(names(H + 'a%% c').slice(2, 3)).toEqual(['NODE_STRING:a%%']);
  });

  it('skips a comment inside a label as trivia, up to its line break', () => {
    const src = H + 'a[x %% y]\nz]';
    expect(names(src).slice(2)).toEqual([
      'NODE_STRING:a',
      'SQS:[',
      'TEXT:x ',
      'TEXT:\nz',
      'SQE:]',
      'NEWLINE:',
      'EOF:',
    ]);
    const comment = stream(src).find(([k]) => k === Kind.Comment);
    expect(comment).toEqual([Kind.Comment, src.indexOf('%%'), src.indexOf('\nz'), '%% y]']);
  });

  it('reads a lone `%` in a label as text (D463), and `%%{` there as an error', () => {
    expect(names(H + 'a[50% done]').slice(4, 6)).toEqual(['TEXT:50% done', 'SQE:]']);
    expect(names(H + 'a[/1% x/]').slice(4, 6)).toEqual(['TEXT:1% x', 'INVTRAPEND:/]']);
    expect(names(H + 'a[x %%{ }]').slice(4, 6)).toEqual(['TEXT:x ', 'INVALID:%']);
  });

  it('drops the blanks between a `}` and its line break, which belong to no token', () => {
    const src = H + 'a{b} \t \n\nc@{ x: 1 }  ';
    expect(names(src).slice(2)).toEqual([
      'NODE_STRING:a',
      'DIAMOND_START:{',
      'TEXT:b',
      'DIAMOND_STOP:}',
      'NEWLINE:\n\n',
      'NODE_STRING:c',
      'SHAPE_DATA:@{',
      'SHAPE_DATA: x: 1 ',
      'ShapeDataEnd:}',
      'NEWLINE:',
      'EOF:',
    ]);
    const stop = stream(src).find(([k]) => k === T.DiamondStop);
    expect(stop?.slice(1, 3)).toEqual([src.indexOf('}'), src.indexOf('}') + 1]);
    expect(names(H + 'a["x }  \n y"]')[4]).toBe('STR:x }\n y');
  });

  it('gives the `;` v12 dropped to the token before it, comment lines included', () => {
    const src = H + 'style a fill:#f00;\n%% style b fill:#0f0;';
    const tokens = agentflowTokens(src);
    const last = tokens.find((t) => t.text === 'f00');
    expect(last?.range.end).toBe(src.indexOf(';') + 1);
    expect(names(src).slice(-3)).toEqual(['COMMENT:%% style b fill:#0f0', 'NEWLINE:', 'EOF:']);
  });

  it('emits one token across a removed directive, with a range that covers it (pitfall 4)', () => {
    const src = H + 'ab%%{init: {}}%%cd --> e[x%%{init: {}}%%y]';
    const tokens = agentflowTokens(src);
    const id = tokens.find((t) => t.kind === T.NodeString);
    expect(id).toEqual({
      kind: T.NodeString,
      text: 'abcd',
      range: { start: H.length, end: src.indexOf('cd') + 2 },
    });
    const text = tokens.filter((t) => t.kind === T.Text);
    expect(text.map((t) => t.text)).toEqual(['xy']);
    // Directives are trivia, in source order.
    const all = stream(src);
    expect(all.filter(([k]) => k === Kind.Directive).map(([, a]) => a)).toEqual([
      src.indexOf('%%{'),
      src.lastIndexOf('%%{'),
    ]);
    const starts = all.map(([, a]) => a);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });

  it('reads CRLF and CR as line breaks and SPACE as one blank a token', () => {
    const src = 'agentflow-beta\r\n a\r b  c';
    const tokens = significant(src);
    expect(tokens.map((t) => [JISON_NAMES[t.kind], t.text])).toEqual([
      ['GRAPH', 'agentflow-beta'],
      ['NODIR', '\n'],
      ['SPACE', ' '],
      ['NODE_STRING', 'a'],
      ['NEWLINE', '\n'],
      ['SPACE', ' '],
      ['NODE_STRING', 'b'],
      ['SPACE', ' '],
      ['SPACE', ' '],
      ['NODE_STRING', 'c'],
      ['NEWLINE', ''],
      ['EOF', ''],
    ]);
    expect(tokens[1]?.range).toEqual({ start: 14, end: 16 });
  });

  it('lexes an empty text and a lone header', () => {
    expect(names('')).toEqual(['NEWLINE:', 'EOF:']);
    expect(names('agentflow-beta')).toEqual(['GRAPH:agentflow-beta', 'NODIR:', 'EOF:']);
  });
});
