// The engine architecture asks for (#673, D560): `compass` unless a config layer names another,
// with no alias, and one ARCHITECTURE_PLACEMENT_IGNORED warning naming what `layered` or `dagre`
// leaves out. Which engine `mermaid` then runs is checked through `createMermaid().render()` in
// conformance (`architecture/layout-engine.spec.ts`).
import { describe, expect, it } from 'vitest';
import { layered } from '@mermaid-js/core/layout';
import { ARCHITECTURE_PLACEMENT_IGNORED } from '../codes.ts';
import { architecture } from '../plugin.ts';
import { renderArchitectureForTest } from '../render/harness.ts';

const SOURCE = `architecture-beta
 service a(server)[A]
 service b(server)[B]
 a:R --> L:b
`;

/** Every placement layered leaves out: sides, a `{group}` end and an `align` row. */
const ALL = `architecture-beta
 group g(cloud)[G]
 service a(server)[A] in g
 service b(server)[B] in g
 service c(server)[C]
 a:R --> L:b
 b{group}:R --> L:c
 align row a b
`;

const withFrontMatter = (layout: string, source = SOURCE): string =>
  `---\nconfig:\n  layout: ${layout}\n---\n${source}`;

const ignored = <W extends { code: string }>(warnings: readonly W[]) =>
  warnings.filter((w) => w.code === ARCHITECTURE_PLACEMENT_IGNORED);

const sides = (name: string): string =>
  `Layout "${name}" does not place services on the sides their edges name (L, R, T, B); the sides only set where lines attach.`;

describe('the plugin’s layout engine (D284, D560)', () => {
  it('defaults to compass and maps no name to another', () => {
    expect(architecture.layoutEngine).toEqual({ default: 'compass' });
  });
});

describe('ARCHITECTURE_PLACEMENT_IGNORED', () => {
  it('is not raised by default', async () => {
    expect((await renderArchitectureForTest(SOURCE)).warnings).toEqual([]);
  });

  it.each(['layered', 'dagre'])('is raised once for front matter `layout: %s`', async (name) => {
    const r = await renderArchitectureForTest(withFrontMatter(name), { engine: layered });
    expect(r.warnings).toEqual([{ code: ARCHITECTURE_PLACEMENT_IGNORED, message: sides(name) }]);
  });

  it('names `{group}` ends and `align` too, when the diagram has them', async () => {
    const r = await renderArchitectureForTest(withFrontMatter('layered', ALL), {
      engine: layered,
    });
    expect(ignored(r.warnings)).toEqual([
      {
        code: ARCHITECTURE_PLACEMENT_IGNORED,
        message: `${sides('layered')} It also ignores \`{group}\` on an edge end (the line meets the service, not the group border) and \`align\` rows and columns.`,
      },
    ]);
  });

  it('names `align` alone when the diagram has no edge', async () => {
    const source =
      'architecture-beta\n service a(server)[A]\n service b(server)[B]\n align row a b\n';
    const r = await renderArchitectureForTest(withFrontMatter('dagre', source), {
      engine: layered,
    });
    expect(ignored(r.warnings).map((w) => w.message)).toEqual([
      'Layout "dagre" ignores `align` rows and columns.',
    ]);
  });

  it('is not raised when layered has nothing to leave out', async () => {
    const source = 'architecture-beta\n service a(server)[A]\n';
    const r = await renderArchitectureForTest(withFrontMatter('layered', source), {
      engine: layered,
    });
    expect(r.warnings).toEqual([]);
  });

  it('is raised once for a site-wide `layout: dagre`', async () => {
    const r = await renderArchitectureForTest(SOURCE, {
      config: { layout: 'dagre' },
      engine: layered,
    });
    expect(ignored(r.warnings)).toHaveLength(1);
  });

  it('is raised once for `architecture.layout: layered`', async () => {
    const config = { architecture: { layout: 'layered' } };
    const r = await renderArchitectureForTest(SOURCE, { config, engine: layered });
    expect(ignored(r.warnings)).toHaveLength(1);
  });

  it.each(['compass', 'elk', 'elk.layered', 'swimlane', 'my-engine'])(
    'is not raised for `layout: %s`',
    async (name) => {
      const r = await renderArchitectureForTest(withFrontMatter(name, ALL));
      expect(ignored(r.warnings)).toEqual([]);
    }
  );
});
