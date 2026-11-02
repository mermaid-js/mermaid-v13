import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_BEGIN,
  MIGRATION_END,
  SCHEMA_PATH,
  generate,
  spliceMigration,
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
$defs:
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
    const { files } = await generate(read(SCHEMA_PATH)!, read);
    const stale = [...files].filter(([path, content]) => read(path) !== content).map(([p]) => p);
    expect(stale).toEqual([]);
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

  it('splices the MIGRATION.md config section between its markers', () => {
    const doc = `# Migrating\n\nBefore.\n\n${MIGRATION_BEGIN}\nold\n${MIGRATION_END}\n\nAfter.\n`;
    expect(spliceMigration(doc, `${MIGRATION_BEGIN}\nnew\n${MIGRATION_END}`)).toBe(
      `# Migrating\n\nBefore.\n\n${MIGRATION_BEGIN}\nnew\n${MIGRATION_END}\n\nAfter.\n`
    );
  });
});
