import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { detectType, supportsFormat } from '../../packages/mermaid/src/index.ts';
import {
  assertUniqueSnapshotNames,
  buildFixtureTree,
  collectMmdFixtures,
  discoverMmdFixtures,
  FIXTURE_FOLDER_TYPES,
  fixturePath,
  supportedFixtureFolders,
  fixtureBaseName,
  snapshotNameKey,
  SUPPORTED_TYPES,
} from './mmd-snapshots.ts';
import * as discovery from '../../packages/dev/src/fixture-discovery.ts';
import * as helpers from './mmd-snapshots.ts';

describe('fixtureBaseName', () => {
  it('returns the filename without extension', () => {
    expect(fixtureBaseName('flowchart/handdrawn/fhd1-simple.mmd')).toBe('fhd1-simple');
  });
});

describe('buildFixtureTree', () => {
  it('nests fixtures by folder segments', () => {
    const tree = buildFixtureTree([
      'pie/simple-sports.mmd',
      'flowchart/handdrawn/fhd1-simple.mmd',
      'flowchart/elk/basic.mmd',
    ]);

    expect(tree.fixtures).toEqual([]);
    expect([...tree.children.keys()].sort()).toEqual(['flowchart', 'pie']);
    expect(tree.children.get('pie')!.fixtures).toEqual(['pie/simple-sports.mmd']);
    expect([...tree.children.get('flowchart')!.children.keys()].sort()).toEqual([
      'elk',
      'handdrawn',
    ]);
    expect(tree.children.get('flowchart')!.children.get('handdrawn')!.fixtures).toEqual([
      'flowchart/handdrawn/fhd1-simple.mmd',
    ]);
  });
});

describe('snapshotNameKey', () => {
  it('collapses the folder separator the same way the screenshot name does', () => {
    // A folder boundary and an in-name hyphen flatten identically.
    expect(snapshotNameKey('flowchart/elk/foo.mmd')).toBe(snapshotNameKey('flowchart/elk-foo.mmd'));
    expect(snapshotNameKey('flowchart/elk/foo.mmd')).toBe('flowchart-elk-foo');
  });
});

describe('assertUniqueSnapshotNames', () => {
  it('passes when every fixture maps to a distinct snapshot name', () => {
    expect(() =>
      assertUniqueSnapshotNames(['pie/simple.mmd', 'flowchart/elk/foo.mmd'])
    ).not.toThrow();
  });

  it('throws when two fixtures would share a snapshot name', () => {
    expect(() =>
      assertUniqueSnapshotNames(['flowchart/elk/foo.mmd', 'flowchart/elk-foo.mmd'])
    ).toThrow(/same snapshot name/);
  });
});

describe('discoverMmdFixtures', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mmd-discovery-'));
    for (const file of [
      'flowchart/baseline/a.mmd',
      'flowchart/pr-check/b.mmd',
      'flowchart/nightly-check/c.mmd',
      'pie/pr-check/p.mmd',
      'railroad/pr-check/r.mmd',
    ]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), 'graph TD\n');
    }
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const folderTypes = {
    flowchart: ['flowchart-v2'],
    pie: ['pie'],
    railroad: ['railroad', 'railroadEbnf'],
  };
  const discover = (tiers?: string, supportedTypes = new Set(['flowchart-v2'])) =>
    discoverMmdFixtures({ diagramsDir: dir, tiers, supportedTypes, folderTypes });

  it('collects every tier of a supported type by default', async () => {
    expect(await discover()).toEqual([
      'flowchart/baseline/a.mmd',
      'flowchart/nightly-check/c.mmd',
      'flowchart/pr-check/b.mmd',
    ]);
  });

  it('narrows to a comma-separated tier list', async () => {
    expect(await discover(' pr-check , baseline')).toEqual([
      'flowchart/baseline/a.mmd',
      'flowchart/pr-check/b.mmd',
    ]);
    expect(await discover('')).toHaveLength(3);
  });

  it('includes a folder only once every type it holds is supported', async () => {
    expect(await discover('pr-check', new Set(['flowchart-v2', 'pie', 'railroad']))).toEqual([
      'flowchart/pr-check/b.mmd',
      'pie/pr-check/p.mmd',
    ]);
  });

  it('throws on a folder with no declared types', async () => {
    await expect(
      discoverMmdFixtures({ diagramsDir: dir, supportedTypes: new Set(), folderTypes: {} })
    ).rejects.toThrow(/FIXTURE_FOLDER_TYPES.*flowchart/);
  });

  it('lists the folders it would collect from', async () => {
    expect(
      supportedFixtureFolders({ diagramsDir: dir, supportedTypes: new Set(['pie']), folderTypes })
    ).toEqual(['pie']);
  });
});

describe('the real fixture folders', () => {
  it('runs flowchart and skips types without a v13 package', async () => {
    const folders = supportedFixtureFolders();
    expect(folders).toContain('flowchart');
    expect(folders).toContain('sequence');
    expect(folders).not.toContain('journey');
    expect(folders).not.toContain('zenuml');
  });

  it('declares the types each folder actually holds (detected by mermaid)', async () => {
    const files = await collectMmdFixtures();
    const undeclared: string[] = [];
    for (const file of files) {
      const folder = file.split('/')[0];
      let type: string;
      try {
        type = detectType(readFileSync(fixturePath(file), 'utf8'));
      } catch {
        continue; // Undetectable fixtures (zenuml, bad frontmatter) say nothing about the folder.
      }
      if (!FIXTURE_FOLDER_TYPES[folder]?.includes(type)) undeclared.push(`${file}: ${type}`);
    }
    expect(undeclared).toEqual([]);
  });
});

describe('the discovery source', () => {
  it('is packages/dev (the dev explorer lists the same folders), re-exported here', () => {
    expect(helpers.FIXTURE_FOLDER_TYPES).toBe(discovery.FIXTURE_FOLDER_TYPES);
    expect(helpers.collectMmdFixtures).toBe(discovery.collectMmdFixtures);
  });

  it('agrees with mermaid on which types have a v13 package', () => {
    expect(discovery.supportedTypesOf((type) => supportsFormat(type, 'svg'))).toEqual(
      new Set(
        Object.values(FIXTURE_FOLDER_TYPES)
          .flat()
          .filter((type) => SUPPORTED_TYPES.has(type))
      )
    );
  });
});
