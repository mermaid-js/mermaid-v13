import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFragments, findMigrationFragments } from './fragments.ts';
import {
  MIGRATION_BEGIN,
  MIGRATION_END,
  SCHEMA_PATH,
  SECTION_OWNERS,
  assembleMigration,
  defaultsName,
  generate,
  spliceMigration,
  typeSectionOwners,
} from './generate.ts';

const root = join(import.meta.dirname, '../../..');
const read = (path: string) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;

/** A schema with one top-level key and one diagram section, annotated as given. */
const tinySchema = (themeAnnotation: string, sectionKeyAnnotation = '{ status: pending }') => `
$schema: https://json-schema.org/draft/2019-09/schema
title: Mermaid Config
type: object
properties:
  theme:
    type: string
    default: redux
${themeAnnotation}
  flowchart:
    $ref: '#/$defs/FlowchartDiagramConfig'
    x-mermaid: { status: pending }
  er:
    $ref: '#/$defs/ErDiagramConfig'
    x-mermaid: { status: pending }
$defs:
  ErDiagramConfig:
    title: Er Diagram Config
    type: object
    properties: {}
  FlowchartDiagramConfig:
    title: Flowchart Diagram Config
    type: object
    properties:
      curve:
        type: string
        default: basis
        x-mermaid: ${sectionKeyAnnotation}
`;

async function problemsOf(schema: string): Promise<string> {
  try {
    await generate(schema, () => undefined);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('gen-config', () => {
  it('the committed generated files match the schema (run `pnpm gen:config`)', async () => {
    const { files } = await generate(
      read(SCHEMA_PATH)!,
      read,
      findFragments(root),
      findMigrationFragments(root)
    );
    const stale = [...files].filter(([path, content]) => read(path) !== content).map(([p]) => p);
    expect(stale).toEqual([]);
  });

  it("assembles MIGRATION.md's per-diagram sections from v13/docs/migration", () => {
    const found = findMigrationFragments(root);
    expect(found.length).toBeGreaterThan(0);
    // The numbered fragments keep the old order; a port's `<type>.md` sorts after them.
    expect(found.map((f) => f.name)).toEqual([...found.map((f) => f.name)].sort());
    const doc = read('v13/docs/MIGRATION.md')!;
    expect(doc.endsWith(found.map((f) => f.text).join('\n'))).toBe(true);
    const head = '# Migrating\n\nIntro.\n\n';
    const a = { name: '010-a.md', text: '## A\n\nOne.\n' };
    const b = { name: '020-b.md', text: '## B\n\nTwo.\n' };
    const usecase = { name: 'usecase.md', text: '## Use case\n\nNew.\n' };
    const doc2 = `${head}${a.text}\n${b.text}`;
    // A new fragment is appended; a fragment's edit replaces its old text.
    expect(assembleMigration(doc2, [a, b, usecase])).toBe(`${doc2}\n${usecase.text}`);
    const edited = { ...a, text: '## A\n\nOne, edited.\n' };
    expect(assembleMigration(doc2, [edited, b])).toBe(`${head}${edited.text}\n${b.text}`);
    // The first time, the sections go after the doc.
    expect(assembleMigration('# Migrating\n', [b])).toBe('# Migrating\n\n' + b.text);
    expect(assembleMigration(head, [])).toBe(head);
    expect(() => assembleMigration(head, [{ name: 'x.md', text: 'no heading\n' }])).toThrow(
      /must start with a "## " heading/
    );
    // A fragment named like a section above the fragments is refused, not spliced there.
    expect(() => assembleMigration(`# M\n\n## B\n\nOld.\n\n## A\n\nOne.\n`, [a, b])).toThrow(
      /020-b\.md's "## B" is also above them/
    );
  });

  it('writes defaults for every section owner (#148)', async () => {
    const { files } = await generate(read(SCHEMA_PATH)!, read);
    for (const [section, pkg] of Object.entries(SECTION_OWNERS)) {
      expect(files.get(`${pkg}/src/generated/config-defaults.ts`), section).toContain(
        `export const ${defaultsName(section)}: `
      );
    }
    expect(SECTION_OWNERS['wardley-beta']).toBe('packages/diagram-wardley');
    expect(SECTION_OWNERS.xyChart).toBe('packages/diagram-xychart');
  });

  it('writes a type section of a package beside its own section, not into core (D534)', async () => {
    const { files } = await generate(read(SCHEMA_PATH)!, read);
    expect(typeSectionOwners()).toEqual({ c4beta: 'packages/diagram-c4' });
    const c4 = files.get('packages/diagram-c4/src/generated/config-defaults.ts');
    expect(c4).toContain('export const c4ConfigDefaults: ');
    expect(c4).toContain('export const c4betaConfigDefaults: C4BetaDiagramConfig = ');
    // Core's defaults reach every diagram's resolved config, and the id prefix hashes that.
    expect(files.get('packages/core/src/config/generated/defaults.ts')).not.toContain('c4beta');
  });

  it('owns a section exactly for the packages whose workspace.yaml says configDefaults', () => {
    // Every committed config-defaults.ts has an owner, so dropping the opt-in cannot leave one stale.
    const committed = readdirSync(join(root, 'packages'))
      .filter((d) => existsSync(join(root, 'packages', d, 'src/generated/config-defaults.ts')))
      .map((d) => `packages/${d}`);
    expect(Object.values(SECTION_OWNERS).sort()).toEqual(committed.sort());
  });

  it('camel-cases a dashed section in its defaults name', () => {
    expect(defaultsName('flowchart')).toBe('flowchartConfigDefaults');
    expect(defaultsName('wardley-beta')).toBe('wardleyBetaConfigDefaults');
  });

  it('fails when a key has no x-mermaid annotation', async () => {
    expect(await problemsOf(tinySchema(''))).toContain('#.properties.theme: missing x-mermaid');
    expect(await problemsOf(tinySchema('    x-mermaid: { status: pending }', '{}'))).toContain(
      '#/$defs/FlowchartDiagramConfig.properties.curve: x-mermaid.status must be one of'
    );
  });

  it('fails on incomplete annotations', async () => {
    expect(await problemsOf(tinySchema('    x-mermaid: { status: moved }'))).toContain(
      'a moved key needs x-mermaid.movedTo'
    );
    expect(await problemsOf(tinySchema('    x-mermaid: { status: removed }'))).toContain(
      'a removed key needs x-mermaid.reason or x-mermaid.replacement'
    );
    expect(
      await problemsOf(tinySchema('    x-mermaid: { status: pending, colour: red }'))
    ).toContain('unknown x-mermaid field colour');
  });

  it('writes top-level defaults to core and section defaults to the section package', async () => {
    const { files } = await generate(
      tinySchema('    x-mermaid: { status: pending }'),
      () => undefined
    );
    expect(files.get('packages/core/src/config/generated/defaults.ts')).toContain(
      'CORE_DEFAULTS: MermaidConfig = {\n  "theme": "redux"\n}'
    );
    expect(files.get('packages/diagram-flowchart/src/generated/config-defaults.ts')).toContain(
      'flowchartConfigDefaults: FlowchartDiagramConfig = {\n  "curve": "basis"\n}'
    );
  });

  it('leaves removed keys out of types and defaults, and lists them for MIGRATION.md', async () => {
    const { files } = await generate(
      tinySchema('    x-mermaid: { status: removed, reason: Gone. }'),
      () => undefined
    );
    expect(files.get('packages/core/src/config/generated/config.type.ts')).not.toMatch(/theme\??:/);
    expect(files.get('packages/core/src/config/generated/defaults.ts')).not.toContain('theme');
    expect(files.get('v13/docs/MIGRATION.md')).toContain('| `theme` | removed | Gone. |');
    expect(files.get('v13/docs/config-reference.md')).toContain('| `flowchart.curve` | string |');
  });

  it('writes the config JSON schema for the language service (D96), without required or tsType', async () => {
    const { files } = await generate(
      tinySchema('    x-mermaid: { status: pending }\n    tsType: any'),
      () => undefined
    );
    const source = files.get('packages/language-service/src/generated/config-schema.gen.ts');
    expect(source).toContain('export const configSchema: ConfigSchema = ');
    const json = JSON.parse(source!.slice(source!.indexOf('= ') + 2).replace(/;\s*$/, '')) as {
      properties: Record<string, Record<string, unknown>>;
      $defs: Record<string, unknown>;
    };
    expect(json.properties.theme).toEqual({
      type: 'string',
      default: 'redux',
      'x-mermaid': { status: 'pending' },
    });
    expect(json.properties.flowchart!.$ref).toBe('#/$defs/FlowchartDiagramConfig');
    expect(Object.keys(json.$defs)).toEqual(['ErDiagramConfig', 'FlowchartDiagramConfig']);
    expect(source).not.toContain('"$schema"');
  });

  describe('plugin config fragments (D153)', () => {
    const fragment = `
x-mermaid-fragment:
  id: fixture
  aliases:
    - { from: look, when: sketchy, to: fixture.mode, value: sketch }
  themeVariables:
    fixtureInk: primaryTextColor
properties:
  fixture:
    type: object
    description: The fixture plugin's options.
    x-mermaid: { status: honoured }
    properties:
      mode:
        type: string
        enum: [plain, sketch]
        default: plain
        description: How the fixture draws.
        x-mermaid: { status: honoured }
      extra:
        type: object
        additionalProperties: true
        x-mermaid: { status: pending }
`;
    const pkg = { pkg: 'packages/plugin-fixture', source: fragment };
    const readPkg = (path: string) =>
      path === 'packages/plugin-fixture/package.json'
        ? '{ "name": "@mermaid-js/plugin-fixture" }'
        : undefined;
    const schema = tinySchema('    x-mermaid: { status: pending }');

    it('writes the fragment into its package and leaves core untouched', async () => {
      const without = await generate(schema, () => undefined);
      const { files } = await generate(schema, readPkg, [pkg]);
      expect(files.get('packages/plugin-fixture/src/generated/config-fragment.ts')).toContain(
        `export const configFragment: ConfigFragment = {
  "id": "fixture",
  "keys": {
    "fixture": {
      "mode": 0,
      "extra": "open"
    }
  },
  "defaults": {
    "fixture": {
      "mode": "plain"
    }
  },
  "aliases": [
    {
      "from": "look",
      "when": "sketchy",
      "to": "fixture.mode",
      "value": "sketch"
    }
  ],
  "themeVariables": {
    "fixtureInk": "primaryTextColor"
  }
};`
      );
      for (const path of without.files.keys())
        if (path !== 'v13/docs/config-reference.md')
          expect(files.get(path), path).toBe(without.files.get(path));
    });

    it("documents the fragment's keys under the plugin's section in the config reference", async () => {
      const { files } = await generate(schema, readPkg, [pkg]);
      const doc = files.get('v13/docs/config-reference.md')!;
      expect(doc).toContain(
        '## `fixture` (plugin `@mermaid-js/plugin-fixture`)\n\nKnown only while `@mermaid-js/plugin-fixture` is registered.'
      );
      expect(doc).toContain(
        '| `fixture.mode` | "plain" \\\\| "sketch" | `"plain"` | honoured |  | How the fixture draws. |'
      );
      expect(doc).toContain('Legacy alias: `look: "sketchy"` sets `fixture.mode`.');
    });

    it('fails on a fragment key core already has, or a bad fragment', async () => {
      const clash = fragment.replace('  fixture:\n    type: object', '  theme:\n    type: object');
      await expect(generate(schema, readPkg, [{ ...pkg, source: clash }])).rejects.toThrow(
        /packages\/plugin-fixture: "theme" is a core config key/
      );
      const unannotated = fragment.replace('        x-mermaid: { status: pending }\n', '');
      await expect(generate(schema, readPkg, [{ ...pkg, source: unannotated }])).rejects.toThrow(
        /extra: missing x-mermaid annotation/
      );
      await expect(
        generate(schema, readPkg, [{ ...pkg, source: 'properties: {}' }])
      ).rejects.toThrow(/x-mermaid-fragment.id/);
    });
  });

  it('splices the MIGRATION.md config section between its markers', () => {
    const doc = `# Migrating\n\nBefore.\n\n${MIGRATION_BEGIN}\nold\n${MIGRATION_END}\n\nAfter.\n`;
    expect(spliceMigration(doc, `${MIGRATION_BEGIN}\nnew\n${MIGRATION_END}`)).toBe(
      `# Migrating\n\nBefore.\n\n${MIGRATION_BEGIN}\nnew\n${MIGRATION_END}\n\nAfter.\n`
    );
  });
});
