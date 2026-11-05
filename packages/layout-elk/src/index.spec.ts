import { describe, expect, it } from 'vitest';
import { createMermaid, type LayoutLoader } from 'mermaid';
import elkLayouts from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n  A --> C{Choice}\n  C -->|yes| B\n';
const withLayout = (name: string, text = FLOW) => `---\nconfig:\n  layout: ${name}\n---\n${text}`;

// One small diagram per graph type (layoutKind 'graph').
const GRAPH_TYPES: Record<string, string> = {
  flowchart: 'flowchart TD\n  A --> B\n  subgraph S\n    C --> D\n  end\n  B --> C\n',
  class: 'classDiagram\n  Animal <|-- Duck\n  Animal <|-- Fish\n  Animal : +int age\n',
  state:
    'stateDiagram-v2\n  [*] --> Still\n  Still --> Moving\n  Moving --> Crash\n  Crash --> [*]\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains\n',
};

describe('@mermaid-js/layout-elk (D171)', () => {
  it('has the v12 LayoutLoader[] shape with the nine ELK names', () => {
    const loaders: readonly LayoutLoader[] = elkLayouts;
    expect(loaders.map((l) => l.name)).toEqual([
      'elk',
      'elk.layered',
      'elk.stress',
      'elk.force',
      'elk.mrtree',
      'elk.sporeOverlap',
      'elk.box',
      'elk.rectpacking',
      'elk.radial',
    ]);
  });

  it('works with the v12 registration snippet, and ELK lays out `layout: elk`', async () => {
    const plain = createMermaid();
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    const viaElk = await m.render('d', withLayout('elk'));
    const without = await plain.render('d', withLayout('elk'));
    expect(viaElk.warnings).toEqual([]);
    expect(without.warnings.map((w) => w.code)).toEqual(['ELK_NOT_INSTALLED']);
    // Same diagram, different engine: the drawing changes.
    expect(viaElk.svg).not.toBe(without.svg);
  });

  it('lays out the flowchart-elk header with ELK once the plugin is registered', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    const text = 'flowchart-elk LR\n  A[Start] --> B(End)\n  A --> C{Choice}\n  C -->|yes| B\n';
    const r = await m.render('d', text);
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe((await m.render('d', withLayout('elk'))).svg);
  });

  it.each([
    'elk.layered',
    'elk.stress',
    'elk.force',
    'elk.mrtree',
    'elk.sporeOverlap',
    'elk.box',
    'elk.rectpacking',
  ])('renders %s without a warning, deterministically', async (name) => {
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    const first = await m.render('d', withLayout(name));
    expect(first.warnings).toEqual([]);
    expect(first.svg).not.toMatch(/NaN|\$H/);
    expect((await createMermaidWithElk().render('d', withLayout(name))).svg).toBe(first.svg);
  });

  it('renders elk.radial for a tree', async () => {
    const m = createMermaidWithElk();
    const r = await m.render(
      'd',
      withLayout('elk.radial', 'flowchart TD\n  A --> B\n  A --> C\n  B --> D\n')
    );
    expect(r.warnings).toEqual([]);
    expect(r.svg).not.toContain('NaN');
  });

  it('renders synchronously once prepared (D172)', async () => {
    const m = createMermaidWithElk();
    await m.prepare(withLayout('elk.mrtree'));
    const sync = m.renderSync(withLayout('elk.mrtree'), { id: 'd' });
    expect(sync.warnings).toEqual([]);
    expect(sync.svg).toBe((await m.render('d', withLayout('elk.mrtree'))).svg);
  });

  it('an unknown elk.* name warns LAYOUT_UNKNOWN, not ELK_NOT_INSTALLED, once the plugin is in', async () => {
    const r = await createMermaidWithElk().render('d', withLayout('elk.nope'));
    expect(r.warnings.map((w) => w.code)).toEqual(['LAYOUT_UNKNOWN']);
  });

  it.each(Object.entries(GRAPH_TYPES))(
    'leaves a %s diagram that names no layout on layered (D127, R-LAYOUT-7)',
    async (_type, text) => {
      const plain = await createMermaid().render('d', text);
      const withElk = await createMermaidWithElk().render('d', text);
      expect(withElk.warnings).toEqual(plain.warnings);
      expect(withElk.svg).toBe(plain.svg);
    }
  );
});

function createMermaidWithElk() {
  const m = createMermaid();
  m.registerLayoutLoaders(elkLayouts);
  return m;
}
