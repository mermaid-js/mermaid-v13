import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_NAMES } from '@mermaid-js/core/theme';

// D152, D153 (spec #291 T4): a diagram package never checks a theme name or `look`; every family difference
// is a theme variable. Scans the package's runtime sources (specs and v12 ports excluded, and
// the generated config defaults, whose section `theme` default is schema data, not a check).
const SRC = fileURLToPath(new URL('../../diagram-timeline/src', import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'v12-specs') out.push(...sources(path));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.fixtures.ts') &&
      entry.name !== 'fixtures.ts' &&
      entry.name !== 'config-defaults.ts'
    )
      out.push(path);
  }
  return out;
}

describe('no theme names or look in the timeline package (D152)', () => {
  const files = sources(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('scans the renderer', () => {
    expect(files.some((f) => f.path.endsWith(join('render', 'render.ts')))).toBe(true);
  });

  // `base` and `dark` are plain words, so the classic names are checked only on a line that
  // mentions the theme; the rest never appear at all.
  it.each(THEME_NAMES)('never compares the theme with %s', (name) => {
    const q = `['"\`]${name.replace(/-/g, '\\-')}['"\`]`;
    const compared = new RegExp(`theme[^\\n]*${q}|${q}[^\\n]*theme`, 'i');
    expect(files.filter((f) => compared.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it.each([...THEME_NAMES.filter((n) => n.startsWith('redux')), 'neo', 'handDrawn'])(
    'never names %s at all',
    (name) => {
      const quoted = new RegExp(`['"\`]${name.replace(/-/g, '\\-')}['"\`]`);
      expect(files.filter((f) => quoted.test(f.text)).map((f) => f.path)).toEqual([]);
    }
  );

  it('never reads the look config', () => {
    expect(files.filter((f) => /\.look\b|\blook\s*[=!]==/.test(f.text)).map((f) => f.path)).toEqual(
      []
    );
  });
});
