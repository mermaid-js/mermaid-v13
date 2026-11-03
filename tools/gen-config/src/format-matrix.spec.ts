import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMAT_MATRIX_PATH, generateFormatMatrix } from './format-matrix.ts';
import { readManifests } from './registry.ts';

const flowchart = {
  name: '@x/diagram-flowchart',
  manifest: {
    plugin: 'diagram' as const,
    id: 'flowchart',
    types: ['flowchart-v2'],
    formats: ['svg', 'ascii'],
    export: 'flowchart',
  },
};

describe('type × format support matrix (D58, R-ASCII-5)', () => {
  it('marks each format a manifest declares, per v12 diagram type', () => {
    const out = generateFormatMatrix([flowchart]);
    expect(out).toContain('| `flowchart-v2` | `@x/diagram-flowchart` | yes | yes |');
  });

  it('marks an SVG-only type as having no text output', () => {
    const out = generateFormatMatrix([
      { ...flowchart, manifest: { ...flowchart.manifest, formats: ['svg'] } },
    ]);
    expect(out).toContain('| `flowchart-v2` | `@x/diagram-flowchart` | yes | no |');
  });

  it('lists v12 types without a v13 package as not ported, in detection order', () => {
    const out = generateFormatMatrix([flowchart]);
    expect(out).toContain('| `mindmap` | not ported | no | no |');
    expect(out.indexOf('`flowchart-elk`')).toBeLessThan(out.indexOf('`mindmap`'));
  });

  it('rejects a format the matrix has no column for', () => {
    expect(() =>
      generateFormatMatrix([
        { ...flowchart, manifest: { ...flowchart.manifest, formats: ['png'] } },
      ])
    ).toThrow(/unknown format "png"/);
  });

  it('is up to date (run `pnpm gen:registry`)', () => {
    expect(readFileSync(FORMAT_MATRIX_PATH, 'utf8')).toBe(generateFormatMatrix(readManifests()));
  });
});
