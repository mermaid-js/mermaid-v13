import { describe, expect, it } from 'vitest';
import { Canvas } from './canvas.ts';

describe('Canvas', () => {
  it('starts blank at the given size and trims trailing spaces', () => {
    const canvas = new Canvas(4, 2);
    expect([canvas.columns, canvas.rows]).toEqual([4, 2]);
    expect(canvas.toString()).toBe('\n');
    canvas.set(1, 0, 'a');
    expect(canvas.toString()).toBe(' a\n');
  });

  it('grows on write and ignores cells left of or above the origin', () => {
    const canvas = new Canvas();
    canvas.set(3, 1, 'x');
    canvas.set(-1, 0, 'y');
    canvas.set(0, -1, 'z');
    expect([canvas.columns, canvas.rows]).toEqual([4, 2]);
    expect(canvas.toString()).toBe('\n   x');
    expect(canvas.get(9, 9)).toBe(' ');
  });

  it('gives a wide grapheme a continuation cell', () => {
    const canvas = new Canvas();
    canvas.set(0, 0, '漢', 2);
    canvas.set(2, 0, '|');
    expect(canvas.get(0, 0)).toBe('漢');
    expect(canvas.get(1, 0)).toBe('');
    expect(canvas.columns).toBe(3);
    expect(canvas.toString()).toBe('漢|');
  });

  it('blanks a wide grapheme partly overwritten', () => {
    const left = new Canvas();
    left.set(0, 0, '漢', 2);
    left.set(1, 0, '│');
    expect(left.toString()).toBe(' │');

    const right = new Canvas();
    right.set(1, 0, '漢', 2);
    right.set(0, 0, '字', 2);
    expect(right.toString()).toBe('字');
    expect(right.get(2, 0)).toBe(' ');
  });

  it('merges line glyphs on draw and overwrites on set', () => {
    const canvas = new Canvas();
    canvas.draw(0, 0, '─');
    canvas.draw(0, 0, '│');
    canvas.set(1, 0, '─');
    canvas.set(1, 0, '│');
    expect(canvas.toString()).toBe('┼│');
  });

  it('keeps trailing ideographic spaces, which are not padding', () => {
    const canvas = new Canvas(6, 1);
    canvas.set(0, 0, '　', 2);
    expect(canvas.toString()).toBe('　');
  });
});
