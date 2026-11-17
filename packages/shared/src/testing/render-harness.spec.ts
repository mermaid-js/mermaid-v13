/**
 * The shared render harness (#817) on a toy plugin: what each package's harness relies on it
 * for. Each diagram package's own specs and the corpus check the real plugins through it.
 */
import { describe, expect, it } from 'vitest';
import type { DiagramParseContext, RenderContext, Warning } from '@mermaid-js/core';
import type { LayoutContext, LayoutGraph, LayoutModel } from '@mermaid-js/core/layout';
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
    seen = ctx;
    w.open('svg', { id: ctx.idPrefix, viewBox: [0, 0, layout.width, 10] });
    w.open('text');
    w.text(model.label);
    w.close();
    w.close();
  },
};

/** The render context the toy last drew with. */
let seen: RenderContext | undefined;

/** The toy as a graph diagram: its layout hands an empty graph to `ctx.layout`. */
const graphToy: typeof toy = {
  ...toy,
  layout: (_model, ctx) => {
    ctx.layout({ nodes: [], edges: [] } as unknown as LayoutGraph);
    return { width: 10 };
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

  it("adds the model's own warnings after the parse, all in the package's warning shape", async () => {
    const r = await createRenderHarness(toy, {
      warning: (w) => ({ code: w.code, message: w.message.toUpperCase() }),
      modelWarnings: (model) => model.warnings,
    })('x');
    expect(r.warnings).toEqual([
      { code: 'TOY_MODEL', message: 'FROM THE MODEL' },
      { code: 'TOY_LAYOUT', message: 'LAID OUT' },
    ]);
  });

  it('puts the `below` layer under the integrator config (D284)', async () => {
    const harness = createRenderHarness(toy, { below: { layout: 'tree' } });
    expect((await harness('x')).config.layout).toBe('tree');
    expect((await harness('x', { config: { layout: 'elk' } })).config.layout).toBe('elk');
  });

  it('draws with no gradient when the spec turns it off', async () => {
    const neo = { config: { theme: 'neo' } };
    expect((await createRenderHarness(toy)('x', neo)).gradient).toEqual(expect.any(String));
    expect((await createRenderHarness(toy, { gradient: false })('x', neo)).gradient).toBe(false);
  });

  it("calls the spec's engine, or the one given, with the render's config", async () => {
    const calls: [string, LayoutContext | undefined][] = [];
    const engine =
      (name: string) =>
      (_graph: LayoutGraph, ctx?: LayoutContext): LayoutModel => {
        calls.push([name, ctx]);
        return { nodes: [], edges: [], width: 0, height: 0 } as unknown as LayoutModel;
      };
    const harness = createRenderHarness(graphToy, { engine: engine('default') });
    const a = await harness('x');
    const b = await harness('x', { engine: engine('given') });
    expect(calls).toEqual([
      ['default', { config: a.config }],
      ['given', { config: b.config }],
    ]);
  });

  it('throws from ctx.layout for a diagram that lays itself out', async () => {
    await expect(createRenderHarness(graphToy)('x')).rejects.toThrow(
      'toy lays itself out (layoutKind: custom)'
    );
  });

  it("hands a spec's parse the config, the preprocessed source and the limits", async () => {
    let got: DiagramParseContext | undefined;
    const r = await createRenderHarness(toy, {
      parse: (text, ctx) => {
        got = ctx;
        return toy.parse(text, ctx);
      },
    })('x');
    expect(got?.config).toBe(r.config);
    expect(got?.preprocessed.bodyStart).toBe(0);
    expect(got?.limits?.maxNodes).toEqual(expect.any(Number));
  });

  it('passes the theme and context options through to the render', async () => {
    const icon: RenderContext['icon'] = () => undefined;
    const inline = { spans: () => undefined } as unknown as RenderContext['inline'];
    const iconPacks = { state: () => 'ready' } as unknown as RenderContext['iconPacks'];
    await createRenderHarness(toy)('x', {
      cssVariables: false,
      securityLevel: 'strict',
      linkSchemes: ['ftp'],
      icon,
      iconPacks,
      inline,
    });
    expect(seen?.theme.cssVariables).toBe(false);
    expect(seen?.securityLevel).toBe('strict');
    expect(seen?.linkSchemes).toEqual(['ftp']);
    expect(seen?.icon).toBe(icon);
    expect(seen?.iconPacks).toBe(iconPacks);
    expect(seen?.inline).toBe(inline);
    await createRenderHarness(toy)('x');
    expect(seen?.theme.cssVariables).toBe(true);
    expect(seen?.securityLevel).toBe('default');
    expect(seen && 'linkSchemes' in seen).toBe(false);
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
