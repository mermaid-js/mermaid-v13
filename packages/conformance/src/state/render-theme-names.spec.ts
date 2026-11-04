import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../index.ts';

// D152: the state renderer never checks a theme name or a look; every family difference is a
// theme variable. Comments are stripped first, so explaining a v12 rule in prose stays allowed.
const NAMES =
  /\.look\b|['"`]look['"`]|\.name\b|['"`](?:redux(?:-dark)?(?:-color)?|dark|forest|neutral|base|neo|classic)['"`]/;

const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const dir = join(REPO_ROOT, 'packages/diagram-state/src/render');
const files = [
  ...readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => join(dir, f)),
  join(dir, '../plugin.ts'),
];

describe('state renderer: no theme-name or look checks (D152)', () => {
  it('finds a check the scan is meant to catch', () => {
    expect(strip("if (theme.name === 'redux') x(); // 'neo'")).toMatch(NAMES);
    expect(strip("// theme.name === 'redux'")).not.toMatch(NAMES);
  });

  it.each(files)('%s', (file) => {
    expect(strip(readFileSync(file, 'utf8'))).not.toMatch(NAMES);
  });
});
