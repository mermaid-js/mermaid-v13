import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { sectionOwners } from '../gen-config/src/generate.ts';
import { grammarTargets } from '../gen-grammar/src/generate.ts';
import { diagramPackages, hasManifest, ROOT, WIRING_FILE } from './diagrams.ts';
import { DEPENDENCY_RULES, RELEASING, syncedFiles } from './sync.ts';

/**
 * A port before its integration ticket (T5) has a `packages/diagram-*` package with no `mermaid`
 * manifest: the registry must not load it before it draws. The tools that read only its wiring
 * (grammars, the private tools' dependencies) find it; the readers of the manifest skip it.
 */
describe('a diagram package before its manifest (#637 follow-up)', () => {
  const root = mkdtempSync(join(tmpdir(), 'mermaid-pending-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const rule of DEPENDENCY_RULES) {
    mkdirSync(join(root, rule.pkg), { recursive: true });
    cpSync(join(ROOT, rule.pkg, 'package.json'), join(root, rule.pkg, 'package.json'));
  }
  mkdirSync(join(root, 'tools/gen-grammar/src'), { recursive: true });
  mkdirSync(join(root, RELEASING, '..'), { recursive: true });
  cpSync(join(ROOT, RELEASING), join(root, RELEASING));
  // A port before T5: wiring, no manifest.
  write(
    'packages/diagram-zzlate/package.json',
    JSON.stringify({ name: '@mermaid-js/diagram-zzlate', private: true })
  );
  write(
    `packages/diagram-zzlate/${WIRING_FILE}`,
    [
      'grammars:',
      '  - type: zzlate',
      '    title: Late syntax',
      '    kinds: { module: parser/tokens.ts, object: T }',
      '  - type: zzlateAlt',
      '    grammar: zzlate-alt',
      '    title: Late alt syntax',
      '    kinds: { module: parser/tokens.ts, object: AltKind }',
      'release:',
      '  summary: Not yet.',
      '  install: never',
      'theme:',
      '  notDrawnYet: true',
      '',
    ].join('\n')
  );
  // A port before T5 with no wiring yet, and a plugin that is not a diagram.
  write(
    'packages/diagram-zzbare/package.json',
    JSON.stringify({ name: '@mermaid-js/diagram-zzbare', private: true })
  );
  write(
    'packages/diagram-zzext/package.json',
    JSON.stringify({ name: '@mermaid-js/diagram-zzext', mermaid: { plugin: 'extension' } })
  );

  const found = diagramPackages(root);
  const late = found.find((p) => p.type === 'zzlate');

  it('lists it, with no manifest and its wiring read', () => {
    expect(found.map((p) => p.type)).toEqual(['zzbare', 'zzlate']);
    expect(late?.manifest).toBeUndefined();
    expect(late && hasManifest(late)).toBe(false);
    expect(late?.wiring.theme?.notDrawnYet).toBe(true);
    expect(found.find((p) => p.type === 'zzbare')?.wiring).toEqual({});
  });

  it('gives gen:grammar its grammars, under its package', () => {
    expect(grammarTargets(found).map((t) => [t.type, t.package, t.grammar])).toEqual([
      ['zzlate', undefined, undefined],
      ['zzlateAlt', 'zzlate', 'zzlate-alt'],
    ]);
  });

  it('is a dependency of the private tools only, and has no release row yet', () => {
    const files = syncedFiles(root);
    const listed = (pkg: string, field: string) => {
      const manifest = JSON.parse(files.get(`${pkg}/package.json`) ?? '{}') as Record<
        string,
        Record<string, unknown> | undefined
      >;
      return Object.keys(manifest[field] ?? {}).filter((k) => k.includes('zzlate'));
    };
    expect(listed('packages/conformance', 'devDependencies')).toEqual([
      '@mermaid-js/diagram-zzlate',
    ]);
    expect(listed('packages/bench', 'devDependencies')).toEqual(['@mermaid-js/diagram-zzlate']);
    expect(listed('packages/mermaid', 'dependencies')).toEqual([]);
    expect(listed('packages/language-service', 'peerDependencies')).toEqual([]);
    expect(listed('packages/language-server', 'dependencies')).toEqual([]);
    expect(files.get(RELEASING)).not.toContain('zzlate');
  });

  it('cannot own a config section until it has its manifest', () => {
    write(`packages/diagram-zzbare/${WIRING_FILE}`, 'configDefaults: true\n');
    expect(() => sectionOwners(root)).toThrow(
      "packages/diagram-zzbare: configDefaults needs the package's manifest"
    );
  });
});
