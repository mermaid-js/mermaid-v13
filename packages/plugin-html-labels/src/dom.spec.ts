import { describe, expect, it } from 'vitest';
import { mountLabels } from './dom.ts';
import type { Sanitize } from './sanitize.ts';

// The unit suite has no DOM (R-ARCH-1), so these stand-ins carry only what `mountLabels` reads.
// The browser specs in e2e/dom/html-labels.spec.ts mount real labels.

interface Holder {
  ns: string;
  tag: string;
  attrs: Record<string, string>;
  children: unknown[];
}

function holderOf(ns: string, tag: string): Holder & Record<string, unknown> {
  const holder: Holder & Record<string, unknown> = { ns, tag, attrs: {}, children: [] };
  holder.setAttribute = (name: string, value: string) => void (holder.attrs[name] = value);
  holder.append = (child: unknown) => void holder.children.push(child);
  return holder;
}

function part(attrs: Record<string, string> = {}, text = '') {
  return { textContent: text, getAttribute: (name: string) => attrs[name] ?? null };
}

function placeholder(opts: {
  rect?: Record<string, string> | null;
  desc?: string | null;
  fill?: string;
}) {
  const rect = opts.rect === null ? null : part(opts.rect ?? { width: '40', height: '20' });
  const desc = opts.desc === null ? null : part({}, opts.desc ?? '<b>x</b>');
  const g = {
    fill: opts.fill ?? 'rgb(1, 2, 3)',
    children: [rect, desc] as unknown[],
    querySelector: (sel: string) => (sel === ':scope > rect' ? rect : desc),
    replaceChildren: (...nodes: unknown[]) => void (g.children = nodes),
  };
  return g;
}

function rootOf(gs: ReturnType<typeof placeholder>[], withView = true) {
  const view = { getComputedStyle: (g: { fill: string }) => ({ fill: g.fill }) };
  const document = {
    defaultView: withView ? view : null,
    createElementNS: (ns: string, tag: string) => holderOf(ns, tag),
  };
  return {
    ownerDocument: document,
    querySelectorAll: (sel: string) => (sel === 'g.mermaid-html-label' ? gs : []),
  } as unknown as Element;
}

/** A sanitizer whose fragment wraps one element with a style, or none when `html` is empty. */
const sanitize: Sanitize = (html) => {
  const wrapper = html ? { html, style: {} as Record<string, string> } : null;
  return { firstElementChild: wrapper } as unknown as DocumentFragment;
};

function mounted(g: ReturnType<typeof placeholder>) {
  const [holder] = g.children as [Holder & { children: [{ firstElementChild: unknown }] }];
  return holder;
}

describe('mountLabels', () => {
  it('swaps each placeholder for a foreignObject of its size holding the sanitized HTML', () => {
    const g = placeholder({ rect: { width: '40', height: '20' }, desc: '<b>x</b>' });
    expect(mountLabels(rootOf([g]), sanitize)).toBe(1);
    const holder = mounted(g);
    expect(holder.ns).toBe('http://www.w3.org/2000/svg');
    expect(holder.tag).toBe('foreignObject');
    expect(holder.attrs).toEqual({ width: '40', height: '20' });
    expect(holder.children[0].firstElementChild).toEqual({
      html: '<b>x</b>',
      style: { color: 'rgb(1, 2, 3)' },
    });
  });

  it('gives the HTML no colour when the placeholder has none to inherit', () => {
    for (const fill of ['none', 'url(#gradient)', '']) {
      const g = placeholder({ fill });
      mountLabels(rootOf([g]), sanitize);
      expect(mounted(g).children[0].firstElementChild).toEqual({ html: '<b>x</b>', style: {} });
    }
  });

  it('mounts empty HTML, and a rect without a size as 0 × 0', () => {
    const g = placeholder({ rect: {}, desc: '' });
    expect(mountLabels(rootOf([g]), sanitize)).toBe(1);
    expect(mounted(g).attrs).toEqual({ width: '0', height: '0' });
  });

  it('leaves a placeholder without its rect or its desc alone, so mounting twice changes nothing', () => {
    const noRect = placeholder({ rect: null });
    const noDesc = placeholder({ desc: null });
    const before = [noRect.children, noDesc.children];
    expect(mountLabels(rootOf([noRect, noDesc]), sanitize)).toBe(0);
    expect([noRect.children, noDesc.children]).toEqual(before);
  });

  it('mounts nothing in a document without a window', () => {
    const g = placeholder({});
    expect(mountLabels(rootOf([g], false), sanitize)).toBe(0);
  });
});
