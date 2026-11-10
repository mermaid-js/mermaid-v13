import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readManifests } from '../gen-config/src/registry.ts';
import { grammarTargets } from '../gen-grammar/src/generate.ts';
import { diagramPackages, ROOT, WIRING_FILE, workspaceDiagrams } from './diagrams.ts';
import { DEPENDENCY_RULES, MERMAID_NOTICES, RELEASING, syncedFiles } from './sync.ts';
import { copyWorkspaceInputs } from './testing.ts';

/**
 * A port before its T5 (a pre-manifest package): `packages/diagram-<type>` with a
 * `workspace.yaml` but no `mermaid.plugin: 'diagram'` manifest yet. It counts for the workspace
 * tools (conformance depends on it, gen-grammar reads its grammars and may depend on it, the
 * theme scan and the licence check read it) and for nothing that registers or publishes a
 * diagram (the registry, gen-config's sections, mermaid's and bench's dependencies, the language
 * packages, the RELEASING rows, mermaid's notices).
 */
describe('a pre-manifest diagram package (before its T5)', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'mermaid-pre-manifest-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  copyWorkspaceInputs(ROOT, scratch);

  const write = (path: string, text: string) => {
    mkdirSync(join(scratch, path, '..'), { recursive: true });
    writeFileSync(join(scratch, path), text);
  };
  // The port's package: no manifest, a grammar, a release row and notices it must not get yet.
  write(
    'packages/diagram-zzpre/package.json',
    JSON.stringify({ name: '@mermaid-js/diagram-zzpre', version: '0.0.0' })
  );
  write(
    `packages/diagram-zzpre/${WIRING_FILE}`,
    [
      'grammars:',
      '  - type: zzpre',
      '    title: Pre syntax',
      '    kinds: { module: parser/tokens.ts, object: T }',
      'release:',
      '  summary: Not yet.',
      '  install: never',
      '',
    ].join('\n')
  );
  write('packages/diagram-zzpre/notices/mermaid.txt', 'zzpre-notice\n');
  write(
    'tools/gen-grammar/src/zzpre-agreement.spec.ts',
    "import { T } from '@mermaid-js/diagram-zzpre/tokens';\n"
  );
  // A pre-manifest port past its T6: a `./language` export the language service's specs load
  // through a test-only `UNLISTED_FACETS` row.
  write(
    'packages/diagram-zzfacet/package.json',
    JSON.stringify({
      name: '@mermaid-js/diagram-zzfacet',
      exports: { '.': './src/index.ts', './language': './src/language.ts' },
    })
  );
  write(`packages/diagram-zzfacet/${WIRING_FILE}`, '# pre-manifest, T6 done\n');
  // A diagram folder with neither a manifest nor a workspace.yaml is not a diagram package yet.
  write('packages/diagram-zzbare/package.json', JSON.stringify({ name: '@mermaid-js/zzbare' }));

  it('is a workspace diagram without a manifest, and not a plugin', () => {
    const pre = workspaceDiagrams(scratch).find((d) => d.type === 'zzpre');
    expect(pre).toMatchObject({ dir: 'packages/diagram-zzpre', name: '@mermaid-js/diagram-zzpre' });
    expect(pre?.manifest).toBeUndefined();
    expect(diagramPackages(scratch).map((d) => d.type)).not.toContain('zzpre');
    expect(readManifests(scratch).map((m) => m.name)).not.toContain('@mermaid-js/diagram-zzpre');
    expect(workspaceDiagrams(scratch).map((d) => d.type)).not.toContain('zzbare');
  });

  it('has its grammars read by gen-grammar', () => {
    const targets = grammarTargets(workspaceDiagrams(scratch)).map((t) => t.type);
    expect(targets).toContain('zzpre');
  });

  it('is a dependency of conformance and gen-grammar only', () => {
    const files = syncedFiles(scratch);
    const has = (pkg: string, field: string) => {
      const manifest = JSON.parse(files.get(`${pkg}/package.json`)!) as Record<
        string,
        Record<string, unknown> | undefined
      >;
      return manifest[field]?.['@mermaid-js/diagram-zzpre'] !== undefined;
    };
    const wanted = new Set(['packages/conformance', 'tools/gen-grammar']);
    for (const rule of DEPENDENCY_RULES)
      expect(has(rule.pkg, rule.field), `${rule.pkg} ${rule.field}`).toBe(wanted.has(rule.pkg));
  });

  it('gets no RELEASING row and no place in mermaid notices', () => {
    const files = syncedFiles(scratch);
    expect(files.get(RELEASING)).not.toContain('diagram-zzpre');
    expect(files.get(MERMAID_NOTICES)).not.toContain('zzpre-notice');
    expect(files.get(MERMAID_NOTICES)).toBe(readFileSync(join(ROOT, MERMAID_NOTICES), 'utf8'));
  });
  const dependents = (root: string, name: string) => {
    const files = syncedFiles(root);
    return DEPENDENCY_RULES.filter((rule) => {
      const manifest = JSON.parse(files.get(`${rule.pkg}/package.json`)!) as Record<
        string,
        Record<string, unknown> | undefined
      >;
      return manifest[rule.field]?.[name] !== undefined;
    }).map((rule) => `${rule.pkg} ${rule.field}`);
  };

  it("with a `./language` export, is a language-service dev dependency, not a peer or the server's", () => {
    expect(dependents(scratch, '@mermaid-js/diagram-zzfacet')).toEqual([
      'packages/language-service devDependencies',
      'packages/conformance devDependencies',
    ]);
    expect(readManifests(scratch).map((m) => m.name)).not.toContain('@mermaid-js/diagram-zzfacet');
  });

  it('keeps its entries through the scratch copy the regen specs make (copyWorkspaceInputs)', () => {
    const again = mkdtempSync(join(tmpdir(), 'mermaid-pre-manifest-copy-'));
    try {
      copyWorkspaceInputs(scratch, again);
      for (const name of ['@mermaid-js/diagram-zzpre', '@mermaid-js/diagram-zzfacet'])
        expect(dependents(again, name), name).toEqual(dependents(scratch, name));
      expect(dependents(again, '@mermaid-js/diagram-zzpre')).toContain(
        'packages/conformance devDependencies'
      );
    } finally {
      rmSync(again, { recursive: true, force: true });
    }
  });
});
