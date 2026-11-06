import { icons as fa6Solid } from '@iconify-json/fa6-solid';
import { icons as logos } from '@iconify-json/logos';
import { icons as mdi } from '@iconify-json/mdi';
import { assertInert } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { buildIcon } from './icon.ts';
import { markup } from './markup.fixtures.ts';
import { getIcon, type IconifyJSON } from './resolve.ts';

const PACKS = [
  ['fa6-solid', fa6Solid],
  ['mdi', mdi],
  ['logos', logos],
] as const;

const SHAPE = /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/g;

describe('buildIcon', () => {
  it('wraps the converted body in the rotation and flip transform', () => {
    const icon = buildIcon({
      body: '<path fill="url(#g)" d="M0 0h4v4z"/>',
      left: 0,
      top: 0,
      width: 24,
      height: 16,
      rotate: 1,
      hFlip: false,
      vFlip: false,
    });
    expect(icon.viewBox).toEqual([0, 0, 16, 24]);
    expect(markup(icon.nodes)).toBe(
      '<g transform="rotate(90 8 8)"><path fill="currentColor" d="M0 0h4v4z"/></g>'
    );
    expect(icon.simplified).toBe(true);
  });
});

describe.each(PACKS)('every icon of %s', (_id, pack) => {
  const names = [...Object.keys(pack.icons), ...Object.keys(pack.aliases ?? {})];

  it('converts to inert markup, keeping every shape of a body without defs', () => {
    let simplified = 0;
    for (const name of names) {
      const data = getIcon(pack as IconifyJSON, name);
      if (data === undefined) continue;
      const icon = buildIcon(data);
      const svg = markup(icon.nodes, icon.viewBox);
      expect(() => assertInert(svg, { gradient: false }), name).not.toThrow();
      if (icon.simplified) simplified++;
      else expect(svg.match(SHAPE)?.length, name).toBe(data.body.match(SHAPE)?.length);
    }
    // fa6-solid and mdi are plain paths; logos draws many icons with gradients and masks.
    expect(simplified > 0).toBe(pack === logos);
  });
});
