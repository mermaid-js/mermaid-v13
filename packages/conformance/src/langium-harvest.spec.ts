import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasV12History } from './jison/harvest.ts';
import { harvestLangium, LANGIUM_HARVEST, langiumHarvestPath } from './langium-harvest.ts';
import type { LangiumHarvestType } from './langium-harvest.ts';

/**
 * Every committed Langium `corpus/<type>-v12-specs.json` is what `harvest:langium <type>`
 * writes today, so the corpus and the CLI cannot drift apart (as the jison types'). Needs v12's
 * history (`fa796a943`); a shallow clone lacks it and skips.
 */
describe.skipIf(!hasV12History())('harvest:langium', () => {
  it.each(Object.keys(LANGIUM_HARVEST) as LangiumHarvestType[])(
    'writes the committed %s corpus',
    async (type) => {
      const path = langiumHarvestPath(type);
      expect(existsSync(path), `${path}: run \`harvest:langium ${type}\``).toBe(true);
      const items = await harvestLangium(type);
      expect(items).toEqual(JSON.parse(readFileSync(path, 'utf8')));
    },
    60_000
  );

  it('expands the sources radar specs build: spacing variants and the ticks loop', async () => {
    const sources = (await harvestLangium('radar')).map((item) => item.source);
    // `mutateGlobalSpacing('radar-beta :')` and `` `radar-beta${context}` `` in radar.test.ts.
    expect(sources).toContain('\tradar-beta :\t');
    expect(sources).toContain('radar-beta\t accTitle: My Accessible Title\t');
    // Each pass of radar.spec.ts's `for … of` loop of `await parser.parse(…)`.
    for (const ticks of [12, 32, 33]) {
      expect(sources).toContain(`radar-beta\n      ticks ${ticks}\n      `);
    }
  }, 60_000);
});
