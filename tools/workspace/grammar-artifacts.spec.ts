import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// D54 / R-PARSE-9: grammar files and everything generated from them (reference parser,
// sentence generator, highlighters, syntax docs) are dev/CI-only. Nothing of it ships.
const root = join(import.meta.dirname, '..', '..');

interface PackageJson {
  name: string;
  private?: boolean;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const published = readdirSync(join(root, 'packages'))
  .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
  .map((dir) => ({
    dir,
    pkg: JSON.parse(
      readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')
    ) as PackageJson,
  }))
  .filter(({ pkg }) => !pkg.private);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|js|mjs)$/.test(entry) && !/\.spec\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe('grammar artefacts stay out of published packages (D54)', () => {
  it('finds the published packages', () => {
    expect(published.map((p) => p.pkg.name)).toContain('@mermaid-js/diagram-flowchart');
  });

  it.each(published.map((p) => [p.pkg.name, p] as const))(
    '%s ships no grammar files',
    (_, { pkg }) => {
      expect(pkg.files).toContain('dist');
      for (const f of pkg.files ?? []) expect(f).not.toMatch(/grammar|\.ebnf/);
      const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
      for (const name of Object.keys(deps)) {
        expect(name).not.toMatch(/gen-grammar|^@lezer\/|vscode-textmate|vscode-oniguruma/);
      }
    }
  );

  it.each(published.map((p) => [p.pkg.name, p] as const))(
    '%s sources never import grammar files or generated grammar output',
    (_, { dir }) => {
      for (const file of sources(join(root, 'packages', dir, 'src'))) {
        const text = readFileSync(file, 'utf8');
        expect(text, file).not.toMatch(/from\s+['"][^'"]*(?:\/grammar\/|gen-grammar|\.ebnf)/);
      }
    }
  );
});
