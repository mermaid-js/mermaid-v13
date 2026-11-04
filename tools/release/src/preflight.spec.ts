import { describe, expect, it } from 'vitest';
import { nextStep, releasePlan } from './preflight.ts';

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
});
