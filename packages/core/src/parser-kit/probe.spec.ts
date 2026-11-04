import { describe, expect, it } from 'vitest';
import {
  FIRST_DIAGRAM_KIND,
  Kind,
  Probe,
  ProbeCursor,
  significantTokens,
  TokenWriter,
} from './index.ts';

const Word = FIRST_DIAGRAM_KIND;
const Colon = FIRST_DIAGRAM_KIND + 1;

/** `ab ::: cd`: Word[0,2] Colon[3,6] Word[7,9] EOF, with the blanks as Space trivia. */
function stream() {
  const src = 'ab ::: cd';
  const w = new TokenWriter();
  w.push(Word, 0, 2);
  w.push(Kind.Space, 2, 3);
  w.push(Colon, 3, 6);
  w.push(Kind.Space, 6, 7);
  w.push(Word, 7, 9);
  return { src, tokens: w.finish(src) };
}

describe('Probe', () => {
  it.each([
    [0, 0, 'ab'],
    [1, 0, 'ab'], // inside a word
    [2, 0, 'ab'], // at the end of a word: still the word
    [3, 1, ':::'], // in the blank before `:::`
    [6, 2, 'cd'], // right after `:::`: the token after it
    [9, 2, 'cd'],
  ])('offset %i probes significant token %i (%s)', (offset, index, _text) => {
    const { src } = stream();
    const tokens = significantTokens(stream().tokens);
    const probe = new Probe(src, offset);
    const hits = [];
    for (let i = 0; i < tokens.length; i++) if (probe.isAt(tokens, i)) hits.push(i);
    expect(hits).toEqual([index]);
  });

  it('gives the prefix typed of a word, empty elsewhere', () => {
    const { src } = stream();
    const at = (o: number, start: number) => {
      const p = new Probe(src, o);
      p.tested(Word, start);
      return src.slice(p.result().prefix.start, p.result().prefix.end);
    };
    expect(at(1, 0)).toBe('a');
    expect(at(9, 7)).toBe('cd');
    expect(at(7, 7)).toBe('');
  });

  it('a cursor records at, eat and peekAt only at the probed token', () => {
    const { src, tokens } = stream();
    const probe = new Probe(src, 6); // probes `cd`
    const c = new ProbeCursor(tokens, probe);
    expect(c.at(Colon)).toBe(false); // at `ab`: not recorded
    expect(c.peekAt(Colon)).toBe(true); // peeks `:::`: not recorded
    c.next();
    expect(c.peekAt(Word)).toBe(true); // peeks `cd`: recorded
    expect(c.eat(Colon)).toBe(true);
    c.tested([Colon, Kind.Newline]);
    expect(c.at(Word)).toBe(true);
    expect(probe.result().expected).toEqual([Word, Colon, Kind.Newline]);
  });

  it('stops recording at recovery once the probed token was tested', () => {
    const { src, tokens } = stream();
    const probe = new Probe(src, 0);
    const c = new ProbeCursor(tokens, probe);
    c.recovering(); // before the probed token was tested: no effect
    c.at(Colon);
    c.recovering();
    c.at(Kind.Newline);
    expect(probe.result().expected).toEqual([Colon]);
  });
});
