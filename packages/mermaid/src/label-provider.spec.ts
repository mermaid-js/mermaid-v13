import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { InlineBox, LabelRequest } from '@mermaid-js/core/text';
import { createMermaid, MermaidError, type ExtensionPlugin } from './index.ts';

/** What a provider was asked with, and the hook context's fields the spec reads. */
interface Asked {
  readonly raw: string;
  readonly request: LabelRequest;
  readonly diagram: string;
  readonly deterministic: boolean | undefined;
}

/** A box `width` × 40 px drawn as a classed frame, with its baseline 30 px down. */
const frame = (width: number): InlineBox => ({
  width,
  height: 40,
  baseline: 30,
  node: {
    tag: 'g',
    attrs: { class: 'fixture-label' },
    children: [{ tag: 'rect', attrs: { width, height: 40, fill: 'none' } }],
  },
});

/** An extension that boxes every label `accept` takes, and notes what it was asked. */
function boxer(
  id: string,
  asked: Asked[],
  accept: (raw: string) => boolean = () => true,
  width = 300
): ExtensionPlugin {
  return {
    id,
    label: {
      box(raw, request, ctx) {
        asked.push({ raw, request, diagram: ctx.diagram, deterministic: ctx.deterministic });
        return accept(raw) ? frame(width) : undefined;
      },
    },
  };
}

function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return { m, ready: m.registerExternalDiagrams(extensions) };
}

const FLOW = 'flowchart LR\n  A["Alpha <b>one</b>"] -->|goes| B("`**Beta**`")';
const frames = (svg: string): number => svg.split('class="fixture-label"').length - 1;

describe('a whole-label provider (D695)', () => {
  it('is asked with the label as written, its wrap width, its markup mode and the context', async () => {
    const asked: Asked[] = [];
    const { m, ready } = api(boxer('whole', asked, () => false));
    await ready;
    await m.render('x', FLOW);
    const alpha = asked.find((a) => a.raw === 'Alpha <b>one</b>');
    expect(alpha).toBeDefined();
    expect(alpha!.request.markup).toBe('plain');
    expect(alpha!.request.maxWidth).toBeGreaterThan(0);
    expect(alpha!.request.font.size).toBeGreaterThan(0);
    expect(alpha!.diagram).toBe('flowchart');
    expect(alpha!.deterministic).toBe(true);
    expect(asked.find((a) => a.raw === '**Beta**')?.request.markup).toBe('markdown');
    expect(asked.some((a) => a.raw === 'goes')).toBe(true);
  });

  it('draws the box instead of the text, and the node grows to hold it', async () => {
    const plain = await api().m.render('x', FLOW);
    const { m, ready } = api(boxer('whole', []));
    await ready;
    const r = await m.render('x', FLOW);
    expect(frames(r.svg)).toBe(3);
    expect(r.svg).not.toContain('Alpha');
    expect(r.svg).not.toContain('Beta');
    expect(r.width).toBeGreaterThan(plain.width);
    assertInert(r.svg);
  });

  it('leaves a label it declines to core: the output is the one without the provider', async () => {
    const plain = await api().m.render('x', FLOW);
    const { m, ready } = api(boxer('whole', [], () => false));
    await ready;
    expect((await m.render('x', FLOW)).svg).toBe(plain.svg);
  });

  it('boxes only the labels it takes', async () => {
    const { m, ready } = api(boxer('whole', [], (raw) => raw === 'goes'));
    await ready;
    const r = await m.render('x', FLOW);
    expect(frames(r.svg)).toBe(1);
    expect(r.svg).toContain('Alpha');
  });

  it('asks in registration order and takes the first box', async () => {
    const first: Asked[] = [];
    const second: Asked[] = [];
    const { m, ready } = api(
      boxer('first', first, (raw) => raw === 'goes', 50),
      boxer('second', second, () => true, 300)
    );
    await ready;
    const r = await m.render('x', FLOW);
    expect(r.svg).toContain('<rect width="50"');
    expect(second.some((a) => a.raw === 'goes')).toBe(false);
    expect(second.some((a) => a.raw === 'Alpha <b>one</b>')).toBe(true);
  });

  it('wins over inline providers, which then see none of the label', async () => {
    let spans = 0;
    const math: ExtensionPlugin = {
      id: 'fixture-math',
      inline: [{ open: '$$', close: '$$', box: () => (spans++, frame(10)) }],
    };
    const { m, ready } = api(math, boxer('whole', []));
    await ready;
    await m.render('x', 'flowchart LR\n  A["From $$x$$"]');
    expect(spans).toBe(0);
  });

  it('is never asked for text output', async () => {
    const asked: Asked[] = [];
    const { m, ready } = api(boxer('whole', asked));
    await ready;
    const r = await m.render('x', FLOW, { format: 'ascii' });
    expect(asked).toEqual([]);
    expect(r.text).toContain('Alpha');
  });

  it('shares the hook state with afterMount', async () => {
    const seen: unknown[] = [];
    const stateful: ExtensionPlugin = {
      id: 'stateful',
      label: {
        box(raw, _request, ctx) {
          ((ctx.state.labels ??= []) as string[]).push(raw);
          return undefined;
        },
      },
      afterMount: (_el, _result, state) => void seen.push(state.labels),
    };
    const { m, ready } = api(stateful);
    await ready;
    const r = await m.render('x', 'flowchart LR\n  A["Alpha"]');
    r.bindFunctions!({} as Element);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('Alpha');
  });

  it('rejects a box off the allow-list and blames the extension', async () => {
    const bad: ExtensionPlugin = {
      id: 'bad-label',
      label: {
        box: () => ({ width: 1, height: 1, baseline: 1, node: { tag: 'foreignObject' } }) as never,
      },
    };
    const { m, ready } = api(bad);
    await ready;
    const e = await m.render('x', FLOW).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toMatch(/"bad-label" failed in label/);
  });

  it('reports a failing provider as the extension that failed', async () => {
    const broken: ExtensionPlugin = {
      id: 'broken-label',
      label: {
        box: () => {
          throw new Error('boom');
        },
      },
    };
    const { m, ready } = api(broken);
    await ready;
    const e = await m.render('x', FLOW).catch((x: unknown) => x);
    expect((e as MermaidError).message).toBe('Extension "broken-label" failed in label: boom');
  });

  it('needs a box() function', async () => {
    const { ready } = api({ id: 'no-box', label: {} as never });
    await expect(ready).rejects.toThrow(/"no-box": label needs a box\(\) function/);
  });

  it('says whether the render is deterministic', async () => {
    const asked: Asked[] = [];
    const m = createMermaid();
    await m.registerExternalDiagrams([boxer('whole', asked, () => false)]);
    await m.render('x', FLOW);
    expect(asked[0]!.deterministic).toBeUndefined();
  });

  it('says what each flowchart label names: a node, an edge or a group (D699)', async () => {
    const asked: Asked[] = [];
    const { m, ready } = api(boxer('whole', asked, () => false));
    await ready;
    await m.render(
      'x',
      'flowchart LR\n  subgraph G["Group"]\n    A["Alpha"]\n  end\n  A -->|goes| B'
    );
    const roleOf = (raw: string) => asked.find((a) => a.raw === raw)?.request.role;
    expect(roleOf('Alpha')).toBe('node');
    expect(roleOf('goes')).toBe('edge');
    expect(roleOf('Group')).toBe('group');
  });

  it('gets no role from a diagram that sets none', async () => {
    const asked: Asked[] = [];
    const { m, ready } = api(boxer('whole', asked, () => false));
    await ready;
    await m.render('x', 'pie\n  title Pets\n  "Dogs" : 3');
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((a) => a.request.role === undefined)).toBe(true);
  });
});

describe("a whole-label provider and the label's inline spans (D698)", () => {
  /** A stand-in math extension: every `$$…$$` span is a 10 px frame. */
  const math = (sources: string[] = []): ExtensionPlugin => ({
    id: 'fixture-math',
    inline: [{ open: '$$', close: '$$', box: (source) => (sources.push(source), frame(10)) }],
  });
  /** A provider that asks for the inline spans of every label, notes them and boxes the label. */
  const composing = (
    seen: (ReturnType<LabelRequest['inline']> | undefined)[]
  ): ExtensionPlugin => ({
    id: 'composing',
    label: {
      box(raw, request) {
        const spans = request.inline(raw);
        seen.push(spans);
        // The label's box, with each span's box drawn inside it.
        const whole = frame(300);
        return {
          ...whole,
          node: { ...whole.node, children: (spans?.boxes ?? []).map((b) => b.node) },
        };
      },
    },
  });
  const MATH = 'flowchart LR\n  A["From $$x$$ to $$y$$"]';

  it('boxes the spans as label layout does: a placeholder each, and the boxes in order', async () => {
    const seen: (ReturnType<LabelRequest['inline']> | undefined)[] = [];
    const sources: string[] = [];
    const { m, ready } = api(math(sources), composing(seen));
    await ready;
    const r = await m.render('x', MATH);
    expect(sources).toEqual(['x', 'y']);
    const spans = seen.find((s) => s !== undefined)!;
    expect(spans.source).toBe('From \ufdd0 to \ufdd1');
    expect(spans.boxes.map((b) => [b.text, b.width])).toEqual([
      ['$$x$$', 10],
      ['$$y$$', 10],
    ]);
    // The whole label is one box, and the two span boxes are drawn inside it.
    expect(frames(r.svg)).toBe(3);
    expect(r.warnings).toEqual([]);
    assertInert(r.svg);
  });

  it('gives undefined for a label without a span a provider boxes', async () => {
    const seen: (ReturnType<LabelRequest['inline']> | undefined)[] = [];
    const { m, ready } = api(math(), composing(seen));
    await ready;
    await m.render('x', 'flowchart LR\n  A["Plain"]');
    expect(seen).not.toHaveLength(0);
    expect(seen.every((s) => s === undefined)).toBe(true);
  });

  it('warns as label layout does for a span no provider draws, once per render', async () => {
    const seen: (ReturnType<LabelRequest['inline']> | undefined)[] = [];
    const { m, ready } = api(composing(seen));
    await ready;
    const r = await m.render('x', `${MATH}\n  B["fa:fa-car and $$z$$"]`);
    expect(seen.every((s) => s === undefined)).toBe(true);
    expect(r.warnings.map((w) => w.code).sort()).toEqual([
      'ICON_NOT_RENDERED',
      'MATH_NOT_RENDERED',
    ]);
  });

  it('is silent about math for a provider that does not ask: that provider answers for it', async () => {
    const { m, ready } = api(boxer('whole', []));
    await ready;
    expect((await m.render('x', MATH)).warnings).toEqual([]);
  });

  it('checks the span boxes against the allow-list before the provider sees them', async () => {
    const bad: ExtensionPlugin = {
      id: 'bad-math',
      inline: [
        {
          open: '$$',
          close: '$$',
          box: () => ({ width: 1, height: 1, baseline: 1, node: { tag: 'script' } }) as never,
        },
      ],
    };
    const { m, ready } = api(bad, composing([]));
    await ready;
    const e = await m.render('x', MATH).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toMatch(/"bad-math" failed in inline/);
  });
});
