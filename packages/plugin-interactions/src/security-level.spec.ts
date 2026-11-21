/**
 * Callbacks need `securityLevel: 'loose'` (#697, D554, amends D74), as in mermaid\@12, whose
 * `setClickFun` (flowchart, class and gantt alike) returned early unless the level was `loose`.
 * Through the public seam: `createMermaid().render()` with `bindFunctions(el)` on a fake DOM.
 * Links and tooltips are the renderer's and do not depend on the plugin or on `loose`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { interactions } from './index.ts';
import { mounted } from './testing/fake-dom.ts';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.cb;
});

type Config = Parameters<ReturnType<typeof createMermaid>['initialize']>[0];

const NOW = new Date(2024, 0, 3, 12).getTime();

/** Each diagram's callback syntax, with a link and a tooltip beside it. */
const SOURCES: readonly (readonly [string, string])[] = [
  [
    'flowchart',
    'flowchart LR\n  A --> B\n  click A call cb() "tip"\n  click B "https://example.com" "to B"\n',
  ],
  [
    'class',
    'classDiagram\nclass A\nclass B\nclick A call cb() "tip"\nlink B "https://example.com" "to B"\n',
  ],
  ['class `callback`', 'classDiagram\nclass A\nclass B\ncallback A "cb" "tip"\n'],
  [
    'gantt',
    'gantt\ndateFormat YYYY-MM-DD\nsection S\nA :A, 2024-01-01, 1d\nB :B, 2024-01-02, 1d\nclick A call cb()\nclick B href "https://example.com"\n',
  ],
];

/** Renders `text` under `level` (unset when `undefined`), with or without the plugin. */
async function render(text: string, level: string | undefined, plugin = true) {
  const m = createMermaid();
  // Registered, the plugin reads the AST, which turns `data-ast` on: its only mark on the svg.
  const output = plugin ? {} : { output: { dataAst: true } };
  m.initialize({ ...(level === undefined ? {} : { securityLevel: level }), ...output } as Config);
  if (plugin) await m.registerExternalDiagrams([interactions]);
  return m.render('d', text, { now: NOW });
}

/** Binds `result`, clicks every element of the svg and returns what `cb` was called with. */
function clickAll(result: { svg: string; bindFunctions?: (el: Element) => void }) {
  const calls: unknown[][] = [];
  g.cb = (...args: unknown[]) => calls.push(args);
  const dom = mounted(result.svg);
  result.bindFunctions?.(dom.el);
  const all = dom.root.all();
  for (const e of all) e.click();
  return { calls, listeners: all.reduce((n, e) => n + e.clicks, 0) };
}

const ignored = (result: { warnings: readonly { code: string; message: string }[] }) =>
  result.warnings.filter((w) => w.code === 'CALLBACK_IGNORED');

describe.each(SOURCES)('%s callbacks and securityLevel (#697)', (_name, text) => {
  it.each([undefined, 'default', 'strict', 'antiscript', 'sandbox'])(
    'does not bind or call under %s, and warns once',
    async (level) => {
      const result = await render(text, level);
      const { calls, listeners } = clickAll(result);
      expect(calls).toEqual([]);
      expect(listeners).toBe(0);
      const warnings = ignored(result);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.message).toContain("securityLevel: 'loose'");
    }
  );

  it('binds and calls under loose, without CALLBACK_IGNORED', async () => {
    const result = await render(text, 'loose');
    const { calls } = clickAll(result);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.length === 1 && c[0] === 'A')).toBe(true);
    expect(ignored(result)).toEqual([]);
  });

  it('draws the same svg (links and tooltips included) with and without the plugin, at every level', async () => {
    for (const level of [undefined, 'strict', 'antiscript', 'sandbox', 'loose']) {
      const withPlugin = await render(text, level);
      const without = await render(text, level, false);
      expect(withPlugin.svg, String(level)).toBe(without.svg);
    }
    const loose = await render(text, 'loose');
    const unset = await render(text, undefined);
    expect(loose.svg).toBe(unset.svg);
  });
});

describe('securityLevel cannot be raised from diagram text (#697)', () => {
  it.each([
    ['front matter', '---\nconfig:\n  securityLevel: loose\n---\n'],
    ['a directive', '%%{init: {"securityLevel": "loose"}}%%\n'],
  ])('%s asking for loose does not run callbacks', async (_name, head) => {
    const result = await render(`${head}flowchart LR\n  A --> B\n  click A call cb()\n`, undefined);
    expect(clickAll(result).calls).toEqual([]);
    expect(ignored(result)).toHaveLength(1);
  });

  it('an embedded diagram takes the level from initialize()', async () => {
    const block = [
      'flowchart LR',
      '  A --> blk',
      '  mermaid blk["Inner"] {',
      '    flowchart LR',
      '      A --> B',
      '      click A call cb()',
      '  }',
    ].join('\n');
    const strict = await render(block, 'strict');
    expect(clickAll(strict).calls).toEqual([]);
    expect(ignored(strict)).toHaveLength(1);
    expect(clickAll(await render(block, 'loose')).calls).toEqual([['A']]);
  });
});
