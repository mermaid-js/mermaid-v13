import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_NAMES } from '@mermaid-js/core/theme';

// D152, D153: a diagram package never checks a theme name or `look`; every family difference
// is a theme variable. Scans the package's runtime sources (specs and v12 ports excluded).
const SRC = fileURLToPath(new URL('../../diagram-er/src', import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'v12-specs') out.push(...sources(path));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

describe('no theme names or look in the ER package (D152)', () => {
  const files = sources(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('scans the renderer', () => {
    expect(files.some((f) => f.path.endsWith(join('render', 'render.ts')))).toBe(true);
  });

  // `default` is also v12's entity class, so plain names are checked only where compared.
  it.each([...THEME_NAMES, 'neo', 'handDrawn'])(
    'never compares with the theme or look %s',
    (name) => {
      const q = `['"\`]${name.replace(/-/g, '\\-')}['"\`]`;
      const compared = new RegExp(
        `[=!]==?\\s*${q}|${q}\\s*[=!]==?|\\.has\\(\\s*${q}|theme[^\\n]*${q}`
      );
      expect(files.filter((f) => compared.test(f.text)).map((f) => f.path)).toEqual([]);
    }
  );

  it.each(THEME_NAMES.filter((n) => n.startsWith('redux')))('never names %s at all', (name) => {
    expect(files.filter((f) => f.text.includes(`'${name}'`)).map((f) => f.path)).toEqual([]);
  });

  it('never reads the look config', () => {
    expect(files.filter((f) => /\.look\b|\blook\s*[=!]==/.test(f.text)).map((f) => f.path)).toEqual(
      []
    );
  });
});
