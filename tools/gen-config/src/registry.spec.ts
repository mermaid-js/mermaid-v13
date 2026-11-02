import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGISTRY_PATH, generateRegistry, readManifests } from './registry.ts';

describe('first-party diagram registry (DESIGN §12.4)', () => {
  it('maps the manifest types onto the v12 detector table', () => {
    const out = generateRegistry([
      {
        name: '@x/diagram-gantt',
        manifest: {
          plugin: 'diagram',
          id: 'gantt',
          types: ['gantt'],
          formats: ['svg'],
          export: 'gantt',
        },
      },
    ]);
    expect(out).toContain("  { type: 'mindmap', pattern: /^\\s*mindmap/ },");
    expect(out).toContain("    load: () => import('@x/diagram-gantt').then((m) => m.gantt),");
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'gantt'"));
  });

  it('rejects a manifest type v12 does not have', () => {
    expect(() =>
      generateRegistry([
        {
          name: '@x/diagram-y',
          manifest: { plugin: 'diagram', id: 'y', types: ['y'], formats: ['svg'], export: 'y' },
        },
      ])
    ).toThrow(/not a v12 diagram type/);
  });

  it('is up to date (run `pnpm gen:registry`)', () => {
    expect(readFileSync(REGISTRY_PATH, 'utf8')).toBe(generateRegistry(readManifests()));
  });
});
