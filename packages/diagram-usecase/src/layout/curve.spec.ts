import { describe, expect, it } from 'vitest';
import { draw } from '../ascii/usecase.fixtures.ts';
import { usecaseConfigDefaults } from '../generated/config-defaults.ts';
import { USECASE_CURVE } from './curve.ts';

describe('usecase default curve (D733, #1379)', () => {
  it('is S-curves, in code, with no schema default', () => {
    expect(USECASE_CURVE).toBe('curved');
    expect(usecaseConfigDefaults).not.toHaveProperty('curve');
  });

  it('leaves text output on the grid: a set curve draws the same text and warns (D78, D748)', async () => {
    const source = 'usecase-beta\nactor User\nUser --> Login\nUser --> Pay[Pay order]\n';
    const unset = await draw(source);
    for (const config of [{ curve: 'linear' }, { usecase: { curve: 'linear' } }]) {
      const set = await draw(source, { config });
      expect(set.text).toBe(unset.text);
      expect(unset.warnings).toEqual([]);
      expect(set.warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
        ['ASCII_DROPPED', 'curve'],
      ]);
    }
  });
});
