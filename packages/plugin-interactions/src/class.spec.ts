/**
 * Class diagram interactions (#158, D105) through the public seam: `createMermaid().render()`
 * with `bindFunctions(el)`, and `mount()`, on a fake DOM (R-ARCH-1). Class `callback` and
 * `click … call` reach the plugin as `AstCallback`s, the same field flowchart's do; links and
 * tooltips are drawn by the class renderer (`<a href target>`, `<title>`), as flowchart's.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS } from '@mermaid-js/core/svg/testing';
import { createMermaid } from 'mermaid';
import { interactions } from './index.ts';
import { FakeDoc, mounted, type FakeEl } from './testing/fake-dom.ts';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.cb;
  delete g.app;
});

async function mermaid(config?: Parameters<ReturnType<typeof createMermaid>['initialize']>[0]) {
  const m = createMermaid();
  m.initialize({ securityLevel: 'loose', ...config });
  await m.registerExternalDiagrams([interactions]);
  return m;
}

const hasClass = (e: FakeEl, c: string) => (e.getAttribute('class') ?? '').split(' ').includes(c);

/** Every element of the mounted svg with a click listener, as `data-id` (class) pairs. */
function clickable(root: FakeEl): string[] {
  return root
    .all()
    .filter((e) => e.clicks > 0)
    .map((e) => `${e.getAttribute('data-id')} (${e.getAttribute('class')}) x${e.clicks}`);
}

/** The class box of `id`: its `g.node[data-id]` whose `data-ast` is the class (`n:`). */
function box(root: FakeEl, id: string): FakeEl {
  return root
    .all()
    .find(
      (e) =>
        e.tagName === 'g' &&
        hasClass(e, 'node') &&
        e.getAttribute('data-id') === id &&
        (e.getAttribute('data-ast') ?? '').startsWith('n:')
    )!;
}

const CLASSES = `classDiagram
namespace Shop {
  class Cart~T~ {
    +List~T~ items
    +add(T item)
  }
}
class \`Line item\`
Cart <|-- \`Line item\`
Cart ()-- Order
note for Cart "a note"
`;

describe('class interactions (#158, D105)', () => {
  it('without the plugin, class callbacks are ignored with CALLBACK_IGNORED', async () => {
    const result = await createMermaid().render('d', `${CLASSES}callback Cart "cb"\n`);
    expect(result.warnings.map((w) => w.code)).toContain('CALLBACK_IGNORED');
    expect(result.bindFunctions).toBeUndefined();
  });

  it('binds `callback` once per class box, with the class id as the argument', async () => {
    const m = await mermaid();
    const result = await m.render(
      'd',
      `${CLASSES}callback Cart "cb" "Open the cart"\ncallback \`Line item\` "cb"\n`
    );
    expect(result.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
    const calls: unknown[][] = [];
    g.cb = (...args: unknown[]) => calls.push(args);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    // Only the class boxes: not members, the namespace, relations, the note or the interface.
    expect(clickable(dom.root)).toEqual([
      'Cart (node default clickable) x1',
      'Line item (node default clickable) x1',
    ]);
    box(dom.root, 'Cart').click();
    box(dom.root, 'Line item').click();
    expect(calls).toEqual([['Cart'], ['Line item']]);
    // The tooltip is the renderer's SVG <title> (v12 drew an HTML hover div).
    expect(result.svg).toContain('<title>Open the cart</title>');
  });

  it('passes `click … call fn(…)` arguments as v12 classDb.setClickFunc did', async () => {
    const m = await mermaid();
    const result = await m.render(
      'd',
      'classDiagram\nclass A\nclass B\nclick A call app.handlers.go("x, y", 2, "q") "tip"\nclick B call app.handlers.go()\n'
    );
    const calls: unknown[][] = [];
    g.app = { handlers: { go: (...args: unknown[]) => calls.push(args) } };
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    box(dom.root, 'A').click();
    box(dom.root, 'B').click();
    expect(calls).toEqual([['x, y', '2', 'q'], ['B']]);
  });

  it('binds once however often bindFunctions runs, and ignores missing functions', async () => {
    const m = await mermaid();
    const text = 'classDiagram\nclass A\nclass B\ncallback A "cb"\ncallback B "nowhere.fn"\n';
    const result = await m.render('d', text);
    const again = await m.render('d', text);
    let n = 0;
    g.cb = () => n++;
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    result.bindFunctions!(dom.el);
    again.bindFunctions!(dom.el);
    box(dom.root, 'A').click();
    expect(n).toBe(1);
    expect(() => box(dom.root, 'B').click()).not.toThrow();
  });

  it('does not bind a note or an interface whose drawn id equals the class name', async () => {
    // v12 bound on the class's DOM id; v13's `data-id` is the name, and notes and lollipop
    // interfaces are `note<k>` / `interface<k>`, so a class may share it.
    const m = await mermaid();
    const result = await m.render(
      'd',
      'classDiagram\nclass note0\nclass interface0\nA ()-- B\nnote for A "n"\ncallback note0 "cb"\ncallback interface0 "cb"\n'
    );
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(clickable(dom.root)).toEqual([
      'note0 (node default clickable) x1',
      'interface0 (node default clickable) x1',
    ]);
  });

  it('binds a class whose name has characters the AST id escapes (`#`, `@`)', async () => {
    // `data-id` is `B#2`, `data-ast` is `n:B%232`: the plugin compares the escaped forms.
    const m = await mermaid();
    const result = await m.render(
      'd',
      'classDiagram\nclass `B#2`\nclass `C@x`\nclick `B#2` call cb()\nclick `C@x` call cb()\n'
    );
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(clickable(dom.root)).toEqual([
      'B#2 (node default clickable) x1',
      'C@x (node default clickable) x1',
    ]);
  });

  it('does not bind a callback on a class that does not exist (v12 dropped it)', async () => {
    const m = await mermaid();
    const result = await m.render(
      'd',
      'classDiagram\nA ()-- B\nnote for A "n"\ncallback note0 "cb"\n'
    );
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(clickable(dom.root)).toEqual([]);
  });

  it('mount() binds on every render and replaces changed callbacks', async () => {
    const m = await mermaid();
    const calls: string[] = [];
    g.cb = (id: string) => calls.push(`cb ${id}`);
    g.app = { other: (id: string) => calls.push(`other ${id}`) };
    const el = new FakeDoc().createElement('div');
    const view = m.mount(el as unknown as HTMLElement, 'classDiagram\nclass A\ncallback A "cb"\n');
    await view.ready;
    box(el, 'A').click();
    await view.update('classDiagram\nclass A\ncallback A "app.other"\n');
    box(el, 'A').click();
    expect(calls).toEqual(['cb A', 'other A']);
    expect(box(el, 'A').clicks).toBe(1);
    view.destroy();
  });
});

describe('class links (#156 renderer, checked as flowchart links)', () => {
  const anchor = (svg: string) => /<a [^>]*>/.exec(svg)?.[0];

  it('opens with the written target, and v12 _blank when none is given', async () => {
    const m = await mermaid();
    const self = await m.render(
      'd',
      'classDiagram\nclass A\nlink A "https://example.com" "tip" _self\n'
    );
    expect(anchor(self.svg)).toBe('<a href="https://example.com" target="_self">');
    expect(self.svg).toContain('<title>tip</title>');
    const blank = await m.render('d', 'classDiagram\nclass A\nclick A href "/docs"\n');
    expect(anchor(blank.svg)).toBe('<a href="/docs" target="_blank" rel="noopener noreferrer">');
  });

  it('rejects unsafe URLs with URL_REFUSED and draws no link', async () => {
    const m = await mermaid();
    for (const url of [
      'javascript:alert(1)',
      'java\tscript:alert(1)',
      '//evil.example',
      'data:text/html,x',
    ]) {
      const r = await m.render('d', `classDiagram\nclass A\nlink A "${url}"\n`);
      expect(anchor(r.svg), url).toBeUndefined();
      expect(
        r.warnings.map((w) => w.code),
        url
      ).toContain('URL_REFUSED');
      assertInert(r.svg);
    }
  });

  it('honours securityLevel strict and linkSchemes as flowchart does', async () => {
    const text =
      'classDiagram\nclass A\nclass B\nclass C\nlink A "https://example.com"\nlink B "./page"\nlink C "tel:123"\n';
    const flow =
      'flowchart LR\nA\nB\nC\nclick A "https://example.com"\nclick B "./page"\nclick C "tel:123"\n';
    const hrefs = (svg: string) => [...svg.matchAll(/<a href="([^"]*)"/g)].map(([, h]) => h);
    for (const config of [{ securityLevel: 'strict' as const }, { linkSchemes: ['tel'] }, {}]) {
      const m = await mermaid(config);
      const cls = hrefs((await m.render('d', text)).svg);
      expect(cls, JSON.stringify(config)).toEqual(hrefs((await m.render('d', flow)).svg));
    }
    const strict = await mermaid({ securityLevel: 'strict' });
    expect(hrefs((await strict.render('d', text)).svg)).toEqual(['./page']);
  });

  it("treats securityLevel 'sandbox' as the default level, as flowchart does (D48)", async () => {
    // v12 forced linkTarget `_top` under sandbox; v13 has no sandbox mode (MIGRATION).
    const m = await mermaid({ securityLevel: 'sandbox' } as never);
    const r = await m.render('d', 'classDiagram\nclass A\nlink A "https://example.com" _self\n');
    expect(r.warnings.map((w) => w.code)).toContain('SECURITY_LEVEL');
    expect(anchor(r.svg)).toBe('<a href="https://example.com" target="_self">');
    const f = await m.render('d', 'flowchart LR\nA\nclick A "https://example.com" _self\n');
    expect(anchor(f.svg)).toBe('<a href="https://example.com" target="_self">');
  });

  it('leaves the svg unchanged and inside the allow-list (R-SEC-2)', async () => {
    const plain = createMermaid();
    const m = await mermaid();
    let rendered = 0;
    for (const p of PAYLOADS) {
      for (const source of [
        `classDiagram\nclass A\ncallback A "${p}" "${p}"\n`,
        `classDiagram\nclass A\nclick A call fn(${p})\n`,
        `classDiagram\nclass A\nlink A "${p}" "${p}"\n`,
      ]) {
        const without = await plain.render('d', source).catch(() => undefined);
        const withPlugin = await m.render('d', source).catch(() => undefined);
        expect(withPlugin === undefined, source).toBe(without === undefined);
        if (withPlugin === undefined || without === undefined) continue;
        rendered++;
        assertInert(withPlugin.svg);
        expect(withPlugin.svg, source).toBe(without.svg);
      }
    }
    expect(rendered).toBeGreaterThan(PAYLOADS.length);
  });
});
