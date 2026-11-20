/**
 * The render context's own shape. A given id is now the prefix as a plain value, so that V8
 * keeps the context out of dictionary mode; without one the prefix is still a getter worked out
 * at the first read. The keys, their order and every value a renderer or hook sees stay as they
 * were when `idPrefix` was always a getter in the literal: the old key order is the reference.
 */
import type { DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { defaultIdPrefix, optionsKey } from './config-snapshot.ts';
import { createMermaid } from './index.ts';

/** The keys of the old literal, in its order; text output appends its own after them. */
const OLD_KEYS = [
  'config',
  'measurer',
  'units',
  'theme',
  'securityLevel',
  'idPrefix',
  'version',
  'linkSchemes',
  'limits',
  'now',
  'availableWidth',
  'iconPacks',
  'layoutPart',
  'layout',
  'inline',
  'icon',
  'embed',
  'foldedType',
  'warn',
];

const TEXT = 'probe\n  a';
const FLOW = 'flowchart LR\n  accTitle: T\n  A --> B';

/** A custom-layout plugin that keeps the context its renderer was given. */
function probe() {
  const seen: RenderContext[] = [];
  const plugin: DiagramPlugin<string, object> = {
    id: 'probe',
    layoutKind: 'custom',
    detector: (text) => /^\s*probe/.test(text),
    parse: (text) => ({
      model: text,
      ast: { id: 'p', type: 'Probe', range: { start: 0, end: text.length } },
      diagnostics: [],
      symbols: [],
      statements: [],
    }),
    layout: () => ({}),
    render: (_m: string, _l: object, ctx: RenderContext, w: SvgWriter) => {
      seen.push(ctx);
      w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', id: ctx.idPrefix });
      w.close();
    },
  };
  return { plugin, seen };
}

describe('the render context', () => {
  it('has the old keys in the old order, with a given id as its prefix', async () => {
    const { plugin, seen } = probe();
    const m = createMermaid();
    await m.registerExternalDiagrams([plugin]);
    await m.prepare(TEXT);
    for (const id of ['m1', '', 'a b', 'x"y']) {
      const svg = m.renderSync(TEXT, { id }).svg;
      const ctx = seen.at(-1)!;
      expect(Object.keys(ctx)).toEqual(OLD_KEYS);
      expect(ctx.idPrefix).toBe(id);
      expect({ ...ctx }.idPrefix).toBe(id);
      expect(Object.getOwnPropertyDescriptor(ctx, 'idPrefix')).toMatchObject({
        value: id,
        enumerable: true,
        configurable: true,
      });
      expect(svg).toContain(`id="${id.replace('"', '&quot;')}"`);
    }
  });

  it('works the default prefix out at the first read, as the getter did', async () => {
    const p = probe();
    const m = createMermaid();
    await m.registerExternalDiagrams([p.plugin]);
    await m.prepare(TEXT);
    for (const options of [undefined, {}, { id: undefined }, { id: null as unknown as string }]) {
      const svg = m.renderSync(TEXT, options).svg;
      const ctx = p.seen.at(-1)!;
      expect(Object.keys(ctx)).toEqual(OLD_KEYS);
      const d = Object.getOwnPropertyDescriptor(ctx, 'idPrefix')!;
      expect(typeof d.get).toBe('function');
      expect(d).toMatchObject({ set: undefined, enumerable: true, configurable: true });
      const want = defaultIdPrefix(TEXT, ctx.config, optionsKey({}), ctx.units);
      expect(ctx.idPrefix).toBe(want);
      expect(ctx.idPrefix).toBe(want);
      expect(svg).toContain(`id="${want}"`);
    }
  });

  it('gives hooks, SVG and text output the same keys and prefix as before', async () => {
    const m = createMermaid();
    const seen: Record<string, unknown>[] = [];
    await m.registerExternalDiagrams([
      {
        id: 'keys',
        postLayout(l, ctx) {
          seen.push({ ...ctx });
          return l;
        },
      },
    ]);
    for (const format of ['svg', 'ascii'] as const) {
      await m.prepare(FLOW, { format });
      for (const id of ['f1', undefined]) {
        const options = id === undefined ? {} : { id };
        if (format === 'svg') m.renderSync(FLOW, options);
        else m.renderSync(FLOW, { ...options, format });
        const c = seen.at(-1)!;
        const own = Object.keys(c).filter((k) => k !== 'diagram' && k !== 'state');
        const text = format === 'ascii' ? own.slice(OLD_KEYS.length) : [];
        expect(own).toEqual([...OLD_KEYS, ...text]);
        expect(text.every((k) => ['title', 'ast', 'embedText'].includes(k))).toBe(true);
        if (id !== undefined) expect(c.idPrefix).toBe(id);
        else expect(c.idPrefix).toMatch(/^mermaid-[0-9a-z]+$/);
      }
    }
  });
});
