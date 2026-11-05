import { er } from '@mermaid-js/diagram-er';
import { describe, expect, it } from 'vitest';
import {
  createMermaid,
  MermaidError,
  prepare,
  render,
  renderSync,
  supportsFormat,
} from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

/** ER is in the generated registry (#134): `erDiagram` renders, no longer UNSUPPORTED_DIAGRAM. */
const ER = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name PK\n  }\n';

describe('ER through the public API (#134)', () => {
  it('renders erDiagram text with no configuration', async () => {
    const { svg, diagramType } = await render('er-1', ER);
    expect(diagramType).toBe('er');
    expect(svg).toMatch(/^<svg [^>]*aria-roledescription="er"/);
    expect(svg).toContain('data-ast="n:CUSTOMER"');
    expect(svg).toContain('data-ast="e:CUSTOMER&gt;ORDER"');
  });

  it('renders synchronously once prepared, byte for byte as render()', async () => {
    await prepare(ER, { id: 'er-2' });
    expect(renderSync(ER, { id: 'er-2' }).svg).toBe((await render('er-2', ER)).svg);
  });

  it('reports ER syntax errors as SYNTAX, not UNSUPPORTED_DIAGRAM', async () => {
    const e = await render('er-3', 'erDiagram\n  A ||--o{\n').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
  });

  it('supports svg and ascii (#136)', () => {
    expect(supportsFormat('er', 'svg')).toBe(true);
    expect(supportsFormat('er', 'ascii')).toBe(true);
  });

  it('applies the er section defaults: v12 spacing 140 / 80', async () => {
    const two = 'erDiagram\n  A ||--o{ B : x\n';
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const wide = await m.render('s', `%%{init: {"er": {"rankSpacing": 300}}}%%\n${two}`);
    const base = await m.render('s', two);
    expect(wide.height - base.height).toBeCloseTo(300 - 80, 0);
  });

  it('renders from mermaid/slim with the plugin passed, as mermaid does', async () => {
    const full = createMermaid();
    expect((await createSlim({ diagrams: [er] }).render('s', ER)).svg).toBe(
      (await full.render('s', ER)).svg
    );
  });
});

describe('ER in the neo themes (D182, #235)', () => {
  // An entity with attributes (rows, the rule under the name, column rules), one without, a
  // subgraph and a relationship with a label and both kinds of end.
  const NEO_ER =
    'erDiagram\n  CUSTOMER {\n    string id PK "the number"\n    string name\n  }\n  CUSTOMER ||--o{ ORDER : places\n  subgraph Shop\n    ORDER\n  end\n';
  const draw = async (theme: string, text = NEO_ER, extra: object = {}): Promise<string> => {
    const m = createMermaid();
    m.initialize({ deterministic: true, theme, ...extra } as never);
    return (await m.render('e', text)).svg;
  };
  const tags = (svg: string, re: RegExp): string[] => svg.match(re) ?? [];
  const url = 'url(#e-gradient)';

  for (const theme of ['neo', 'neo-dark'] as const) {
    it(`outlines entities, their rules and subgraphs with the gradient under ${theme} (v12 erBox.ts)`, async () => {
      const svg = await draw(theme);
      expect(tags(svg, /<linearGradient /g)).toHaveLength(1);
      const outlines = tags(svg, /<rect class="outer-path"[^>]*>/g);
      // CUSTOMER (with attributes) and ORDER (without).
      expect(outlines).toHaveLength(2);
      for (const o of outlines) expect(o).toContain(`stroke="${url}"`);
      const dividers = tags(svg, /<path class="divider"[^>]*>/g);
      expect(dividers).toHaveLength(1);
      expect(dividers[0]).toContain(`stroke="${url}"`);
      expect(tags(svg, /<g class="cluster"[^>]*>\s*<rect[^>]*>/g)[0]).toContain(`stroke="${url}"`);
      // Rows keep no stroke (the divider path draws every rule); relationship lines, ends and
      // labels never take the gradient, and nothing is filled with it.
      for (const r of tags(svg, /<g class="row-rect-[^>]*>\s*<rect[^>]*>/g))
        expect(r).toContain('stroke="none"');
      expect(tags(svg, /url\(#e-gradient\)/g)).toHaveLength(4);
      expect(svg).not.toContain(`fill="${url}"`);
    });
  }

  it('keeps an author style and classDef stroke over the gradient', async () => {
    const svg = await draw(
      'neo',
      'erDiagram\n  A {\n    int x\n  }\n  B\n  style A stroke:#ff0000\n  classDef c stroke:#00ff00\n  class B c\n'
    );
    const [a, b] = tags(svg, /<rect class="outer-path"[^>]*>/g);
    expect(a).toContain('stroke="#ff0000"');
    expect(b).toContain('stroke="#00ff00"');
    expect(tags(svg, /<path class="divider"[^>]*>/g)[0]).toContain('stroke="#ff0000"');
    expect(svg).not.toContain('url(#');
  });

  it('keeps a palette slot stroke over the gradient (data-color-id)', async () => {
    const svg = await draw('redux-color', NEO_ER, { themeVariables: { useGradient: true } });
    for (const o of tags(svg, /<rect class="outer-path"[^>]*>/g)) expect(o).not.toContain('url(');
    // The subgraph has no slot, so it still takes the gradient.
    expect(tags(svg, /<g class="cluster"[^>]*>\s*<rect[^>]*>/g)[0]).toContain(`stroke="${url}"`);
  });

  it('draws no gradient in the other shipped themes', async () => {
    for (const theme of ['default', 'redux', 'redux-dark-color', 'dark']) {
      const svg = await draw(theme);
      expect(svg).not.toContain('<defs');
      expect(svg).not.toContain('url(#');
    }
  });
});
