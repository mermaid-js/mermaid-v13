/**
 * The lookup against `@iconify/utils` (v12's resolver, D295) over real packs, and over a pack
 * of aliases built to cover every rotation and flip with an offset box.
 */
import { icons as fa6Solid } from '@iconify-json/fa6-solid';
import { icons as logos } from '@iconify-json/logos';
import { icons as mdi } from '@iconify-json/mdi';
import { defaultIconProps, getIconData, iconToSVG, wrapSVGContent } from '@iconify/utils';
import { describe, expect, it } from 'vitest';
import { getIcon, iconBox, type IconifyJSON } from './resolve.ts';

/** Iconify's own pack type, as `@iconify/utils` takes it. */
type UpstreamJSON = Parameters<typeof getIconData>[0];

/** Every alias combination of rotate −1…5 and both flips, over icons with an offset box. */
function transformPack(): UpstreamJSON {
  const aliases: Record<string, NonNullable<UpstreamJSON['aliases']>[string]> = {};
  const icons: UpstreamJSON['icons'] = {
    offset: { body: '<path d="M1 2h3v4z"/>', left: -3, top: 5, width: 30, height: 18 },
    square: { body: '<defs><path id="a" d="M0 0"/></defs><path d="M0 0h4v4z"/>' },
    turned: { body: '<path d="M0 0"/>', rotate: 3, vFlip: true, width: 10 },
  };
  for (const parent of Object.keys(icons))
    for (let rotate = -1; rotate <= 5; rotate++)
      for (const hFlip of [false, true])
        for (const vFlip of [false, true]) {
          const name = `${parent}-${String(rotate)}-${String(hFlip)}-${String(vFlip)}`;
          aliases[name] = { parent, rotate, hFlip, vFlip, ...(hFlip ? { width: 12 } : {}) };
          aliases[`${name}-again`] = { parent: name, rotate: 1, hFlip: true, width: 20, top: 2 };
        }
  return { prefix: 'transforms', width: 24, height: 24, icons, aliases };
}

const PACKS: readonly (readonly [string, UpstreamJSON])[] = [
  ['fa6-solid', fa6Solid],
  ['mdi', mdi],
  ['logos', logos],
  ['transforms', transformPack()],
];

const names = (pack: UpstreamJSON) => [
  ...Object.keys(pack.icons),
  ...Object.keys(pack.aliases ?? {}),
];

describe.each(PACKS)('parity with @iconify/utils over %s', (_id, pack) => {
  it('resolves every icon and alias to the same data', () => {
    let checked = 0;
    for (const name of names(pack)) {
      const upstream = getIconData(pack, name);
      const ours = getIcon(pack as IconifyJSON, name);
      if (upstream === null) {
        expect(ours, name).toBeUndefined();
        continue;
      }
      const { hidden: _hidden, ...expected } = { ...defaultIconProps, ...upstream };
      expect(ours, name).toEqual(expected);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('draws every icon in the same box with the same transform', () => {
    for (const name of names(pack)) {
      const upstream = getIconData(pack, name);
      if (upstream === null) continue;
      const svg = iconToSVG(upstream);
      const ours = iconBox(getIcon(pack as IconifyJSON, name)!);
      expect(ours.viewBox, name).toEqual(svg.viewBox);
      const body = upstream.body;
      expect(
        ours.transform === undefined
          ? body
          : wrapSVGContent(body, `<g transform="${ours.transform}">`, '</g>'),
        name
      ).toBe(svg.body);
    }
  });
});
