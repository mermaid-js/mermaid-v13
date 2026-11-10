import { describe, expect, it } from 'vitest';
import {
  accDescrValue,
  accTitleValue,
  decodeEscaped,
  repeatBounds,
  specialValue,
  stringValue,
  titleValue,
} from './convert.ts';

/** v12's value converters (`railroad{,-ebnf,-abnf,-peg}/valueConverter.ts`, `common/`). */
describe('railroad value conversion', () => {
  it('decodes `\\n \\r \\t`, reads any other `\\c` as `c`, and keeps a final `\\`', () => {
    expect(decodeEscaped('"a\\nb\\tc\\rd"')).toBe('a\nb\tc\rd');
    expect(decodeEscaped(String.raw`"\"q\" \\ \x"`)).toBe('"q" \\ x');
    expect(decodeEscaped("'it\\'s'")).toBe("it's");
    expect(decodeEscaped('"a\\"')).toBe('a\\');
  });

  it('keeps ABNF strings as written', () => {
    expect(stringValue('railroadAbnf', '"a\\n"')).toBe('a\\n');
    expect(stringValue('railroadPeg', '"a\\n"')).toBe('a\n');
  });

  it('trims special sequences', () => {
    expect(specialValue('?  any character \n ?')).toBe('any character');
  });

  it('unquotes a quoted title, decoding it except in ABNF', () => {
    expect(titleValue('railroad', 'title   Two   words  ')).toBe('Two words');
    expect(titleValue('railroad', 'title "a\\tb"')).toBe('a\tb');
    expect(titleValue('railroadAbnf', 'title "a\\tb"')).toBe('a\\tb');
    expect(titleValue('railroadEbnf', "title 'q'")).toBe('q');
    expect(titleValue('railroad', 'title "')).toBe('');
    expect(titleValue('railroad', 'title "a\'')).toBe('"a\'');
    expect(titleValue('railroad', 'title')).toBe('');
  });

  it('reads accTitle and accDescr as common.langium did', () => {
    expect(accTitleValue('accTitle :  a   b ')).toBe('a b');
    expect(accDescrValue('accDescr: one')).toBe('one');
    expect(accDescrValue('accDescr {\n  one\n\n   two  three\n}')).toBe('one\ntwo three');
  });

  it("reads ABNF repeats as v12's parseRepeat", () => {
    expect(repeatBounds('*')).toEqual({ min: 0, max: Infinity });
    expect(repeatBounds('1*')).toEqual({ min: 1, max: Infinity });
    expect(repeatBounds('*1')).toEqual({ min: 0, max: 1 });
    expect(repeatBounds('3*5')).toEqual({ min: 3, max: 5 });
    expect(repeatBounds('2')).toEqual({ min: 2, max: 2 });
    expect(repeatBounds('007')).toEqual({ min: 7, max: 7 });
  });
});
