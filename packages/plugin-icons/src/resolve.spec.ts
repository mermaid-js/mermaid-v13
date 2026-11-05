import { describe, expect, it } from 'vitest';
import { getIcon, iconBox, type IconifyJSON } from './resolve.ts';

const pack: IconifyJSON = {
  prefix: 'test',
  width: 24,
  height: 24,
  icons: {
    plain: { body: '<path d="M0 0h24v24z"/>' },
    wide: { body: '<path d="M0 0"/>', width: 32, left: -2, top: 1 },
    turned: { body: '<path d="M1 1"/>', rotate: 1, hFlip: true },
  },
  aliases: {
    flipped: { parent: 'plain', hFlip: true },
    twice: { parent: 'flipped', hFlip: true, rotate: 2 },
    wider: { parent: 'wide', width: 40 },
    loop1: { parent: 'loop2' },
    loop2: { parent: 'loop1' },
    orphan: { parent: 'missing' },
    turnedMore: { parent: 'turned', rotate: 3 },
  },
};

describe('getIcon', () => {
  it('fills an icon from the pack defaults', () => {
    expect(getIcon(pack, 'plain')).toEqual({
      body: '<path d="M0 0h24v24z"/>',
      left: 0,
      top: 0,
      width: 24,
      height: 24,
      rotate: 0,
      hFlip: false,
      vFlip: false,
    });
  });

  it('defaults to a 16 × 16 box when the pack names none', () => {
    expect(getIcon({ prefix: 'p', icons: { a: { body: '' } } }, 'a')).toMatchObject({
      width: 16,
      height: 16,
    });
  });

  it('lets an icon override the pack dimensions', () => {
    expect(getIcon(pack, 'wide')).toMatchObject({ width: 32, height: 24, left: -2, top: 1 });
  });

  it('resolves alias chains, folding flips and rotations', () => {
    expect(getIcon(pack, 'flipped')).toMatchObject({
      body: '<path d="M0 0h24v24z"/>',
      hFlip: true,
    });
    expect(getIcon(pack, 'twice')).toMatchObject({ hFlip: false, rotate: 2 });
    expect(getIcon(pack, 'wider')).toMatchObject({ width: 40, left: -2, top: 1 });
    expect(getIcon(pack, 'turnedMore')).toMatchObject({ rotate: 0, hFlip: true });
  });

  it('returns undefined for unknown names, loops and broken chains', () => {
    expect(getIcon(pack, 'nope')).toBeUndefined();
    expect(getIcon(pack, 'loop1')).toBeUndefined();
    expect(getIcon(pack, 'orphan')).toBeUndefined();
  });

  it('never reads inherited properties as icons', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty'])
      expect(getIcon(pack, name)).toBeUndefined();
  });
});

describe('iconBox', () => {
  const box = (name: string) => iconBox(getIcon(pack, name)!);

  it('is the icon box with no transform when nothing turns', () => {
    expect(box('wide')).toEqual({ viewBox: [-2, 1, 32, 24], transform: undefined });
  });

  it('mirrors a horizontal flip about the box', () => {
    expect(box('flipped')).toEqual({
      viewBox: [0, 0, 24, 24],
      transform: 'translate(24 0) scale(-1 1)',
    });
  });

  it('turns a quarter rotation and swaps the box sides', () => {
    expect(iconBox({ ...getIcon(pack, 'wide')!, rotate: 1 })).toEqual({
      viewBox: [1, -2, 24, 32],
      transform: 'rotate(90 13 13)',
    });
  });

  it('folds a flip and a rotation into one transform', () => {
    expect(box('turned')).toEqual({
      viewBox: [0, 0, 24, 24],
      transform: 'rotate(90 12 12) translate(24 0) scale(-1 1)',
    });
  });
});
