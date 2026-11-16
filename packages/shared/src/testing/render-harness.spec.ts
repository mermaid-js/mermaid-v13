/**
 * The shared render harness (#817) on a toy plugin: what each package's harness relies on it
 * for. Each diagram package's own specs and the corpus check the real plugins through it.
 */
import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { createRenderHarness, type HarnessPlugin } from './render-harness.ts';
import { rectText } from './layout-invariants.ts';

interface Toy {
  readonly label: string;
  readonly warnings: readonly Warning[];
}

const error = (message: string): Diagnostic => ({
  severity: 'error',
  code: 'TOY',
  message,
  range: { start: 0, end: 0 },
});

const toy: HarnessPlugin<Toy, { readonly width: number }, { readonly kind: 'toy' }> = {
  id: 'toy',
  parse: (text) => ({
    model: { label: text.trim(), warnings: [{ code: 'TOY_MODEL', message: 'from the model' }] },
    ast: { kind: 'toy' },
    diagnostics: text.includes('bad') ? [error('a bad word')] : [],
  }),
  layout: (model, ctx) => {
    ctx.warn({ code: 'TOY_LAYOUT', message: 'laid out', path: 'toy.width' });
    return { width: model.label.length * 10 };
  },
  render: (model, layout, ctx, w: SvgWriter) => {
    w.open('svg', { id: ctx.idPrefix, viewBox: [0, 0, layout.width, 10] });
    w.open('text');
    w.text(model.label);
    w.close();
    w.close();
  },
};

describe('createRenderHarness', () => {
  it('draws a source through parse, layout and render, with the render id prefix', async () => {
    const r = await createRenderHarness(toy)('hello', { idPrefix: 'p-1' });
    expect(r.svg).toBe('<svg id="p-1" viewBox="0 0 50 10"><text>hello</text></svg>');
    expect(r.model.label).toBe('hello');
    expect(r.ast).toEqual({ kind: 'toy' });
    expect(r.layout).toEqual({ width: 50 });
    expect(r.rejected).toBe(false);
    expect(r.warnings.map((w) => w.code)).toEqual(['TOY_LAYOUT']);
  });

  it('draws a model as given, with no AST', async () => {
    const r = await createRenderHarness(toy)({ label: 'ab', warnings: [] });
    expect(r.svg).toBe('<svg id="mermaid-0" viewBox="0 0 20 10"><text>ab</text></svg>');
    expect(r.ast).toBeUndefined();
  });

  it('throws on a parse error, or draws it as rejected when errors are allowed', async () => {
    await expect(createRenderHarness(toy)('bad')).rejects.toThrow('toy parse error: a bad word');
    const kept = await createRenderHarness(toy, { allowErrors: true })('bad');
    expect(kept.rejected).toBe(true);
    expect((await createRenderHarness(toy)('bad', { allowErrors: true })).svg).toBe(kept.svg);
  });

  it('draws the same SVG with the tree writer, and returns its tree', async () => {
    const harness = createRenderHarness(toy);
    const stream = await harness('tree');
    const tree = await harness('tree', { tree: true });
    expect(tree.svg).toBe(stream.svg);
    expect(stream.tree).toBeUndefined();
    expect(tree.tree).toBeDefined();
  });

  it("keeps a package's warning shape and adds the model's own warnings after the parse", async () => {
    const r = await createRenderHarness(toy, {
      warning: (w) => ({ code: w.code, message: w.message }),
      modelWarnings: (model) => model.warnings,
    })('x');
    expect(r.warnings).toEqual([
      { code: 'TOY_MODEL', message: 'from the model' },
      { code: 'TOY_LAYOUT', message: 'laid out' },
    ]);
  });

  it('reads the config section the package names', async () => {
    const r = await createRenderHarness(toy, { section: 'toyChart' })('x', {
      config: { toyChart: { size: 3 } },
    });
    expect((r.config as unknown as Record<string, unknown>).toyChart).toEqual({ size: 3 });
  });
});

describe('rectText', () => {
  it('prints a box as the problems name it', () => {
    expect(rectText({ x: 1, y: 2.5, width: 3, height: 4 })).toBe('(1, 2.5, 3 × 4)');
    expect(rectText({ x: 1, y: 2.5, width: 3, height: 4 }, 2)).toBe('(1.00, 2.50, 3.00 × 4.00)');
  });
});
