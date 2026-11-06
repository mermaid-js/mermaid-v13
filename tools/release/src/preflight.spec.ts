import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextStep, releasePlan, statusOutputArg } from './preflight.ts';

describe('release plan', () => {
  it('keeps the published packages changeset version bumps, dependents included', () => {
    const plan = releasePlan(
      {
        releases: [
          {
            name: '@mermaid-js/diagram-flowchart',
            type: 'patch',
            oldVersion: '13.0.0-alpha.3',
            newVersion: '13.0.0-alpha.4',
            changesets: ['brave-fox'],
          },
          {
            name: 'mermaid',
            type: 'patch',
            oldVersion: '13.0.0-alpha.3',
            newVersion: '13.0.0-alpha.4',
            changesets: [],
          },
          {
            name: '@mermaid-js/bench',
            type: 'none',
            oldVersion: '0.0.0',
            newVersion: '0.0.0',
            changesets: [],
          },
          {
            name: '@mermaid-js/core',
            type: 'none',
            oldVersion: '13.0.0-alpha.1',
            newVersion: '13.0.0-alpha.1',
            changesets: [],
          },
        ],
      },
      ['@mermaid-js/core', '@mermaid-js/diagram-flowchart', 'mermaid']
    );
    expect(plan).toEqual([
      {
        name: '@mermaid-js/diagram-flowchart',
        from: '13.0.0-alpha.3',
        to: '13.0.0-alpha.4',
        changesets: ['brave-fox'],
      },
      { name: 'mermaid', from: '13.0.0-alpha.3', to: '13.0.0-alpha.4', changesets: [] },
    ]);
  });

  it('versions pending changesets before publishing, since a publish ships HEAD', () => {
    expect(nextStep(0, 0)).toBe('nothing');
    expect(nextStep(2, 0)).toBe('version');
    expect(nextStep(0, 1)).toBe('publish');
    expect(nextStep(2, 1)).toBe('version-then-publish');
  });

  it('passes `changeset status --output` a path relative to the root, which changesets joins on', () => {
    // changesets writes to path.join(cwd, output) even for an absolute output, so an absolute
    // temp file would land under the repository and the plan would never be read back.
    const root = '/work/mermaid-v13';
    for (const file of [
      '/tmp/release-status-x/status.json',
      '/work/mermaid-v13/.tmp/status.json',
    ]) {
      const arg = statusOutputArg(root, file);
      expect(arg.startsWith('/')).toBe(false);
      expect(join(root, arg)).toBe(file);
    }
  });
});
