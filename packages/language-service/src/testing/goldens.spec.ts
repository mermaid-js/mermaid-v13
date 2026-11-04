/**
 * The golden runner itself (D99 suite 1): a feature folder with no renderer in `FEATURES`
 * still runs, through the snapshot method of the same name, so a new query (`completions`,
 * `hover`) gets goldens by adding a folder; and a diagram with a facet is told which required
 * features it has no goldens for (R-LANG-3).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from '../index.ts';
import {
  goldenCases,
  missingFeatures,
  readFixture,
  renderGolden,
  REQUIRED_FEATURES,
} from './goldens.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

describe('renderGolden', () => {
  it('runs a feature with no renderer through the snapshot method of that name', () => {
    const fixture = readFixture('flowchart TD\n  subgraph a\n    B\n  end\n');
    const doc = service.update('golden:///generic.mmd', fixture.text);
    expect(renderGolden('foldingRanges', doc, fixture)).toBe(
      'kind "subgraph" range 2:3-4:6 "subgraph a\\n    B\\n  end"\n'
    );
  });

  it('calls the method once per marker when the fixture has markers', () => {
    const fixture = readFixture('flowchart TD\n  |A --> B\n  |\n');
    const doc = service.update('golden:///generic-markers.mmd', fixture.text);
    expect(renderGolden('prepareRename', doc, fixture)).toBe(
      [
        '@ 2:3  |A --> B',
        '  range 2:3-2:4 "A" placeholder "A"',
        '@ 3:3  |',
        '  refused "There is no id or class name here to rename."',
        '',
      ].join('\n')
    );
  });

  it('names a feature that is neither a renderer nor a snapshot method', () => {
    const fixture = readFixture('flowchart TD\n');
    const doc = service.update('golden:///unknown.mmd', fixture.text);
    expect(() => renderGolden('noSuchQuery', doc, fixture)).toThrow(/noSuchQuery/);
  });
});

describe('goldenCases and missingFeatures', () => {
  const root = mkdtempSync(join(tmpdir(), 'goldens-'));
  const add = (path: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'flowchart TD\n');
  };
  add('demo/references/b.mmd');
  add('demo/references/a.mmd');
  add('demo/hover/x.mmd');
  mkdirSync(join(root, 'demo', 'empty'));

  it('finds every case under <diagram>/<feature>/, sorted, with its output path', () => {
    expect(goldenCases(root).map((c) => `${c.diagram}/${c.feature}/${c.name}`)).toEqual([
      'demo/hover/x',
      'demo/references/a',
      'demo/references/b',
    ]);
    expect(goldenCases(root)[0]?.output).toBe(join(root, 'demo', 'hover', 'x.out'));
  });

  it('lists the required features a diagram has no cases for', () => {
    expect(missingFeatures(root, 'demo')).toEqual(
      REQUIRED_FEATURES.filter((f) => f !== 'references')
    );
    expect(missingFeatures(root, 'absent')).toEqual([...REQUIRED_FEATURES]);
  });
});
