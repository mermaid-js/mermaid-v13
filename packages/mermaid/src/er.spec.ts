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
