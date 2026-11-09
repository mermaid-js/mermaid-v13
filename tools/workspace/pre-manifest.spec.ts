import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readManifests } from '../gen-config/src/registry.ts';
import { grammarTargets } from '../gen-grammar/src/generate.ts';
import { diagramPackages, ROOT, WIRING_FILE, workspaceDiagrams } from './diagrams.ts';
import { DEPENDENCY_RULES, MERMAID_NOTICES, RELEASING, syncedFiles } from './sync.ts';

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

  const copy = (path: string) => {
    mkdirSync(join(scratch, path, '..'), { recursive: true });
    cpSync(join(ROOT, path), join(scratch, path), { recursive: true });
  };
  for (const rule of DEPENDENCY_RULES) copy(`${rule.pkg}/package.json`);
  for (const d of workspaceDiagrams()) {
    copy(`${d.dir}/package.json`);
    if (existsSync(join(ROOT, d.dir, WIRING_FILE))) copy(`${d.dir}/${WIRING_FILE}`);
    if (existsSync(join(ROOT, d.dir, 'notices'))) copy(`${d.dir}/notices`);
  }
  copy(RELEASING);
  copy('packages/mermaid/notices');
  copy('tools/gen-grammar/src');

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
});
