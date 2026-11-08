/**
 * D392 through render: an author's `mix-blend-mode: normal | multiply` in `style`, `classDef`
 * or `linkStyle` reaches the shape as `style="mix-blend-mode:…"` in every type that applies
 * `checkStyle`'s shape attributes, and nothing else in the output changes.
 */
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const BLEND = ',mix-blend-mode:multiply';
const ATTR = ' style="mix-blend-mode:multiply"';

const FIXTURES: Readonly<Record<string, string>> = {
  flowchart: [
    'flowchart LR',
    '  A --> B',
    '  subgraph S',
    '    C',
    '  end',
    '  style A fill:#f00{X}',
    '  style S fill:#0f0{X}',
    '  linkStyle 0 stroke:#00f{X}',
  ].join('\n'),
  class: ['classDiagram', '  class A', '  style A fill:#f00{X}'].join('\n'),
  state: ['stateDiagram-v2', '  classDef c fill:#f00{X}', '  s1 --> s2', '  class s1 c'].join('\n'),
  er: ['erDiagram', '  A ||--o{ B : has', '  style A fill:#f00{X}'].join('\n'),
  gantt: [
    'gantt',
    '  dateFormat YYYY-MM-DD',
    '  todayMarker stroke-width:5px{X}',
    '  a :2026-01-10, 10d',
  ].join('\n'),
};
/** Elements each fixture styles: flowchart's node, subgraph and link. */
const STYLED: Readonly<Record<string, number>> = { flowchart: 3 };
const NOW = { now: Date.UTC(2026, 0, 15) };

describe('mix-blend-mode in author styles (D392)', () => {
  it.each(Object.entries(FIXTURES))('%s adds only the blend style', async (type, source) => {
    const m = createMermaid();
    const plain = (await m.render('d1', source.replaceAll('{X}', ''), NOW)).svg;
    const { svg, warnings } = await m.render('d1', source.replaceAll('{X}', BLEND), NOW);
    expect(svg.split(ATTR)).toHaveLength((STYLED[type] ?? 1) + 1);
    expect(svg.replaceAll(ATTR, '')).toBe(plain);
    expect(warnings.filter((w) => w.code.startsWith('STYLE_'))).toEqual([]);
    assertInert(svg, { themeStyle: svg.includes('<style>') });
  });

  it('drops any other blend value with a warning, as before', async () => {
    const m = createMermaid();
    const source = FIXTURES.flowchart!;
    const plain = (await m.render('d1', source.replaceAll('{X}', ''))).svg;
    const { svg, warnings } = await m.render(
      'd1',
      source.replaceAll('{X}', ',mix-blend-mode:screen')
    );
    expect(svg).toBe(plain);
    expect(warnings.map((w) => w.code)).toContain('STYLE_VALUE_DROPPED');
  });
});
