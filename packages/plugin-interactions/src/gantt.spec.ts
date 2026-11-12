/**
 * Gantt interactions (spec #293 I1, D47) through the public seam: `createMermaid().render()`
 * with `bindFunctions(el)` on a fake DOM (R-ARCH-1). Gantt's `click … call` reaches the plugin
 * as an `AstCallback`, as class's does (#158). v12 bound each callback on the task's bar
 * (`<id>`) and on its label (`<id>-text`); v13's bar and label are the task's `clickable`
 * elements with its `data-id`. Links are the renderer's `<a href>` (#381).
 *
 * Expected arguments are mermaid\@12's: `ganttDb.setClickFun` run under `securityLevel: loose`
 * with its `bindFunctions` fired on a stub document (the conformance oracle, 12.2).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS } from '@mermaid-js/core/svg/testing';
import { createMermaid } from 'mermaid';
import { interactions } from './index.ts';
import { mounted, type FakeEl } from './testing/fake-dom.ts';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.cb;
  delete g.app;
});

const NOW = new Date(2024, 0, 3, 12).getTime();
const HEAD =
  'gantt\ndateFormat YYYY-MM-DD\nsection S\nA :a, 2024-01-01, 1d\nB :b, 2024-01-02, 1d\n';

/** A mermaid (gantt from its registry entry, #385) with, unless `bare`, the plugin. */
async function mermaid(bare = false) {
  const m = createMermaid();
  m.initialize({ securityLevel: 'loose' });
  if (!bare) await m.registerExternalDiagrams([interactions]);
  return m;
}

const render = async (clicks: string, bare = false) =>
  (await mermaid(bare)).render('d', HEAD + clicks, { now: NOW });

/** Every element of the mounted svg with a click listener: `tag data-id x<listeners>`. */
function clickable(root: FakeEl): string[] {
  return root
    .all()
    .filter((e) => e.clicks > 0)
    .map((e) => `${e.tagName} ${e.getAttribute('data-id')} x${e.clicks}`);
}

/** The task `id`'s bar (`rect` with `data-ast`) and label (`text`, `data-id` only). */
function parts(root: FakeEl, id: string): { bar: FakeEl; label: FakeEl } {
  const all = root.all().filter((e) => e.getAttribute('data-id') === id);
  return {
    bar: all.find((e) => e.tagName === 'rect' && e.getAttribute('data-ast') !== null)!,
    label: all.find((e) => e.tagName === 'text' && e.getAttribute('data-ast') === null)!,
  };
}

/** Binds `result` in a fake DOM and records what `cb` (or `app.handlers.go`) is called with. */
function bound(result: { svg: string; bindFunctions?: (el: Element) => void }) {
  const calls: unknown[][] = [];
  g.cb = (...args: unknown[]) => calls.push(args);
  g.app = { handlers: { go: (...args: unknown[]) => calls.push(['go', ...args]) } };
  const dom = mounted(result.svg);
  result.bindFunctions!(dom.el);
  return { root: dom.root, el: dom.el, calls };
}

describe('gantt interactions (#293 I1, D47)', () => {
  it('binds the bar and the label once each, with the task id as the default argument', async () => {
    const result = await render('click a call cb()\n');
    expect(result.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
    const { root, calls } = bound(result);
    expect(clickable(root)).toEqual(['rect a x1', 'text a x1']);
    const { bar, label } = parts(root, 'a');
    bar.click();
    label.click();
    expect(calls).toEqual([['a'], ['a']]);
  });

  // Each row: the `call` as written and the arguments mermaid@12 passed (oracle, see header).
  it.each([
    ['cb()', ['a']],
    ['cb( )', ['a']],
    ['cb("x, y", 2, "q")', ['x, y', '2', 'q']],
    ['cb( "a" , b )', ['a', 'b']],
    ['cb(a,,b)', ['a', '', 'b']],
    ['cb(,)', ['', '']],
    ['cb("")', ['']],
    ['cb(")', ['']],
    ['cb("a"b")', ['a"b']],
    ['cb(a "b,c" d)', ['a "b,c" d']],
    ["cb('a, b')", ["'a", "b'"]],
  ])('passes `call %s` the arguments v12 passed', async (call, args) => {
    const { root, calls } = bound(await render(`click a call ${call}\n`));
    parts(root, 'a').bar.click();
    expect(calls).toEqual([args]);
  });

  it('looks a dotted name up on window, as v12 runFunc did', async () => {
    const { root, calls } = bound(await render('click a call app.handlers.go(1)\n'));
    parts(root, 'a').label.click();
    expect(calls).toEqual([['go', '1']]);
  });

  it('binds every id of `click a,b`, each with its own id by default; unknown ids bind nothing', async () => {
    const { root, calls } = bound(await render('click a,b,zz call cb()\n'));
    expect(clickable(root)).toEqual(['rect a x1', 'rect b x1', 'text a x1', 'text b x1']);
    parts(root, 'b').bar.click();
    parts(root, 'a').label.click();
    expect(calls).toEqual([['b'], ['a']]);
  });

  it('binds a task defined after the `click` to nothing (v12 looked the id up at parse time)', async () => {
    const result = await render('click c call cb()\nC :c, 2024-01-03, 1d\n');
    expect(clickable(bound(result).root)).toEqual([]);
  });

  it('binds a vert marker and its label, and not a section title named like a task', async () => {
    const result = await render(
      'section a\nC :c, 2024-01-03, 1d\nV :vert, v, 2024-01-02, 0d\nclick a,v call cb()\n'
    );
    const { root, calls } = bound(result);
    expect(clickable(root)).toEqual(['rect a x1', 'rect v x1', 'text a x1', 'text v x1']);
    const title = root
      .all()
      .find((e) => e.getAttribute('data-id') === 'a' && e.getAttribute('data-ast') === 's:a')!;
    title.click();
    expect(calls).toEqual([]);
  });

  it('binds once however often bindFunctions runs', async () => {
    const result = await render('click a call cb()\n');
    const { root, el, calls } = bound(result);
    result.bindFunctions!(el);
    result.bindFunctions!(el);
    parts(root, 'a').bar.click();
    expect(calls).toEqual([['a']]);
  });
});

describe('gantt links and callbacks together (#381 renderer)', () => {
  const anchors = (svg: string) => [...svg.matchAll(/<a [^>]*>/g)].map(([a]) => a);

  it('draws the link and binds the callback on one task, in either order', async () => {
    for (const click of [
      'click a href "https://example.com" call cb(1)\n',
      'click a call cb(1) href "https://example.com"\n',
    ]) {
      const result = await render(click);
      expect(anchors(result.svg), click).toEqual(['<a href="https://example.com">']);
      const { root, calls } = bound(result);
      expect(clickable(root), click).toEqual(['rect a x1', 'text a x1']);
      parts(root, 'a').bar.click();
      parts(root, 'a').label.click();
      expect(calls, click).toEqual([['1'], ['1']]);
    }
  });

  it('rejects unsafe URLs with URL_REFUSED and still binds the callback', async () => {
    for (const url of [
      'javascript:alert(1)',
      'java\tscript:alert(1)',
      '//evil.example',
      'data:text/html,x',
    ]) {
      const result = await render(`click a href "${url}" call cb()\n`);
      expect(anchors(result.svg), url).toEqual([]);
      expect(
        result.warnings.map((w) => w.code),
        url
      ).toContain('URL_REFUSED');
      assertInert(result.svg);
      const { root, calls } = bound(result);
      parts(root, 'a').bar.click();
      expect(calls, url).toEqual([['a']]);
    }
  });
});

describe('gantt without the interactions plugin (D226)', () => {
  it('warns CALLBACK_IGNORED once and draws the same svg', async () => {
    const clicks = 'click a call cb()\nclick b call cb("x") href "https://example.com"\n';
    const without = await render(clicks, true);
    expect(without.warnings.filter((w) => w.code === 'CALLBACK_IGNORED')).toHaveLength(1);
    expect(without.bindFunctions).toBeUndefined();
    expect((await render(clicks)).svg).toBe(without.svg);
  });

  it('does not warn for a link alone', async () => {
    const result = await render('click a href "https://example.com"\n', true);
    expect(result.warnings.map((w) => w.code)).not.toContain('CALLBACK_IGNORED');
  });

  it('leaves the svg unchanged and inside the allow-list (R-SEC-2)', async () => {
    const plain = await mermaid(true);
    const m = await mermaid();
    let rendered = 0;
    for (const p of PAYLOADS) {
      for (const click of [`click a call fn(${p})`, `click a href "${p}" call cb()`]) {
        const source = `${HEAD}${click}\n`;
        const without = await plain.render('d', source, { now: NOW }).catch(() => undefined);
        const withPlugin = await m.render('d', source, { now: NOW }).catch(() => undefined);
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
