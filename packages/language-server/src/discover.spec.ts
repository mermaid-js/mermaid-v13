/**
 * Third-party facet discovery (DESIGN §4.5, D89): `discoverFacets` over temp workspaces, then
 * the rows through the language service. A broken or missing manifest never throws.
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverFacets } from './discover.ts';
import { detectorSource, FAKE_FACET, facetPackage, workspace } from './testing/workspace.ts';

const codes = async (root: string, text: string) => {
  const service = createLanguageService({ facets: await discoverFacets(root) });
  await service.preload();
  return service
    .update('file:///x.mmd', text)
    .diagnostics()
    .map((d) => d.code);
};

describe('discoverFacets', () => {
  it('finds a package with a language manifest, scoped or not, and the service uses it', async () => {
    const root = workspace({
      'mermaid-fake': facetPackage('mermaid-fake', 'fake'),
      '@acme/diagram-other': facetPackage('@acme/diagram-other', 'other'),
    });
    const rows = await discoverFacets(root);
    expect(rows.map((r) => [r.type, r.id]).sort()).toEqual([
      ['fake', 'fake'],
      ['other', 'other'],
    ]);
    expect(await codes(root, 'fake\n')).toEqual(['FAKE_WARNING']);
    expect(await codes(root, 'other\n')).toEqual(['FAKE_WARNING']);
  });

  it('finds packages in the node_modules of parent directories', async () => {
    const root = workspace({ 'mermaid-fake': facetPackage('mermaid-fake', 'fake') });
    const rows = await discoverFacets(join(root, 'src', 'deep'));
    expect(rows.map((r) => r.id)).toEqual(['fake']);
  });

  it('skips broken and missing manifests without throwing, and says why', async () => {
    const good = facetPackage('good', 'good');
    const root = workspace({
      good,
      'not-json': { 'package.json': '{ "name": ' },
      'no-package-json': { 'index.js': '' },
      'string-manifest': { 'package.json': JSON.stringify({ name: 'x', mermaid: 'diagram' }) },
      'no-language': {
        'package.json': JSON.stringify({
          name: 'no-language',
          mermaid: { plugin: 'diagram', id: 'nl' },
        }),
      },
      'extension-only': {
        'package.json': JSON.stringify({
          name: 'ext',
          mermaid: { plugin: 'extension', id: 'ext' },
        }),
      },
      'no-detector': {
        'package.json': JSON.stringify({
          name: 'no-detector',
          mermaid: { plugin: 'diagram', id: 'nd', language: './language.js' },
        }),
        'language.js': FAKE_FACET,
      },
      'no-id': {
        'package.json': JSON.stringify({
          name: 'no-id',
          mermaid: { plugin: 'diagram', detector: './d.js', language: './language.js' },
        }),
      },
      'bad-language-path': {
        'package.json': JSON.stringify({
          name: 'bad-language-path',
          mermaid: { plugin: 'diagram', id: 'blp', detector: './d.js', language: 42 },
        }),
      },
      'missing-detector-file': {
        ...facetPackage('missing-detector-file', 'mdf'),
        'detector.js': undefined,
      },
      'throwing-detector': {
        ...facetPackage('throwing-detector', 'td'),
        'detector.js': 'throw new Error("boom");\n',
      },
      'detector-not-a-function': {
        ...facetPackage('detector-not-a-function', 'dnf'),
        'detector.js': 'export const detector = 1;\n',
      },
    });
    const log: string[] = [];
    const rows = await discoverFacets(root, { log: (m) => log.push(m) });
    expect(rows.map((r) => r.id)).toEqual(['good']);
    expect(log.join('\n')).toMatch(/not-json: unreadable package\.json/);
    expect(log.join('\n')).toMatch(/no-detector: the manifest has no "detector"/);
    expect(log.join('\n')).toMatch(/no-id: the manifest has no "id"/);
    expect(log.join('\n')).toMatch(/bad-language-path: "language" must be a module path/);
    expect(log.join('\n')).toMatch(/missing-detector-file: detector failed to load/);
    expect(log.join('\n')).toMatch(/throwing-detector: detector failed to load \(boom\)/);
    expect(log.join('\n')).toMatch(
      /detector-not-a-function: the detector module exports no function/
    );
    expect(log).toHaveLength(7);
  });

  it('gives a facet whose language module is missing LANGUAGE_LOAD_FAILED, not a throw', async () => {
    const root = workspace({
      broken: { ...facetPackage('broken', 'broken'), 'language.js': undefined },
      throws: { ...facetPackage('throws', 'throws'), 'language.js': 'throw new Error("no");\n' },
    });
    expect(await codes(root, 'broken\n')).toEqual(['LANGUAGE_LOAD_FAILED']);
    expect(await codes(root, 'throws\n')).toEqual(['LANGUAGE_LOAD_FAILED']);
  });

  it('skips a first-party id and a second package with an id already found', async () => {
    const root = workspace({
      'a-flow': facetPackage('a-flow', 'flowchart'),
      'b-fake': facetPackage('b-fake', 'fake'),
      'c-fake': { ...facetPackage('c-fake', 'fake'), 'detector.js': detectorSource('other') },
    });
    expect((await discoverFacets(root)).map((r) => r.id)).toEqual(['fake']);
    expect(await codes(root, 'fake\n')).toEqual(['FAKE_WARNING']);
  });

  it('returns nothing for a root that does not exist', async () => {
    expect(await discoverFacets(join(workspace({}), 'missing'))).toEqual([]);
  });

  it('detects third-party types with v12 detector text: directives and comments removed', async () => {
    const root = workspace({ 'mermaid-fake': facetPackage('mermaid-fake', 'fake') });
    expect(await codes(root, '%%{init: {}}%%\nfake\n')).toContain('FAKE_WARNING');
    expect(await codes(root, 'fake2\n')).not.toContain('FAKE_WARNING');
  });
});
