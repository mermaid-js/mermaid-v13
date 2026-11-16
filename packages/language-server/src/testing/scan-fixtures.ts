/**
 * One plugin workspace that both the render scan (`mermaid/node-scan`) and the server's
 * discovery read (D577, #808): each package is a diagram plugin with a valid `language` entry,
 * so the two must accept and skip exactly the same packages. The first four entries are the
 * cases where the server's old scan disagreed with the render scan.
 */
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectorSource, facetPackage, type PackageFiles, workspace } from './workspace.ts';

/** A facet package whose manifest is `facetPackage`'s with `changes` applied. */
function variant(
  name: string,
  id: string,
  changes: Record<string, unknown>,
  files: PackageFiles = {}
): PackageFiles {
  const base = facetPackage(name, id);
  const pkg = JSON.parse(base['package.json']!) as { mermaid: Record<string, unknown> };
  Object.assign(pkg.mermaid, changes);
  return { ...base, 'package.json': JSON.stringify(pkg), ...files };
}

const SCAN_FIXTURES: Readonly<Record<string, PackageFiles>> = {
  // A module whose name starts with two dots is inside the package.
  'dotted-detector': variant(
    'dotted-detector',
    'dotted',
    { detector: './..detector.js' },
    {
      '..detector.js': detectorSource('dotted'),
      'detector.js': undefined,
    }
  ),
  // An id `readManifest` rejects.
  'bad-id': variant('bad-id', 'Bad Id!', {}),
  // Two packages with one id: the first by package name wins (D166), whatever readdir says.
  'dup-b': { ...facetPackage('dup-b', 'dup'), 'detector.js': detectorSource('dup-b') },
  'dup-a': { ...facetPackage('dup-a', 'dup'), 'detector.js': detectorSource('dup-a') },
  good: facetPackage('good', 'good'),
  '@acme/diagram-scoped': facetPackage('@acme/diagram-scoped', 'scoped'),
  // A first-party id or type, claimed by a third party: skipped with a warning.
  'claims-sequence': facetPackage('claims-sequence', 'sequence', 'sequenceDiagram'),
  'claims-flowchart-v2': facetPackage('claims-flowchart-v2', 'flowchart-v2', 'flowchart'),
  // mermaid's own package, hoisted next to the plugins: left out silently.
  '@mermaid-js/diagram-pie': facetPackage('@mermaid-js/diagram-pie', 'pie'),
  'not-json': { 'package.json': '{ "name": ' },
  'no-entry': variant('no-entry', 'no-entry', { entry: undefined }),
  'no-detector': variant('no-detector', 'no-detector', { detector: undefined }),
  'up-detector': variant('up-detector', 'up', { detector: '../../../detector.js' }),
  // Its detector.js is a symlink out of the package (`scanFixtureWorkspace`).
  'link-detector': { ...facetPackage('link-detector', 'link'), 'detector.js': undefined },
  'missing-detector': { ...facetPackage('missing-detector', 'missing'), 'detector.js': undefined },
  'throwing-detector': {
    ...facetPackage('throwing-detector', 'throwing'),
    'detector.js': 'throw new Error("boom");\n',
  },
  'detector-not-a-function': {
    ...facetPackage('detector-not-a-function', 'not-a-function'),
    'detector.js': 'export const detector = 1;\n',
  },
};

/** A temp workspace with every fixture package; returns its path. */
export function scanFixtureWorkspace(): string {
  const root = workspace(SCAN_FIXTURES);
  const outside = workspace({});
  writeFileSync(join(outside, 'detector.js'), detectorSource('link'));
  const link = join(root, 'node_modules', 'link-detector', 'detector.js');
  symlinkSync(join(outside, 'detector.js'), link);
  return root;
}
