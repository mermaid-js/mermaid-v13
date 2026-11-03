import { describe, expect, it } from 'vitest';
import { cellMeasurer, cellWidth, graphemes, graphemeWidth } from './measurer.ts';

const FONT = { family: 'Arial', size: 16, weight: 400 };

describe('cell measurer widths (D81)', () => {
  it.each([
    ['ASCII', 'Hello', 5],
    ['Latin-1 and Cyrillic', 'Ünïcødé метка', 13],
    ['CJK ideographs', '漢字', 4],
    ['Hangul', '한국어', 6],
    ['Hiragana and Katakana', 'ひらがなカタカナ', 16],
    ['fullwidth forms', 'ＡＢ１', 6],
    ['halfwidth Katakana', 'ｱｲｳ', 3],
    ['ideographic space and punctuation', '　。', 4],
    ['CJK extension B', '𠀀', 2],
    ['emoji presentation', '🚀', 2],
    ['emoji with a skin tone', '👍🏽', 2],
    ['ZWJ sequence', '👩‍💻', 2],
    ['ZWJ family', '👨‍👩‍👧‍👦', 2],
    ['rainbow flag (VS16 + ZWJ)', '🏳️‍🌈', 2],
    ['regional-indicator flag', '🇸🇪', 2],
    ['two flags', '🇸🇪🇯🇵', 4],
    ['text-presentation symbol', '☺', 1],
    ['symbol with VS16', '☺️', 2],
    ['keycap', '1️⃣', 2],
    ['precomposed accent', 'é', 1],
    ['combining accent', 'é', 1],
    ['stacked combining marks', 'á́́́́', 1],
    ['leading combining mark', '́x', 1],
    ['lone ZWJ', '‍', 0],
    ['zero-width space', 'a​b', 2],
    ['soft hyphen', 'co­op', 4],
    ['empty', '', 0],
    ['mixed', 'A漢🚀é', 6],
  ])('%s: %j is %i cells', (_, text, width) => {
    expect(cellWidth(text)).toBe(width);
    expect(cellMeasurer.width(text, FONT, 0)).toBe(width);
  });

  it('keeps clusters whole', () => {
    expect(graphemes('a👩‍💻é🇸🇪')).toEqual([
      { text: 'a', width: 1 },
      { text: '👩‍💻', width: 2 },
      { text: 'é', width: 1 },
      { text: '🇸🇪', width: 2 },
    ]);
    expect(graphemeWidth('️')).toBe(0);
  });

  it('ignores font and style, with one row per line', () => {
    const bold = { family: 'Courier', size: 40, weight: 700 };
    expect(cellMeasurer.width('abc', bold, 1)).toBe(3);
    expect(cellMeasurer.metrics(bold)).toEqual({ ascent: 1, descent: 0, lineHeight: 1 });
    expect(cellMeasurer.id).toBe('cell');
  });
});
