/**
 * The same text renders to the same bytes in the browser and in Node (#9 gap): with the
 * deterministic table measurer nothing in the pipeline depends on the runtime.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { collectMmdFixtures, DIAGRAMS_DIR, fixturePath } from '../helpers/mmd-snapshots.ts';
import { openHarness } from './page.ts';

const fixtures = await collectMmdFixtures(DIAGRAMS_DIR, 'flowchart/baseline/**/*.mmd');

test('every baseline fixture renders byte-identical in the browser and in Node', async ({
  page,
  request,
}) => {
  expect(fixtures.length).toBeGreaterThan(50);
  await openHarness(page);
  const mismatched: string[] = [];
  for (const path of fixtures) {
    const code = readFileSync(fixturePath(path), 'utf8');
    const node = (await (await request.post('/node-render', { data: { code } })).json()) as {
      svg: string;
    };
    const browser = await page.evaluate((c) => window.v13.render(c), code);
    if (browser.svg !== node.svg) mismatched.push(path);
  }
  expect(mismatched).toEqual([]);
});
