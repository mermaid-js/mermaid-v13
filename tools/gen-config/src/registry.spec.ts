import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DETECTORS_PATH,
  FACETS_PATH,
  generateDetectors,
  generateFacets,
  REGISTRY_PATH,
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

describe('first-party language facets (R-LANG-8, D89)', () => {
  const flowchart = {
    name: '@x/diagram-flowchart',
    exports: {
      '.': { default: './dist/index.js' },
      './language': { default: './dist/language.js' },
    },
    manifest: {
      plugin: 'diagram' as const,
      id: 'flowchart',
      types: ['flowchart-elk', 'flowchart-v2'],
      formats: ['svg'],
      export: 'flowchart',
      language: './dist/language.js',
    },
  };

  it('lists every v12 type in detector order, loading the facet through its subpath', () => {
    const out = generateFacets([flowchart]);
    expect(out).toContain(
      "    load: () => import('@x/diagram-flowchart/language').then((m) => m.language),"
    );
    expect(out).toContain(
      "  { type: 'mindmap', id: 'mindmap', pattern: /^\\s*mindmap/, detector: (text) => /^\\s*mindmap/.test(text) },"
    );
    expect(out).toContain('    pattern: /^\\s*(graph|flowchart)/,');
    expect(out).toContain('    detector: (text) => /^\\s*(graph|flowchart)/.test(text),');
    // The config section the renderer reads: the package id; a type with no package has none.
    expect(out).toContain("    section: 'flowchart',");
    expect(out).not.toMatch(/type: 'mindmap'.*section/);
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'mindmap'"));
    expect(out.indexOf("'sequence'")).toBeLessThan(out.indexOf("'flowchart-v2'"));
  });

  it('names the ids that have a facet in one union type', () => {
    expect(generateFacets([flowchart])).toContain("export type FirstPartyFacetId = 'flowchart';");
    const { language: _, ...manifest } = flowchart.manifest;
    expect(generateFacets([{ ...flowchart, manifest }])).toContain(
      'export type FirstPartyFacetId = never;'
    );
  });

  it('gives a type whose package has no language entry no loader', () => {
    const { language: _, ...manifest } = flowchart.manifest;
    const out = generateFacets([{ ...flowchart, manifest }]);
    expect(out).toContain("    id: 'flowchart',");
    expect(out).not.toContain('load:');
  });

  it('rejects a language entry no exports subpath serves', () => {
    expect(() => generateFacets([{ ...flowchart, exports: {} }])).toThrow(/no exports subpath/);
  });

  it('is up to date (run `pnpm gen:registry`)', () => {
    expect(readFileSync(FACETS_PATH, 'utf8')).toBe(generateFacets(readManifests()));
  });
});
