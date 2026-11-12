/**
 * `click` callbacks inside embedded diagram blocks (ADR-15, #669): bound by the render's
 * `bindFunctions`, each block within its own nested `<svg>`, so a node id shared by the host
 * and a block (or two blocks) binds only where its `click` line is.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { interactions } from './index.ts';
import { mounted, type FakeEl } from './testing/fake-dom.ts';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.hostFn;
  delete g.innerFn;
  delete g.otherFn;
});

/** Records each call of the global functions `names` as `[name, ...args]`. */
function spies(...names: string[]): unknown[][] {
  const calls: unknown[][] = [];
  for (const n of names) g[n] = (...args: unknown[]) => calls.push([n, ...args]);
  return calls;
}

/** The `g.node` groups for `id`, in document order (host first, then each block's). */
function nodes(root: FakeEl, id: string): FakeEl[] {
  return root
    .all()
    .filter(
      (e) =>
        e.tagName === 'g' &&
        e.getAttribute('data-id') === id &&
        (e.getAttribute('class') ?? '').split(' ').includes('node')
    );
}

/** The svg element enclosing `el`. */
function svgOf(el: FakeEl): FakeEl {
  let p = el.parentElement;
  while (p && p.tagName !== 'svg') p = p.parentElement;
  return p!;
}

const BLOCK = [
  'flowchart LR',
  '  A --> blk',
  '  mermaid blk["Inner"] {',
  '    flowchart LR',
  '      A --> B',
  '      click A innerFn',
  '  }',
].join('\n');

describe('click callbacks inside a block (#669)', () => {
  it('without the plugin, the block callback is ignored with CALLBACK_IGNORED', async () => {
    const result = await createMermaid().render('d', BLOCK);
    expect(result.warnings.map((w) => w.code)).toContain('CALLBACK_IGNORED');
    expect(result.bindFunctions).toBeUndefined();
  });

  it('with the plugin, binds the block callback to the inner node only', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', BLOCK);
    expect(result.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
    expect(result.bindFunctions).toBeTypeOf('function');
    const calls = spies('innerFn');
    const { el, root } = mounted(result.svg);
    result.bindFunctions!(el);
    const [hostA, innerA] = nodes(root, 'A');
    expect(svgOf(innerA!)).not.toBe(svgOf(hostA!));
    hostA!.click();
    expect(calls).toEqual([]);
    innerA!.click();
    expect(calls).toEqual([['innerFn', 'A']]);
  });

  it('keeps a host callback off a block node with the same id', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', `${BLOCK}\n  click A hostFn`);
    const calls = spies('hostFn', 'innerFn');
    const { el, root } = mounted(result.svg);
    result.bindFunctions!(el);
    const [hostA, innerA] = nodes(root, 'A');
    hostA!.click();
    innerA!.click();
    expect(calls).toEqual([
      ['hostFn', 'A'],
      ['innerFn', 'A'],
    ]);
  });

  it('binds each of two blocks, and a block nested in a block, in its own svg', async () => {
    const text = [
      'flowchart LR',
      '  mermaid one {',
      '    flowchart LR',
      '      A --> B',
      '      click A innerFn',
      '  }',
      '  mermaid two {',
      '    flowchart LR',
      '      A --> deep',
      '      mermaid deep {',
      '        flowchart LR',
      '          A --> C',
      '          click A otherFn',
      '      }',
      '  }',
      '  one --> two',
    ].join('\n');
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', text);
    const calls = spies('innerFn', 'otherFn');
    const { el, root } = mounted(result.svg);
    result.bindFunctions!(el);
    const all = nodes(root, 'A');
    expect(all).toHaveLength(3);
    for (const n of all) n.click();
    expect(calls).toEqual([
      ['innerFn', 'A'],
      ['otherFn', 'A'],
    ]);
  });

  it('binds once however often bindFunctions is called', async () => {
    const m = createMermaid();
    m.initialize({ securityLevel: 'loose' });
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', BLOCK);
    const calls = spies('innerFn');
    const { el, root } = mounted(result.svg);
    result.bindFunctions!(el);
    result.bindFunctions!(el);
    nodes(root, 'A')[1]!.click();
    expect(calls).toHaveLength(1);
  });
});
