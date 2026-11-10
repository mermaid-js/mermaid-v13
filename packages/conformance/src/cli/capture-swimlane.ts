/**
 * Recaptures the swimlane engine's DDLT fixtures (D538) into
 * `packages/core/src/layout/swimlane/__tests__/ddlt/`: one JSON file per
 * `dev-diagrams/layout-tests/swimlanes` diagram. `swimlane-capture.spec.ts` checks they are in sync.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OUT_DIR, captureSwimlaneFixtures, serialiseFixture } from '../swimlane/capture.ts';

const fixtures = await captureSwimlaneFixtures();
await rm(OUT_DIR, { recursive: true, force: true });
for (const f of fixtures) {
  const path = join(OUT_DIR, `${f.id}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialiseFixture(f));
}
const written = await readdir(OUT_DIR, { recursive: true });
process.stdout.write(`captured ${fixtures.length} swimlane fixtures (${written.length} entries)\n`);
