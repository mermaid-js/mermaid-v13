import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { harvest, harvestPath, hasV12History } from './harvest.ts';
import { JISON_TYPES } from '../tables.ts';

/**
 * Every committed `corpus/<type>-v12-specs.json` is what `harvest <type>` writes today, so the
 * corpus and the CLI cannot drift apart. Needs v12's history (`fa796a943`); a shallow clone
 * lacks it and skips.
 */
describe.skipIf(!hasV12History())('harvest', () => {
  it.each(Object.keys(JISON_TYPES))(
    'writes the committed %s corpus',
    (type) => {
      const path = harvestPath(type);
      expect(existsSync(path), `${path}: run \`harvest ${type}\``).toBe(true);
      const items = harvest(type);
      expect(items.length).toBeGreaterThan(0);
      expect(items).toEqual(JSON.parse(readFileSync(path, 'utf8')));
    },
    60_000
  );
});
