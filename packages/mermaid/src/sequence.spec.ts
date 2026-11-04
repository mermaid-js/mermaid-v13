import { sequence } from '@mermaid-js/diagram-sequence';
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

/**
 * Sequence is in the generated registry (#145): `sequenceDiagram` renders, no longer
 * UNSUPPORTED_DIAGRAM, as SVG and as text.
 */
const SEQ = 'sequenceDiagram\n  participant A as Alice\n  A->>B: Hello\n  B-->>A: Hi\n';

describe('sequence through the public API (#145)', () => {
  it('renders sequenceDiagram text with no configuration', async () => {
    const { svg, diagramType } = await render('seq-1', SEQ);
    expect(diagramType).toBe('sequence');
    expect(svg).toMatch(/^<svg [^>]*aria-roledescription="sequence"/);
    expect(svg).toContain('data-ast="p:A"');
    expect(svg).toContain('Hello');
  });

  it('renders synchronously once prepared, byte for byte as render()', async () => {
    await prepare(SEQ, { id: 'seq-2' });
    expect(renderSync(SEQ, { id: 'seq-2' }).svg).toBe((await render('seq-2', SEQ)).svg);
  });

  it('reports sequence syntax errors as SYNTAX, not UNSUPPORTED_DIAGRAM', async () => {
    const e = await render('seq-3', 'sequenceDiagram\n  A->>\n').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
  });

  // v12's c4 detector sits ahead of sequence and matches `C4Container` (and `C4Component`,
  // `C4Dynamic`, `C4Deployment`) anywhere in the text; only `C4Context` is anchored. v12 sent
  // these diagrams to c4 too, so the order and the regex are kept (MIGRATION.md).
  it('leaves a sequence diagram naming C4Container to c4, as v12 did', async () => {
    const stolen = await render('seq-c4', 'sequenceDiagram\n  A->>C4Container: hi\n').catch(
      (x: unknown) => x
    );
    expect(stolen).toBeInstanceOf(MermaidError);
    expect((stolen as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
    expect((stolen as MermaidError).message).toContain('"c4"');
    const kept = await render('seq-c4b', 'sequenceDiagram\n  participant C4Context\n');
    expect(kept.diagramType).toBe('sequence');
  });

  it('supports svg and ascii (#150)', () => {
    expect(supportsFormat('sequence', 'svg')).toBe(true);
    expect(supportsFormat('sequence', 'ascii')).toBe(true);
  });

  it('draws text through the manifest ascii entry', async () => {
    const result = await createMermaid().render('s', SEQ, { format: 'ascii' });
    expect(result.format).toBe('ascii');
    expect(result.diagramType).toBe('sequence');
    expect(result.text).toContain('Alice');
    expect(result.text).toContain('Hello');
  });

  it('draws a front-matter title in text only; the SVG leaves it out, as flowchart (D122)', async () => {
    const m = createMermaid();
    const src = `---\ntitle: Front Title\n---\n${SEQ}`;
    expect((await m.render('s', src)).svg).not.toContain('Front Title');
    expect((await m.render('s', src, { format: 'ascii' })).text).toContain('Front Title');
    const stated = (await m.render('s', SEQ.replace('\n', '\n  title Stated\n'))).svg;
    expect(stated).toContain('class="sequenceTitle"');
  });

  it('honours the sequence section from config', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const wide = await m.render('s', `%%{init: {"sequence": {"actorMargin": 250}}}%%\n${SEQ}`);
    const base = await m.render('s', SEQ);
    expect(wide.width - base.width).toBeCloseTo(250 - 50, 0);
  });

  it('renders from mermaid/slim with the plugin passed, as mermaid does', async () => {
    const full = createMermaid();
    expect((await createSlim({ diagrams: [sequence] }).render('s', SEQ)).svg).toBe(
      (await full.render('s', SEQ)).svg
    );
  });
});
