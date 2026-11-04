/**
 * Element menus (R-PLUG-9, D105) through the public seam: `createMermaid().render()` and
 * `bindFunctions(el)`, the DOM adapter's `afterMount` entry point. Tests run in Node with no DOM
 * shim (R-ARCH-1), so the svg is parsed into a small fake element tree. A fixture extension,
 * registered before the plugin, adds `menu` nodes (`AstMenu`) to a flowchart AST, the way a
 * diagram's parser emits them (sequence `link`/`links`/`properties`/`details`).
 */
import { describe, expect, it } from 'vitest';
import { assertInert, checkUrl, type SvgWriter } from '@mermaid-js/core/svg';
import { PAYLOADS } from '@mermaid-js/core/svg/testing';
import type { AstMenu, AstNode } from '@mermaid-js/core/parser-kit';
import { createMermaid, type ExtensionPlugin } from 'mermaid';
import { interactions } from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

class FakeEl {
  readonly attrs = new Map<string, string>();
  readonly children: FakeEl[] = [];
  readonly style: Record<string, string> = {};
  readonly listeners: (() => void)[] = [];
  parentElement: FakeEl | null = null;
  textContent = '';
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDoc
  ) {}
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  appendChild(child: FakeEl): FakeEl {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type: string, fn: () => void): void {
    if (type === 'click') this.listeners.push(fn);
  }
  click(): void {
    this.listeners.forEach((fn) => fn());
  }
  /** Every element at 10,20 to 110,60, moved by its own `left`/`top` (the menu's). */
  getBoundingClientRect() {
    const dx = parseFloat(this.style.left ?? '0') || 0;
    const dy = parseFloat(this.style.top ?? '0') || 0;
    return {
      left: 10 + dx,
      top: 20 + dy,
      right: 110 + dx,
      bottom: 60 + dy,
      width: 100,
      height: 40,
    };
  }
  /** Every descendant, depth first. */
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(selector: string): FakeEl[] {
    expect(selector).toBe('[data-id]');
    return this.all().filter((e) => e.attrs.has('data-id'));
  }
}

class FakeDoc {
  readonly byId = new Map<string, FakeEl>();
  createElement(tag: string): FakeEl {
    return new FakeEl(tag, this);
  }
  getElementById(id: string): FakeEl | null {
    return this.byId.get(id) ?? null;
  }
}

/** The svg parsed into a fake tree under a container `div`, as `el.innerHTML = svg` would. */
function mounted(svg: string, doc = new FakeDoc()) {
  const root = doc.createElement('div');
  let at = root;
  for (const [, close, tag, rest, selfClose] of svg.matchAll(
    /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g
  )) {
    if (close) {
      at = at.parentElement ?? root;
      continue;
    }
    const el = at.appendChild(doc.createElement(tag!));
    for (const [, k, v] of rest!.matchAll(/([^\s=]+)="([^"]*)"/g)) el.setAttribute(k!, v!);
    if (!selfClose) at = el;
  }
  const menus = () => root.children.filter((c) => c.getAttribute('data-menu-for') !== null);
  const links = (menu: FakeEl) =>
    menu
      .all()
      .filter((e) => e.tagName === 'a')
      .map((a) => [a.textContent, a.getAttribute('href')]);
  const anchors = (id: string) =>
    root.all().filter((e) => e.tagName === 'g' && e.getAttribute('data-id') === id);
  return { el: root as unknown as Element, root, doc, menus, links, anchors };
}

/** A fixture extension that adds one menu node per entry to the AST's top level. */
function withMenus(...menus: AstMenu[]): ExtensionPlugin {
  return {
    id: 'menu-fixture',
    postParse(ast: AstNode): AstNode {
      const extra = menus.map((menu, i) => ({
        id: `st:menu${i + 1}`,
        type: 'Link',
        range: { start: 0, end: 0 },
        menu,
      }));
      return { ...ast, children: [...(ast.children ?? []), ...extra] };
    },
  };
}

/**
 * A diagram registered as `sequence` (so `sequence.forceMenus` applies) whose AST carries the
 * given menus on its statements, drawn as #143 draws a participant: the whole participant, then
 * its top and bottom symbol, each a `g[data-id]`, with a lifeline and label inside.
 */
function sequenceLike(...menus: AstMenu[]) {
  return {
    id: 'sequence',
    layoutKind: 'custom' as const,
    detector: (t: string) => t.trimStart().startsWith('menuDiagram'),
    parse: (text: string) => ({
      model: text,
      ast: {
        id: 'doc',
        type: 'Document',
        range: { start: 0, end: text.length },
        children: menus.map((menu, i) => ({
          id: `st:${i + 1}`,
          type: 'Link',
          range: { start: 0, end: 0 },
          participant: menu.target,
          menu,
        })),
      },
      diagnostics: [],
      symbols: [],
      statements: [],
    }),
    render: (_m: unknown, _l: unknown, _c: unknown, w: SvgWriter) => {
      w.open('svg', { viewBox: [0, 0, 100, 100] });
      for (const id of ['P', 'Q']) {
        w.open('g', { class: 'participant', 'data-id': id, 'data-ast': `p:${id}` });
        w.leaf('line', { class: 'actor-line', 'data-id': id });
        for (const position of ['top', 'bottom']) {
          w.open('g', { class: `actor-${position}`, 'data-id': id });
          w.leaf('rect', { width: 10, height: 10 });
          w.open('text', { class: 'actor', 'data-id': id });
          w.text(id);
          w.close();
          w.close();
        }
        w.close();
      }
      w.close();
    },
  };
}

async function render(menus: AstMenu[], text = FLOW, config?: Record<string, unknown>) {
  const m = createMermaid();
  if (config) m.initialize(config);
  await m.registerExternalDiagrams([withMenus(...menus), interactions]);
  return m.render('d', text);
}

describe('element menus (R-PLUG-9, D105)', () => {
  it('binds one hidden menu per element that a click toggles', async () => {
    const result = await render([
      { target: 'A', links: { Docs: 'https://example.com/docs', Repo: '/repo' } },
    ]);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    const [menu, ...rest] = dom.menus();
    expect(rest).toEqual([]);
    expect(menu!.getAttribute('class')).toBe('actorPopupMenu');
    expect(menu!.getAttribute('data-menu-for')).toBe('A');
    expect(dom.links(menu!)).toEqual([
      ['Docs', 'https://example.com/docs'],
      ['Repo', '/repo'],
    ]);
    const a = menu!.all().find((e) => e.tagName === 'a')!;
    expect([a.getAttribute('target'), a.getAttribute('rel')]).toEqual([
      '_blank',
      'noopener noreferrer',
    ]);
    expect(menu!.style.display).toBe('none');
    const [anchor] = dom.anchors('A');
    anchor!.click();
    expect(menu!.style.display).toBe('block');
    anchor!.click();
    expect(menu!.style.display).toBe('none');
    // B has no menu: nothing is bound to it.
    expect(dom.anchors('B')[0]!.listeners).toEqual([]);
  });

  it('binds once however often bindFunctions runs, also from a second render', async () => {
    const menus = [{ target: 'A', links: { Docs: 'https://example.com' } }];
    const result = await render(menus);
    const again = await render(menus);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    result.bindFunctions!(dom.el);
    again.bindFunctions!(dom.el);
    expect(dom.menus()).toHaveLength(1);
    expect(dom.anchors('A')[0]!.listeners).toHaveLength(1);
    // A re-mount draws a new svg: it gets its own menu, once.
    const next = mounted(again.svg);
    again.bindFunctions!(next.el);
    again.bindFunctions!(next.el);
    expect(next.menus()).toHaveLength(1);
  });

  it('refuses unsafe URLs as flowchart links do, with URL_REFUSED', async () => {
    const result = await render([
      {
        target: 'A',
        links: {
          Script: 'javascript:alert(1)',
          Hidden: 'jav&#x09;ascript:alert(1)',
          Data: 'data:text/html,<b>x</b>',
          Net: '//evil.example',
          Number: 1 as unknown as string,
          Ok: 'https://example.com',
        },
      },
      { target: 'B', links: { Bad: 'javascript:alert(1)' } },
    ]);
    expect(result.warnings.filter((w) => w.code === 'URL_REFUSED')).toHaveLength(6);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    // B had no safe link left, so it gets no menu (v12 drew none without links).
    expect(dom.menus().map((m) => [m.getAttribute('data-menu-for'), dom.links(m)])).toEqual([
      ['A', [['Ok', 'https://example.com']]],
    ]);
  });

  it('honours securityLevel strict and integrator linkSchemes', async () => {
    const links = { Web: 'https://example.com', Rel: './page', Tel: 'tel:123' };
    const strict = await render([{ target: 'A', links }], FLOW, { securityLevel: 'strict' });
    const dom = mounted(strict.svg);
    strict.bindFunctions!(dom.el);
    expect(dom.links(dom.menus()[0]!)).toEqual([['Rel', './page']]);
    const tel = await render([{ target: 'A', links }], FLOW, { linkSchemes: ['tel'] });
    const telDom = mounted(tel.svg);
    tel.bindFunctions!(telDom.el);
    expect(telDom.links(telDom.menus()[0]!)).toEqual([
      ['Rel', './page'],
      ['Tel', 'tel:123'],
    ]);
  });

  it('leaves the svg unchanged and inside the allow-list (R-SEC-2)', async () => {
    const plain = createMermaid();
    const fixture = createMermaid();
    for (const payload of PAYLOADS) {
      const menus: AstMenu[] = [
        { target: 'A', links: { [payload]: payload, ok: '/x' }, properties: { class: payload } },
      ];
      await fixture.registerExternalDiagrams([withMenus(...menus)]);
      const m = createMermaid();
      await m.registerExternalDiagrams([withMenus(...menus), interactions]);
      const [without, withFixture, withPlugin] = await Promise.all([
        plain.render('d', FLOW),
        fixture.render('d', FLOW),
        m.render('d', FLOW),
      ]);
      assertInert(withPlugin.svg);
      expect(withPlugin.svg, payload).toBe(without.svg);
      expect(withFixture.svg, payload).toBe(without.svg);
      // Labels are text, never markup; hrefs only what checkUrl allowed.
      const dom = mounted(withPlugin.svg);
      withPlugin.bindFunctions!(dom.el);
      for (const menu of dom.menus()) {
        for (const e of menu.all()) {
          expect(e.tagName, payload).toMatch(/^(div|a)$/);
          const href = e.getAttribute('href');
          if (href !== null) expect(checkUrl(href, {}), payload).toBe(href);
          const cls = e.getAttribute('class') ?? '';
          expect(cls, payload).not.toMatch(/[<>"'=()]/);
        }
      }
    }
  });

  it('merges statements per target in order, with properties.class and details', async () => {
    const doc = new FakeDoc();
    const details = doc.createElement('script');
    details.textContent = JSON.stringify({
      links: { Repo: '/repo2', Wiki: '/wiki', Bad: 'javascript:x' },
      properties: { class: 'fromDetails' },
    });
    doc.byId.set('menu-json', details);
    const result = await render([
      { target: 'A', links: { Repo: '/repo', Docs: '/docs' } },
      { target: 'A', properties: { class: 'one two"><x' } },
      { target: 'A', links: { Docs: '/docs2' } },
      { target: 'A', details: 'menu-json' },
      { target: 'A', details: 'missing' },
    ]);
    const dom = mounted(result.svg, doc);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    // Later labels replace earlier ones but keep their place, as v12's object keys did.
    expect(dom.links(menu!)).toEqual([
      ['Repo', '/repo2'],
      ['Docs', '/docs2'],
      ['Wiki', '/wiki'],
    ]);
    expect(menu!.children[0]!.getAttribute('class')).toBe('actorPopupMenuPanel fromDetails');
  });

  it('binds to the innermost groups of a participant and opens below the first', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([sequenceLike({ target: 'P', links: { Docs: '/docs' } })]);
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render('d', 'menuDiagram\n');
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    const [outer, top, bottom] = dom.anchors('P');
    expect(outer!.listeners).toEqual([]);
    expect(top!.listeners).toHaveLength(1);
    expect(bottom!.listeners).toHaveLength(1);
    expect(dom.anchors('Q').flatMap((a) => a.listeners)).toEqual([]);
    const [menu, ...rest] = dom.menus();
    expect(rest).toEqual([]);
    bottom!.click();
    expect(menu!.style.display).toBe('block');
    // Its top-left corner is at the anchor's bottom-left corner (10, 60).
    const at = menu!.getBoundingClientRect();
    expect([at.left, at.top]).toEqual([10, 60]);
    top!.click();
    expect(menu!.style.display).toBe('none');
  });

  it('sequence.forceMenus shows every menu and binds no click (v12 forceMenus)', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([sequenceLike({ target: 'P', links: { Docs: '/docs' } })]);
    await m.registerExternalDiagrams([interactions]);
    const result = await m.render(
      'd',
      '---\nconfig:\n  sequence:\n    forceMenus: true\n---\nmenuDiagram\n'
    );
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    expect(menu!.style.display).toBe('block');
    // Its top-left corner is at the anchor's bottom-left corner (10, 60).
    const at = menu!.getBoundingClientRect();
    expect([at.left, at.top]).toEqual([10, 60]);
    expect(dom.anchors('P').flatMap((a) => a.listeners)).toEqual([]);
  });

  it('without the plugin, menus are ignored silently and the svg is inert', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      sequenceLike({ target: 'P', links: { Docs: 'javascript:alert(1)', Ok: '/ok' } }),
    ]);
    const result = await m.render('d', 'menuDiagram\n');
    expect(result.warnings).toEqual([]);
    expect(result.bindFunctions).toBeUndefined();
    assertInert(result.svg);
  });
});
