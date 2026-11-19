import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import {
  asHostText,
  assertUniqueSnapshotNames,
  buildFixtureTree,
  discoverMmdFixtures,
  fixedClockFor,
  fixtureBaseName,
  fixturePath,
  listedFixtures,
  readFixtureMetadata,
  type FixtureTree,
} from '../helpers/mmd-snapshots.ts';
import { imgSnapshotTest } from '../helpers/util.ts';

// Every tier of every fixture folder whose diagram types have a v13 package, as v12
// develop collects them; the rest join when their package lands (see the helper). CI may
// set MERMAID_E2E_FIXTURE_TIER to a comma-separated tier list (e.g. 'pr-check') to narrow it.
const discovered = await discoverMmdFixtures({ tiers: process.env.MERMAID_E2E_FIXTURE_TIER });
// On a PR, CI narrows the run to the fixtures whose SVG the change alters: a file of fixture
// paths, one a line (MERMAID_E2E_FIXTURE_LIST, written by packages/dev's visual-scope; D631).
const fixtures = listedFixtures(discovered, process.env.MERMAID_E2E_FIXTURE_LIST);
// Fail fast if two fixtures would share a screenshot baseline (see helper).
assertUniqueSnapshotNames(fixtures);
const fixtureTree = buildFixtureTree(fixtures);

const registerFixtureNode = (node: FixtureTree): void => {
  for (const segment of [...node.children.keys()].sort()) {
    test.describe(segment, () => {
      registerFixtureNode(node.children.get(segment)!);
    });
  }

  for (const relativePath of [...node.fixtures].sort()) {
    // Read at registration time (sync, like the fixture file itself below):
    // `tag` has to be a static option on the `test()` call, not something
    // decided from inside the async test body.
    const metadata = readFixtureMetadata(relativePath);
    const tags = metadata?.tags?.map((tag) => (tag.startsWith('@') ? tag : `@${tag}`));

    test(fixtureBaseName(relativePath), { tag: tags }, async ({ page }, testInfo) => {
      if (metadata?.description) {
        testInfo.annotations.push({ type: 'description', description: metadata.description });
      } else {
        // Not a failure — most fixtures don't have one yet — but flagged in the
        // report rather than left silent, since a missing sidecar is otherwise
        // invisible short of opening the fixture's folder directly.
        testInfo.annotations.push({ type: 'metadata', description: 'No metadata found for test' });
      }

      let source: string;
      try {
        source = readFileSync(fixturePath(relativePath), 'utf8');
      } catch (error) {
        throw new Error(
          `Failed to read mmd fixture ${relativePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const fixedClock = fixedClockFor(relativePath);
      if (fixedClock) {
        // setFixedTime over install: never advances, so a diagram whose own
        // date parsing defaults to "now" can't resolve to a slightly later
        // instant than a render-time `new Date()` call (e.g. the today
        // marker) just because rendering took some real time to run.
        await page.clock.setFixedTime(new Date(fixedClock));
      }
      // Mirror the fixture's storage path so Argos sheets group by diagram
      // folder (e.g. diagrams/packet) rather than the runner spec file.
      await imgSnapshotTest(page, testInfo, asHostText(source), {
        screenshotPath: `diagrams/${relativePath.replace(/\.mmd$/i, '')}`,
      });
    });
  }
};

test.describe('mmd snapshots', () => {
  registerFixtureNode(fixtureTree);
});
