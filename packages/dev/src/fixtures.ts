/**
 * The curated v13 visual baseline (R-TEST-5): `e2e/diagrams/flowchart/baseline/**.mmd`, and
 * the ER diagram's `e2e/diagrams/er-diagram/baseline/*.mmd` (#134).
 * The Playwright snapshot runner (`e2e/rendering/mmd-snapshots.spec.ts`, tier `baseline`) and
 * the gallery (R-TEST-6) both read this folder, so they can't drift apart.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { THEME_NAMES, type ThemeName } from '@mermaid-js/core/theme';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
export const BASELINE_DIR = join(REPO_ROOT, 'e2e', 'diagrams', 'flowchart', 'baseline');
/** The ER diagram's baseline (#134), shown in the gallery under `er/`. */
export const ER_BASELINE_DIR = join(REPO_ROOT, 'e2e', 'diagrams', 'er-diagram', 'baseline');

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

/** The gallery's fixtures: the flowchart baseline, then the ER baseline under `er/`. */
export function galleryFixtures(): Fixture[] {
  const er = baselineFixtures(ER_BASELINE_DIR).map((f) => ({ ...f, path: `er/${f.path}` }));
  return [...baselineFixtures(), ...er];
}

/** Whether the fixture picks its own theme (front matter or init directive). */
export function setsTheme(source: string): boolean {
  return /^\s*theme:\s*\S/m.test(source) || /%%\{\s*init:[^}]*['"]theme['"]/.test(source);
}
