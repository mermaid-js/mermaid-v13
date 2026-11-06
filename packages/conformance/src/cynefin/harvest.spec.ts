import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasV12History } from '../jison/harvest.ts';
import { CYNEFIN_HARVEST_PATH, harvestCynefin } from './harvest.ts';

/**
 * The committed `corpus/cynefin-v12-specs.json` is what `harvest:cynefin` writes today, so the
 * corpus and the CLI cannot drift apart. Needs v12's history (`fa796a943`); a shallow clone
 * lacks it and skips, as `../jison/harvest.spec.ts` does.
 */
describe.skipIf(!hasV12History())('cynefin harvest', () => {
  it('writes the committed corpus: 16 spec strings, 2 examples, 8 doc fences', () => {
    const items = harvestCynefin();
    expect(items).toEqual(JSON.parse(readFileSync(CYNEFIN_HARVEST_PATH, 'utf8')));
    const count = (prefix: string) => items.filter((i) => i.id.startsWith(prefix)).length;
    expect(count('v12-specs/cynefin.integration.spec.ts#')).toBe(16);
    expect(count('v12-specs/cynefin.ts#')).toBe(2);
    expect(count('v12-docs/cynefin.md#')).toBe(8);
  }, 60_000);
});
