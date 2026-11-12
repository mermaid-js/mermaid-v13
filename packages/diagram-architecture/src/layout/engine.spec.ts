// The engine architecture asks for (#673, D556): `layered` and `dagre` map to `compass` through
// the plugin's aliases, and the layout says so with one ARCHITECTURE_LAYOUT_IGNORED warning;
// `compass`, ELK and any other name are left alone. Which engine `mermaid` then runs is
// checked through `createMermaid().render()` in conformance (`architecture/layout-engine.spec.ts`).
import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_LAYOUT_IGNORED } from '../codes.ts';
import { architecture } from '../plugin.ts';
import { renderArchitectureForTest } from '../render/harness.ts';

const SOURCE = `architecture-beta
 service a(server)[A]
 service b(server)[B]
 a:R --> L:b
`;

const withFrontMatter = (layout: string): string =>
  `---\nconfig:\n  layout: ${layout}\n---\n${SOURCE}`;

const ignored = (warnings: readonly { code: string }[]) =>
  warnings.filter((w) => w.code === ARCHITECTURE_LAYOUT_IGNORED);

describe('the plugin’s layout engine (D284, #673)', () => {
  it('defaults to compass and maps layered and dagre to it', () => {
    expect(architecture.layoutEngine).toEqual({
      default: 'compass',
      aliases: { layered: 'compass', dagre: 'compass' },
    });
  });
});

describe('ARCHITECTURE_LAYOUT_IGNORED', () => {
  it('is not raised by default', async () => {
    expect((await renderArchitectureForTest(SOURCE)).warnings).toEqual([]);
  });

  it.each(['layered', 'dagre'])('is raised once for front matter `layout: %s`', async (name) => {
    const r = await renderArchitectureForTest(withFrontMatter(name));
    expect(r.warnings).toEqual([
      {
        code: ARCHITECTURE_LAYOUT_IGNORED,
        message: `Ignored layout "${name}" for this architecture diagram: it does not place services on the sides their edges name (L, R, T, B); laid out with "compass".`,
      },
    ]);
  });

  it('is raised once for a site-wide `layout: dagre`', async () => {
    const r = await renderArchitectureForTest(SOURCE, { config: { layout: 'dagre' } });
    expect(ignored(r.warnings)).toHaveLength(1);
  });

  it('is raised once for `architecture.layout: layered`', async () => {
    const config = { architecture: { layout: 'layered' } };
    const r = await renderArchitectureForTest(SOURCE, { config });
    expect(ignored(r.warnings)).toHaveLength(1);
  });

  it.each(['compass', 'elk', 'elk.layered', 'swimlane', 'my-engine'])(
    'is not raised for `layout: %s`',
    async (name) => {
      const r = await renderArchitectureForTest(withFrontMatter(name));
      expect(ignored(r.warnings)).toEqual([]);
    }
  );
});
