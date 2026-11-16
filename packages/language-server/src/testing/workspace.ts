/**
 * Temporary workspaces with a `node_modules` of third-party language facets, broken ones
 * included, for the discovery specs.
 */
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
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

/** A file's text, or a symbolic link to a path relative to the link's own directory. */
export type Entry = string | { readonly link: string } | undefined;

/** `files` with every path under `dir`. */
export function under(dir: string, files: PackageFiles): Record<string, Entry> {
  return Object.fromEntries(Object.entries(files).map(([file, text]) => [join(dir, file), text]));
}

/**
 * A temp directory with each entry by relative path (`undefined` leaves one out), such as a
 * pnpm workspace whose packages link their dependencies from `node_modules/.pnpm`; returns its
 * path.
 */
export function tree(entries: Readonly<Record<string, Entry>>): string {
  const root = mkdtempSync(join(tmpdir(), 'mermaid-lsp-'));
  for (const [path, entry] of Object.entries(entries)) {
    if (entry === undefined) continue;
    mkdirSync(join(root, path, '..'), { recursive: true });
    if (typeof entry === 'string') writeFileSync(join(root, path), entry);
    else symlinkSync(entry.link, join(root, path));
  }
  return root;
}
