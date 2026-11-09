import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, WIRING_FILE } from './diagrams.ts';
import { DEPENDENCY_RULES, RELEASING, staleFiles, syncedFiles } from './sync.ts';
import { copyWorkspaceInputs } from './testing.ts';

/**
 * The files `pnpm regen` rewrites from the diagram packages are up to date, and a new diagram
 * package reaches every one of them with no edit outside its own folder.
 */
describe('pnpm regen: the workspace files a port used to edit by hand', () => {
  it('are up to date (run `pnpm regen`)', () => {
    expect(staleFiles()).toEqual([]);
  });

  const scratch = mkdtempSync(join(tmpdir(), 'mermaid-sync-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('take a new diagram package from its own folder alone', () => {
    // A copy of just the inputs, a pre-manifest package's too (`copyWorkspaceInputs`).
    copyWorkspaceInputs(ROOT, scratch);
    writeFileSync(
      join(scratch, 'tools/gen-grammar/src/zzdemo-agreement.spec.ts'),
      "import { language } from '@mermaid-js/diagram-zzdemo/language';\n"
    );
    mkdirSync(join(scratch, 'packages/diagram-zzdemo'), { recursive: true });
    writeFileSync(
      join(scratch, 'packages/diagram-zzdemo/package.json'),
      JSON.stringify({
        name: '@mermaid-js/diagram-zzdemo',
        mermaid: { plugin: 'diagram', id: 'zzdemo', types: ['zzdemo'], language: './x.js' },
      })
    );
    writeFileSync(
      join(scratch, 'packages/diagram-zzdemo', WIRING_FILE),
      'release:\n  summary: The demo plugin.\n  install: with `mermaid/slim`\n'
    );

    const files = syncedFiles(scratch);
    for (const rule of DEPENDENCY_RULES) {
      const manifest = JSON.parse(files.get(`${rule.pkg}/package.json`)!) as Record<
        string,
        Record<string, unknown>
      >;
      expect(manifest[rule.field]?.['@mermaid-js/diagram-zzdemo'], rule.pkg).toEqual(rule.value);
    }
    expect(files.get(RELEASING)).toContain(
      '| `@mermaid-js/diagram-zzdemo` | The demo plugin. | with `mermaid/slim` |'
    );
    // Only the new package's entries changed: without them, each file is byte for byte as
    // committed (a package.json compared as the JSON it writes, keys in order).
    const DEMO = '@mermaid-js/diagram-zzdemo';
    const withoutDemo = (value: unknown): unknown =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([k]) => k !== DEMO)
              .map(([k, v]) => [k, withoutDemo(v)])
          )
        : value;
    for (const [path, content] of files) {
      const before = readFileSync(join(ROOT, path), 'utf8');
      const after = path.endsWith('package.json')
        ? `${JSON.stringify(withoutDemo(JSON.parse(content)), null, 2)}\n`
        : content
            .split('\n')
            .filter((l) => !l.includes('zzdemo'))
            .join('\n');
      expect(after, path).toBe(before);
    }
  });
});
