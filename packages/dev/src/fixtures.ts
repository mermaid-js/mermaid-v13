/**
 * The curated v13 visual baselines (R-TEST-5): `e2e/diagrams/<folder>/baseline/**.mmd` of each
 * diagram type v13 renders. The Playwright snapshot runner (`e2e/rendering/mmd-snapshots.spec.ts`,
 * tier `baseline`) and the gallery (R-TEST-6) both read these folders, so they can't drift apart.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { THEME_NAMES, type ThemeName } from '@mermaid-js/core/theme';
import { supportsFormat } from 'mermaid';
import { supportedFixtureFolders, supportedTypesOf } from './fixture-discovery.ts';
import { sourceTheme } from './source-theme.ts';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const DIAGRAMS_DIR = join(REPO_ROOT, 'e2e', 'diagrams');
/** The flowchart baseline, which `fixtures.spec.ts` checks for coverage. */
export const BASELINE_DIR = join(DIAGRAMS_DIR, 'flowchart', 'baseline');

/** The themes M1 ships, in gallery column order. */
export const M1_THEMES: readonly ThemeName[] = THEME_NAMES;

export interface Fixture {
  /** Path below the baseline folder with `/` separators, e.g. `shapes/rect.mmd`. */
  readonly path: string;
  readonly source: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return walk(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/** Every baseline fixture, sorted by path. */
export function baselineFixtures(dir = BASELINE_DIR): Fixture[] {
  return walk(dir)
    .map((file) => ({
      path: relative(dir, file).split(sep).join('/'),
      source: readFileSync(file, 'utf8'),
    }))
    .sort((a, b) => Number(a.path > b.path) - Number(a.path < b.path));
}

/**
 * The gallery's fixtures (#207): the `baseline/` folder of every fixture folder whose diagram
 * types mermaid renders (the snapshot discovery's `supportedFixtureFolders`), each under its
 * folder name (`flowchart/shapes/rect.mmd`), in folder order. A new diagram type's baseline
 * joins once its package is registered.
 */
export function galleryFixtures(
  supportedTypes: ReadonlySet<string> = supportedTypesOf((type) => supportsFormat(type, 'svg'))
): Fixture[] {
  return supportedFixtureFolders({ diagramsDir: DIAGRAMS_DIR, supportedTypes })
    .filter((folder) => existsSync(join(DIAGRAMS_DIR, folder, 'baseline')))
    .flatMap((folder) =>
      baselineFixtures(join(DIAGRAMS_DIR, folder, 'baseline')).map((f) => ({
        ...f,
        path: `${folder}/${f.path}`,
      }))
    );
}

/** Whether the fixture picks its own theme (front matter or init directive). */
export function setsTheme(source: string): boolean {
  return sourceTheme(source) !== undefined;
}
