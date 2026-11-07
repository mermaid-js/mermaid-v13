import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasV12History } from '../jison/harvest.ts';
import { harvest, harvestPath, HARVESTS } from './harvest-v12.ts';
import type { HarvestType } from './harvest-v12.ts';

/**
 * Every committed `corpus/<type>-v12-specs.json` of a Langium type is what `harvest-v12.ts`
 * writes for it today, so the corpus and the CLI cannot drift apart (as the jison types'
 * `../jison/harvest.spec.ts`). Needs v12's history (`fa796a943`); a shallow clone lacks it and
 * skips.
 */
describe.skipIf(!hasV12History())('harvest-v12', () => {
  it.each(Object.keys(HARVESTS) as HarvestType[])(
    'writes the committed %s corpus',
    (type) => {
      const path = harvestPath(type);
      expect(existsSync(path), `${path}: run \`harvest:${type}\``).toBe(true);
      const items = harvest(type);
      expect(items.length).toBeGreaterThan(0);
      expect(items).toEqual(JSON.parse(readFileSync(path, 'utf8')));
    },
    60_000
  );
});
