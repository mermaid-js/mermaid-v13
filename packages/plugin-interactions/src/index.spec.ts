import { afterEach, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS, V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import { createMermaid } from 'mermaid';
import { callbackArgs, interactions } from './index.ts';
import { mounted as mountedDom } from './testing/fake-dom.ts';

const CLICK = 'flowchart LR\n  A[Start] --> B(End)\n  click A callback\n';

/** The svg mounted in a fake container (`testing/fake-dom.ts`), with its `g.node` per node id. */
function mounted(svg: string) {
  const dom = mountedDom(svg);
  const node = (id: string) =>
    dom.groups(id).find((e) => (e.getAttribute('class') ?? '').split(' ').includes('node'))!;
  return { el: dom.el, node };
}

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.callback;
  delete g.app;
});

describe('interactions plugin (R-PLUG-9, R-SVG-5, D47)', () => {
  it('without the plugin, callbacks are ignored with CALLBACK_IGNORED and bindFunctions is absent', async () => {
    const m = createMermaid();
    const result = await m.render('d', CLICK);
    expect(result.warnings.map((w) => w.code)).toContain('CALLBACK_IGNORED');
    expect(result.bindFunctions).toBeUndefined();
  });

  it('with the plugin, bindFunctions runs the callback named on window with the node id', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', CLICK);
    expect(result.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
    expect(result.bindFunctions).toBeTypeOf('function');
    const calls: unknown[][] = [];
    g.callback = (...args: unknown[]) => calls.push(args);
    const { el, node } = mounted(result.svg);
    result.bindFunctions!(el);
    node('B').click();
    expect(calls).toEqual([]);
    node('A').click();
    expect(calls).toEqual([['A']]);
  });

  it('passes `call fn(…)` arguments as v12 did: split outside quotes, one quote pair dropped', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render(
      'd',
      'flowchart LR\n  A --> B\n  click A call app.handlers.go("x, y", 2, "q") "tip"\n  click B call app.handlers.go()\n'
    );
    const calls: unknown[][] = [];
    g.app = { handlers: { go: (...args: unknown[]) => calls.push(args) } };
    const { el, node } = mounted(result.svg);
    result.bindFunctions!(el);
    node('A').click();
    node('B').click();
    // `call go()` has no arguments, so v12 passed the node id.
    expect(calls).toEqual([['x, y', '2', 'q'], ['B']]);
  });

  it('binds once however often bindFunctions is called, and ignores missing names', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', `${CLICK}  click B nowhere.fn\n`);
    let n = 0;
    g.callback = () => n++;
    const { el, node } = mounted(result.svg);
    result.bindFunctions!(el);
    result.bindFunctions!(el);
    node('A').click();
    expect(n).toBe(1);
    expect(() => node('B').click()).not.toThrow();
  });

  it('binds once when another render with the same callbacks binds the same svg', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', CLICK);
    const again = await m.render('d', CLICK);
    let n = 0;
    g.callback = () => n++;
    const { el, node } = mounted(result.svg);
    result.bindFunctions!(el);
    again.bindFunctions!(el);
    node('A').click();
    expect(n).toBe(1);
  });

  it('leaves the svg unchanged and inside the allow-list (R-SEC-2)', async () => {
    const plain = createMermaid();
    // Registered, the plugin reads the AST, which turns `data-ast` on: its only mark on the svg.
    plain.initialize({ output: { dataAst: true } });
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const sources = [
      ...V12_XSS_CASES.flatMap((c) => (c.source === undefined ? [] : [c.source])),
      ...PAYLOADS.flatMap((p) => [
        `flowchart LR\n  A --> B\n  click A callback "${p}"\n`,
        `flowchart LR\n  A --> B\n  click A call fn(${p})\n`,
      ]),
    ];
    let rendered = 0;
    for (const source of sources) {
      const without = await plain.render('d', source).catch(() => undefined);
      const withPlugin = await m.render('d', source).catch(() => undefined);
      expect(withPlugin === undefined, source).toBe(without === undefined);
      if (withPlugin === undefined || without === undefined) continue;
      rendered++;
      assertInert(withPlugin.svg);
      expect(withPlugin.svg, source).toBe(without.svg);
    }
    expect(rendered).toBeGreaterThan(sources.length / 2);
  });
});

describe('callbackArgs (v12 FlowDB.setClickFun)', () => {
  it.each([
    ['a,b', ['a', 'b']],
    [' "x, y" , 2 ', ['x, y', '2']],
    ['"a"b", c', ['a"b', 'c']],
    ['"odd, one', ['"odd', 'one']],
    ['"', ['']],
    ['', ['']],
  ])('%j', (args, expected) => {
    expect(callbackArgs('N', args)).toEqual(expected);
  });
  it('defaults to the node id', () => expect(callbackArgs('N', undefined)).toEqual(['N']));
});
