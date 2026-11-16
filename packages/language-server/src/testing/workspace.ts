/**
 * Temporary workspaces with a `node_modules` of third-party language facets, broken ones
 * included, for the discovery specs.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A facet module whose parse reports one `FAKE_WARNING` over the first word. */
export const FAKE_FACET = `export const language = {
  id: 'fake',
  categories: {},
  namespaces: [['thing']],
  isValidId: () => undefined,
  parse: (text) => ({
    model: {},
    ast: { id: 'root', type: 'root', range: { start: 0, end: text.length } },
    diagnostics: [
      { severity: 'warning', code: 'FAKE_WARNING', message: 'fake facet', range: { start: 0, end: 4 } },
    ],
    symbols: [],
    statements: [],
  }),
  completions: () => [],
  hover: () => undefined,
};
`;

export const detectorSource = (word: string): string =>
  `export const detector = (text) => /^\\s*${word}\\b/.test(text);\n`;

/** Files of one package, by path relative to its directory; `undefined` leaves one out. */
export type PackageFiles = Readonly<Record<string, string | undefined>>;

/** A diagram plugin package with a `language` manifest entry (diagram keyword `word`). */
export function facetPackage(name: string, id: string, word = id): PackageFiles {
  return {
    'package.json': JSON.stringify({
      name,
      type: 'module',
      mermaid: {
        plugin: 'diagram',
        id,
        detector: './detector.js',
        entry: './index.js',
        language: './language.js',
      },
    }),
    'detector.js': detectorSource(word),
    'index.js': 'export default {};\n',
    'language.js': FAKE_FACET,
  };
}

/** A temp directory with `node_modules/<name>/…` for each package; returns its path. */
export function workspace(packages: Readonly<Record<string, PackageFiles>>): string {
  const root = mkdtempSync(join(tmpdir(), 'mermaid-lsp-'));
  for (const [name, files] of Object.entries(packages)) {
    const dir = join(root, 'node_modules', name);
    for (const [file, text] of Object.entries(files)) {
      if (text === undefined) continue;
      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    mkdirSync(dir, { recursive: true });
  }
  return root;
}
