import { flowchart } from '@mermaid-js/diagram-flowchart';
import {
  assertInert,
  type Attrs,
  type OutlineSink,
  type StyleText,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { outlineFixture, outliningEveryLeaf } from '@mermaid-js/core/svg/testing';
import { describe, expect, it } from 'vitest';
import { createMermaid as createFull } from './index.ts';
import {
  createMermaid,
  MermaidError,
  type DiagramPlugin,
  type ExtensionPlugin,
  type HookContext,
} from './slim.ts';

/** Flowchart, drawing every shape through `w.outline` (what T1 makes it do for real). */
const adopted: DiagramPlugin<unknown, unknown> = {
  ...(flowchart as DiagramPlugin<unknown, unknown>),
  render: (model, layout, ctx, w) =>
    flowchart.render(model as never, layout as never, ctx, outliningEveryLeaf(w)),
};

const FLOW = 'flowchart LR\n  A[Start] --> B((Mid)) --> C{End}\n';

async function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid({ diagrams: [adopted] });
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams(extensions);
  await m.prepare(FLOW);
  return m;
}

const render = async (...extensions: ExtensionPlugin[]): Promise<string> =>
  (await api(...extensions)).renderSync(FLOW, { id: 's' }).svg;

/** A no-op `postRender`, so the render writes into the tree backing. */
const tree: ExtensionPlugin = { id: 'tree', postRender: () => {} };

/** A drawer that writes `body` for the first outline and returns `result`. */
function drawer(body: (sink: OutlineSink) => unknown, active: () => boolean = () => true) {
  return {
    active,
    draw: (_r: unknown, _t: unknown, _a: Attrs, sink: OutlineSink) => body(sink) as boolean,
  };
}

async function failure(...extensions: ExtensionPlugin[]): Promise<MermaidError> {
  try {
    await render(...extensions);
  } catch (e) {
    expect(e).toBeInstanceOf(MermaidError);
    return e as MermaidError;
  }
  throw new Error('expected the render to fail');
}

describe('the outline hook through render (D302)', () => {
  it("draws each outline with the registered extension's drawer, inside the allow-list", async () => {
    const shapes = (await render()).match(/<(rect|circle|ellipse|polygon|line|path)\b/g) ?? [];
    expect(shapes.length).toBeGreaterThanOrEqual(3);
    for (const svg of [
      await render({ id: 'fixture-outline', outline: outlineFixture }),
      await render({ id: 'fixture-outline', outline: outlineFixture }, tree),
    ]) {
      // Flowchart's own roles (#340), or `node` for the leaves the proxy outlines.
      expect(svg.match(/<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g)).toHaveLength(
        shapes.length
      );
      expect(svg).not.toMatch(/<(rect|circle|ellipse|polygon|line)\b/);
      assertInert(svg);
    }
  });

  it('changes nothing when the drawer is not active, in either backing', async () => {
    const plain = await render();
    const off = {
      id: 'off',
      outline: drawer(
        () => true,
        () => false
      ),
    };
    expect(await render(off)).toBe(plain);
    expect(await render(off, tree)).toBe(plain);
    expect(await render(tree)).toBe(plain);
  });

  it('writes the plain leaf when draw returns false', async () => {
    const plain = await render();
    const no = { id: 'no', outline: drawer(() => false) };
    expect(await render(no)).toBe(plain);
    expect(await render(no, tree)).toBe(plain);
  });

  it('asks active once per SVG render, with the hook context, and never for text', async () => {
    const asked: HookContext[] = [];
    let drawn = 0;
    const counting: ExtensionPlugin = {
      id: 'counting',
      outline: {
        active: (ctx) => (asked.push(ctx), true),
        draw: () => (drawn++, false),
      },
    };
    const m = await api(counting);
    m.renderSync(FLOW, { id: 's' });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.diagram).toBe('flowchart');
    expect(drawn).toBeGreaterThanOrEqual(3);
    m.renderSync(FLOW, { id: 's' });
    expect(asked).toHaveLength(2);

    const full = createFull();
    await full.registerExternalDiagrams([counting]);
    await full.render('t', FLOW, { format: 'ascii' });
    expect(asked).toHaveLength(2);
  });

  it('uses the first registered drawer only', async () => {
    const second: string[] = [];
    const later = {
      id: 'later',
      outline: drawer(
        () => (second.push('draw'), false),
        () => (second.push('active'), true)
      ),
    };
    const first = await render({ id: 'first', outline: outlineFixture }, later);
    expect(first).toContain('<g class="outline-node">');
    expect(
      await render(
        {
          id: 'off',
          outline: drawer(
            () => true,
            () => false
          ),
        },
        later
      )
    ).toBe(await render());
    expect(second).toEqual([]);
  });
});

describe('an outline drawer that breaks the sink rules', () => {
  const cases: [string, (sink: OutlineSink) => unknown, RegExp][] = [
    ['opens a <rect>', (s) => s.open('rect' as 'g'), /opens <g> only, not <rect>/],
    ['writes a <rect> leaf', (s) => s.leaf('rect' as 'path'), /<path> leaves only, not <rect>/],
    [
      'writes an on* attribute',
      (s) => s.leaf('path', { onclick: 'x' } as Attrs),
      /onclick is not an allowed SVG attribute/,
    ],
    ['leaves a <g> open', (s) => (s.open('g'), true), /returned with 1 <g> still open/],
    ['closes what it did not open', (s) => (s.close(), true), /close\(\) without its open\(\)/],
    [
      'returns something other than a boolean',
      () => undefined,
      /draw\(\) must return a boolean, got undefined/,
    ],
    [
      'throws',
      () => {
        throw new Error('boom');
      },
      /boom/,
    ],
  ];
  for (const [what, body, why] of cases)
    it(`${what}: INTERNAL, naming the extension`, async () => {
      for (const extra of [[], [tree]]) {
        const e = await failure({ id: 'bad', outline: drawer(body) }, ...extra);
        expect(e.code).toBe('INTERNAL');
        expect(e.message).toMatch(/Extension "bad" failed in outline: /);
        expect(e.message).toMatch(why);
      }
    });

  it('a throwing active: INTERNAL, naming the extension', async () => {
    const e = await failure({
      id: 'bad',
      outline: drawer(
        () => true,
        () => {
          throw new Error('no config');
        }
      ),
    });
    expect(e.code).toBe('INTERNAL');
    expect(e.message).toBe('Extension "bad" failed in outline: no config');
  });

  it('a sink used after its draw returned: INTERNAL', async () => {
    let kept: OutlineSink | undefined;
    const e = await failure({
      id: 'bad',
      outline: drawer((s) => {
        if (kept) kept.leaf('path', {});
        kept = s;
        return false;
      }),
    });
    expect(e.message).toMatch(/Extension "bad" failed in outline: .*after its draw\(\) returned/);
  });

  it('an unsafe attribute value: INTERNAL from the allow-list re-check', async () => {
    const style = 'fill:url(javascript:alert(1))' as StyleText;
    const e = await failure({
      id: 'bad',
      outline: drawer((s) => (s.leaf('path', { style }), true)),
    });
    expect(e.code).toBe('INTERNAL');
    expect(e.message).toMatch(/^Extension "bad"'s outline output fails the allow-list: /);
  });

  it('re-checks only a render the drawer wrote in, so a type that never outlines is not blamed', async () => {
    // A type that writes its outlines as plain leaves (as sequence does), with a style value
    // only the re-check rejects: the writer passes it, as for every type without a drawer.
    const style = 'fill:url(javascript:alert(1))' as StyleText;
    const plainLeaves = (w: SvgWriter): SvgWriter => ({
      open: (tag, attrs) => w.open(tag, attrs),
      close: () => w.close(),
      leaf: (tag, attrs) => w.leaf(tag, attrs),
      outline: (_r, tag, attrs) => w.leaf(tag, { ...attrs, style }),
      text: (content) => w.text(content),
      label: (box, x, y, attrs) => w.label(box, x, y, attrs),
      path: () => w.path(),
      styleSheet: (css) => w.styleSheet(css),
    });
    const unoutlined: DiagramPlugin<unknown, unknown> = {
      ...(flowchart as DiagramPlugin<unknown, unknown>),
      render: (model, layout, ctx, w) =>
        flowchart.render(model as never, layout as never, ctx, plainLeaves(w)),
    };
    const svg = async (...extensions: ExtensionPlugin[]): Promise<string> => {
      const m = createMermaid({ diagrams: [unoutlined] });
      m.initialize({ deterministic: true });
      await m.registerExternalDiagrams(extensions);
      await m.prepare(FLOW);
      return m.renderSync(FLOW, { id: 's' }).svg;
    };
    const idle = { id: 'idle', outline: drawer(() => true) };
    expect(await svg(idle)).toBe(await svg());
  });

  it('a malformed drawer is refused at registration', async () => {
    const m = createMermaid({ diagrams: [adopted] });
    const bad = { id: 'bad', outline: { draw: () => true } } as unknown as ExtensionPlugin;
    await expect(m.registerExternalDiagrams([bad])).rejects.toThrow(
      'Extension "bad": outline needs active() and draw()'
    );
  });
});
