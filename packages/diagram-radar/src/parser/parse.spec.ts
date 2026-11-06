import { describe, expect, it } from 'vitest';
import { parseRadar } from './index.ts';

/**
 * The radar parser and model (#446), one-line probes: the headers and statement separators,
 * D356's single unknown entry, D218's title and D357's keyword names. The multi-line diagrams
 * (`e2e/diagrams/radar/nightly-check/parser-*.mmd`) and the recovery set are checked in
 * `packages/conformance/src/radar/{parser,recovery}.spec.ts`; accept/reject and model parity
 * over the corpus are the conformance suite's too.
 */
const parse = (src: string) => parseRadar(src);
const errors = (src: string) =>
  parse(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('radar parser', () => {
  it('accepts the three headers and statements sharing a line', () => {
    for (const src of [
      'radar-beta',
      'radar-beta:',
      ' radar-beta :\naxis A',
      'radar-beta title Hi\naxis A',
      'radar-beta\naxis A curve c{1}',
      'radar-beta\naxis A\ncurve c{A:1} ticks 3',
      'radar-beta\naxis A, B\ncurve c{\n\n1,\n\n2\n\n}',
      'radar-beta\naxis A\ncurve c{A 1}',
      '\n\nradar-beta\n\n',
    ]) {
      expect(errors(src), src).toEqual([]);
    }
    for (const src of [
      'radar-betax',
      'radar-beta\naxis A,\nB',
      'radar-beta\naxis A, B\ncurve c{1\n,2}',
      'radar-beta\naxis A, B\ncurve c{1, A 2}',
      'radar-beta\naxis A\ncurve c{}',
      'radar-beta\naxis A\ncurve c{A::1}',
      'radar-beta\nmin -5',
      'radar-beta\ntitle x axis A curve c{1} ticks 3\naccTitle x',
      'radar-beta\naxis max',
    ]) {
      expect(errors(src), src).not.toEqual([]);
    }
  });

  it('points a single unknown entry at its curve (D356)', () => {
    const src = 'radar-beta\naxis A\ncurve c{A 1, X 2}';
    const [d] = parse(src).diagnostics;
    expect(d?.code).toBe('RADAR_UNKNOWN_AXIS');
    expect(d?.related?.map((r) => [r.message, src.slice(r.range.start, r.range.end)])).toEqual([
      ['The curve `c`.', 'c{A 1, X 2}'],
    ]);
  });

  it('takes the in-text title if non-empty, else the front-matter one (D218)', () => {
    const fm = '---\ntitle: Front\n---\n';
    expect(parse(`${fm}radar-beta\naxis A`).model.title).toBe('Front');
    expect(parse(`${fm}radar-beta\ntitle In text\naxis A`).model.title).toBe('In text');
    expect(parse(`${fm}radar-beta\ntitle In text\ntitle\naxis A`).model.title).toBe('Front');
    expect(parse('radar-beta\ntitle   a   b   %% c').model.title).toBe('a b');
    expect('title' in parse('radar-beta\ntitle').model).toBe(false);
    // The title's AST id (its `data-ast`): the last in-text title's, none from front matter.
    expect(parse(`${fm}radar-beta\ntitle a\ntitle b\naxis A`).model.titleAstId).toBe('title@2');
    expect('titleAstId' in parse(`${fm}radar-beta\ntitle a\ntitle\naxis A`).model).toBe(false);
    expect('titleAstId' in parse(`${fm}radar-beta\naxis A`).model).toBe(false);
  });

  it('says why a name that starts with a keyword is no name (D357)', () => {
    const at = (src: string) => parse(src).diagnostics.map((d) => d.message);
    expect(at('radar-beta\naxis circles')).toEqual([
      expect.stringContaining('`circles` starts with the keyword `circle`'),
    ]);
    expect(at('radar-beta\naxis A, true')).toEqual([
      expect.stringContaining('`true` is a keyword'),
    ]);
    expect(at('radar-beta\naxis titleX')).toEqual([
      expect.stringContaining('`titleX` starts with the keyword `title`'),
    ]);
    expect(at('radar-beta\nshowLegend trueish')).toEqual([
      expect.stringContaining('`trueish` starts with the keyword `true`'),
    ]);
  });
});
