// Name splitting matches v12's: `@iconify/utils` `stringToIcon(name, true, fallback given)`,
// then `prefix || fallbackPrefix` (v12 `rendering-util/icons.ts`).
import { stringToIcon } from '@iconify/utils';
import { describe, expect, it } from 'vitest';
import { iconName } from './name.ts';

const NAMES = [
  'fa:bell',
  'aws:arch-amazon-eks-cloud',
  'mdi-fire',
  'fa:fa-bell',
  'logos:aws',
  '@provider:fa:bell',
  '@provider:mdi-fire',
  '@provider:bell',
  '@:bell',
  '@:mdi-fire',
  '@:',
  '@:fa:bell',
  '@a:b:c:d',
  '@only',
  'a:b:c',
  'a:b:c:d',
  ':bell',
  'fa:',
  '-fire',
  'mdi-',
  'bell',
  '',
  ':',
  'not-registered:user',
  'user',
  'Fa:Bell',
  'a b:c',
];

/** v12's lookup key for `value`: the pack, then the icon, or undefined (unknownIcon). */
function v12(value: string, fallbackPrefix?: string) {
  const data = stringToIcon(value, true, fallbackPrefix !== undefined);
  if (!data) return undefined;
  const prefix = data.prefix || fallbackPrefix;
  return prefix ? { prefix, name: data.name } : undefined;
}

describe('iconName', () => {
  it.each(
    NAMES.flatMap(
      (n) =>
        [
          [n, undefined],
          [n, ''],
          [n, 'mermaid-architecture'],
        ] as const
    )
  )('%j with fallback %j splits as v12 did', (value, fallback) => {
    expect(iconName(value, fallback)).toEqual(v12(value, fallback));
  });
});
