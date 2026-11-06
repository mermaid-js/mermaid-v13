/**
 * `RenderOptions.now` and `availableWidth` on the render context (R-API-8, R-LAYOUT-5, D270,
 * D272, D274, D275), seen by a probe `layoutKind: 'custom'` plugin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const TEXT = 'probe\n  a';
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

interface Seen {
  readonly now: number | undefined;
  readonly width: number | undefined;
}

/** A custom-layout plugin that draws what its layout read from the context. */
function probe() {
  const seen: Seen[] = [];
  let parses = 0;
  const plugin: DiagramPlugin<string, Seen> = {
    id: 'probe',
    layoutKind: 'custom',
    detector: (text) => /^\s*probe/.test(text),
    parse: (text) => {
      parses++;
      return {
        model: text,
        ast: { id: 'p', type: 'Probe', range: { start: 0, end: text.length } },
        diagnostics: [],
        symbols: [],
        statements: [],
      };
    },
    layout: (_m: string, ctx: RenderContext) => {
      const s = { now: ctx.now, width: ctx.availableWidth };
      seen.push(s);
      return s;
    },
    render: (_m: string, l: Seen, _ctx: RenderContext, w: SvgWriter) => {
      w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 10] });
      w.open('desc');
      w.text(`now=${l.now} width=${l.width}`);
      w.close();
      w.close();
    },
  };
  return { plugin, seen, parses: () => parses };
}

async function setup() {
  const p = probe();
  const m = createMermaid();
  await m.registerExternalDiagrams([p.plugin]);
  await m.prepare(TEXT);
  return { m, ...p };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RenderOptions.now (D270, D275)', () => {
  it('reaches the layout as a number, and a fixed now gives identical output', async () => {
    const { m, seen } = await setup();
    const a = m.renderSync(TEXT, { now: NOW }).svg;
    const b = m.renderSync(TEXT, { now: NOW }).svg;
    const c = (await m.render('probe', TEXT, { now: NOW })).svg;
    const d = (await m.render('probe', TEXT, { now: NOW })).svg;
    expect(a).toContain(`now=${NOW} `);
    expect(b).toBe(a);
    expect(d).toBe(c);
    expect(seen.map((s) => s.now)).toEqual([NOW, NOW, NOW, NOW]);
  });

  it('takes a Date as the same instant', async () => {
    const { m } = await setup();
    expect(m.renderSync(TEXT, { now: new Date(NOW) }).svg).toBe(
      m.renderSync(TEXT, { now: NOW }).svg
    );
  });

  it('defaults to the clock at each render() and renderSync() call', async () => {
    const { m, seen } = await setup();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    m.renderSync(TEXT);
    vi.setSystemTime(NOW + 1000);
    await m.render('probe', TEXT);
    vi.setSystemTime(NOW + 2000);
    m.renderSync(TEXT, { now: 5 });
    expect(seen.map((s) => s.now)).toEqual([NOW, NOW + 1000, 5]);
  });

  it('is not a config key: front matter cannot set it', async () => {
    const { m, seen } = await setup();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const text = `---\nconfig:\n  now: 5\n---\n${TEXT}`;
    await m.prepare(text);
    m.renderSync(text);
    expect(seen.map((s) => s.now)).toEqual([NOW]);
  });

  it('does not enter the parse cache: one parse serves every now (D274)', async () => {
    const { m, parses } = await setup();
    m.renderSync(TEXT, { now: 1 });
    m.renderSync(TEXT, { now: 2 });
    await m.render('probe', TEXT, { now: 3 });
    expect(parses()).toBe(1);
  });
});

describe('availableWidth on the render context (R-LAYOUT-5, D272)', () => {
  it('is what the render option supplies, and undefined without it', async () => {
    const { m, seen } = await setup();
    m.renderSync(TEXT);
    m.renderSync(TEXT, { availableWidth: 640 });
    await m.render('probe', TEXT, { availableWidth: 480 });
    expect(seen.map((s) => s.width)).toEqual([undefined, 640, 480]);
  });

  it('is what mount() passes: a fixed width, the element width, or none', async () => {
    const { m, seen } = await setup();
    const el = () => ({ clientWidth: 900 }) as unknown as HTMLElement;
    vi.stubGlobal('getComputedStyle', () => ({
      paddingLeft: '10px',
      paddingRight: '10px',
      getPropertyValue: () => '',
    }));
    await m.mount(el(), TEXT).ready;
    await m.mount(el(), TEXT, { availableWidth: 320 }).ready;
    await m.mount(el(), TEXT, { availableWidth: true }).ready;
    expect(seen.map((s) => s.width)).toEqual([undefined, 320, 880]);
  });

  it('gives each mount() render its own now', async () => {
    const { m, seen } = await setup();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const mounted = m.mount({} as HTMLElement, TEXT);
    await mounted.ready;
    vi.setSystemTime(NOW + 60_000);
    await mounted.update(TEXT);
    expect(seen.map((s) => s.now)).toEqual([NOW, NOW + 60_000]);
  });
});
