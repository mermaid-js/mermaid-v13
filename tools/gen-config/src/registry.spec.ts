import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DETECTORS_PATH,
  REGISTRY_PATH,
  generateDetectors,
  generateRegistry,
  readManifests,
} from './registry.ts';

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

  it('loads the ascii entry through its exports subpath, separately (D76)', () => {
    const out = generateRegistry([
      {
        name: '@x/diagram-flowchart',
        exports: { '.': { default: './dist/index.js' }, './ascii': { default: './dist/ascii.js' } },
        manifest: {
          plugin: 'diagram',
          id: 'flowchart',
          types: ['flowchart-v2'],
          formats: ['svg', 'ascii'],
          export: 'flowchart',
          ascii: './dist/ascii.js',
        },
      },
    ]);
    expect(out).toContain(
      "    loadAscii: () => import('@x/diagram-flowchart/ascii').then((m) => m.ascii),"
    );
  });

  it('rejects an ascii entry no exports subpath serves', () => {
    expect(() =>
      generateRegistry([
        {
          name: '@x/diagram-flowchart',
          exports: { '.': { default: './dist/index.js' } },
          manifest: {
            plugin: 'diagram',
            id: 'flowchart',
            types: ['flowchart-v2'],
            formats: ['svg', 'ascii'],
            export: 'flowchart',
            ascii: './dist/ascii.js',
          },
        },
      ])
    ).toThrow(/no exports subpath/);
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

  it('writes the detector table without loaders, for mermaid/slim', () => {
    const out = generateDetectors([
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
    expect(out).toContain(
      "  { type: 'gantt', pattern: /^\\s*gantt/, id: 'gantt', formats: ['svg'] },"
    );
    expect(out).not.toContain('import(');
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'gantt'"));
  });

  it('has an up-to-date detector table (run `pnpm gen:registry`)', () => {
    expect(readFileSync(DETECTORS_PATH, 'utf8')).toBe(generateDetectors(readManifests()));
  });
});
