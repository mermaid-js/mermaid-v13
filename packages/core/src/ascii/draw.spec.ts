import { describe, expect, it } from 'vitest';
import { Canvas } from './canvas.ts';
import { drawBox, drawFrame, drawText, type BoxOptions } from './draw.ts';
import { ascii, unicode, type GlyphSet } from './glyphs.ts';

const box = (glyphs: GlyphSet, options?: BoxOptions, width = 7, height = 3): string => {
  const canvas = new Canvas();
  drawBox(canvas, glyphs, { x: 0, y: 0, width, height }, options);
  return canvas.toString();
};

describe('drawText', () => {
  it('writes graphemes into cells and returns the end column', () => {
    const canvas = new Canvas();
    expect(drawText(canvas, 1, 0, 'a漢👩‍💻é')).toBe(7);
    expect(canvas.toString()).toBe(' a漢👩‍💻é');
    expect(canvas.get(3, 0)).toBe('');
  });

  it('writes one row per line', () => {
    const canvas = new Canvas();
    expect(drawText(canvas, 0, 0, 'ab\n漢字\r\nc')).toBe(4);
    expect(canvas.toString()).toBe('ab\n漢字\nc');
  });

  it('joins a leading zero-width cluster to nothing and a later one to the cell before', () => {
    const canvas = new Canvas();
    drawText(canvas, 0, 0, '́a​漢​b');
    expect(canvas.get(0, 0)).toBe('a​');
    expect(canvas.get(1, 0)).toBe('漢​');
    expect(canvas.get(2, 0)).toBe('');
    expect(canvas.get(3, 0)).toBe('b');
  });

  it('clips text left of the origin without shifting the rest', () => {
    const canvas = new Canvas();
    drawText(canvas, -2, 0, 'abcd');
    expect(canvas.toString()).toBe('cd');
  });
});

describe('drawBox (D82 forms)', () => {
  it.each<[string, GlyphSet, BoxOptions | undefined, string]>([
    ['square', unicode, undefined, '┌─────┐\n│     │\n└─────┘'],
    ['rounded', unicode, { form: 'rounded' }, '╭─────╮\n│     │\n╰─────╯'],
    ['double-side', unicode, { form: 'double-side' }, '╓─────╖\n║     ║\n╙─────╜'],
    ['caps', unicode, { form: 'caps' }, '╒═════╕\n│     │\n╘═════╛'],
    ['square', ascii, undefined, '+-----+\n|     |\n+-----+'],
    ['rounded', ascii, { form: 'rounded' }, '+-----+\n|     |\n+-----+'],
    ['double-side', ascii, { form: 'double-side' }, '+-----+\nI     I\n+-----+'],
    ['caps', ascii, { form: 'caps' }, '+=====+\n|     |\n+=====+'],
  ])('%s in %s', (_, glyphs, options, expected) => {
    expect(box(glyphs, options)).toBe(expected);
  });

  it('places side-midpoint marks and a marker', () => {
    expect(
      box(unicode, { marks: { left: '<', right: '>', top: '◇', bottom: '◇' }, marker: '+' })
    ).toBe('┌+─◇──┐\n<     >\n└──◇──┘');
  });

  it('merges its border with lines already drawn', () => {
    const canvas = new Canvas();
    for (let y = 0; y < 5; y++) canvas.draw(3, y, '│');
    drawBox(canvas, unicode, { x: 0, y: 1, width: 7, height: 3 });
    expect(canvas.toString()).toBe('   │\n┌──┼──┐\n│  │  │\n└──┼──┘\n   │');
  });

  it('turns shared borders into tees', () => {
    const canvas = new Canvas();
    drawBox(canvas, unicode, { x: 0, y: 0, width: 4, height: 3 });
    drawBox(canvas, unicode, { x: 3, y: 0, width: 4, height: 3 });
    expect(canvas.toString()).toBe('┌──┬──┐\n│  │  │\n└──┴──┘');
  });

  it('draws nothing smaller than 2 × 2', () => {
    expect(box(unicode, undefined, 1, 3)).toBe('');
    expect(box(unicode, undefined, 2, 2)).toBe('┌┐\n└┘');
  });
});

describe('drawFrame', () => {
  it('draws a rectangle in one stroke', () => {
    const canvas = new Canvas();
    drawFrame(canvas, unicode.dotted, { x: 0, y: 0, width: 5, height: 3 });
    expect(canvas.toString()).toBe('┌┄┄┄┐\n┆   ┆\n└┄┄┄┘');
  });

  it('merges with what is drawn', () => {
    const canvas = new Canvas();
    canvas.draw(2, 0, '│');
    canvas.draw(2, 1, '│');
    drawFrame(canvas, unicode.solid, { x: 0, y: 1, width: 5, height: 3 });
    expect(canvas.toString()).toBe('  │\n┌─┼─┐\n│   │\n└───┘');
  });
});
