import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { detectInfo, INFO_METRICS, layoutInfo } from '@mermaid-js/diagram-info';
import {
  createMermaid,
  MermaidError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import { infoGateCorpus } from './corpus.ts';

/**
 * Render properties of the info renderer (#420, DESIGN §13.2, §13.4) over the info gate corpus
 * (e2e fixtures, v12 spec strings and the cases, each also with CRLF and comment lines),
 * through the public `render()` with `deterministic: true`, in a classic, a redux and an
 * `auto` theme: well-formed XML, the allow-list, render-twice determinism, no
 * NaN/Infinity/undefined, ids only on the title and description, the version text inside the
 * viewBox, and the AST round-trip (R-PARSE-8).
 *
 * Then what is drawn, against v12's `infoRenderer.ts` (v12's info SVG needs a DOM, so the
 * oracle cannot render it here): one `text.version`, `v<version>`, `font-size` 32, anchored in
 * the middle at (100, 40), the SVG at most 400 px wide, as v12's
 * `configureSvgSize(svg, 100, 400, true)` made it.
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

interface Case {
  id: string;
  theme: (typeof THEMES)[number];
  source: string;
  result: RenderResult;
  tree: SvgView;
  prepared: Prepared;
}

const api = (config: MermaidConfig = {}): Mermaid => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
};

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

beforeAll(async () => {
  const corpus = await infoGateCorpus();
  for (const theme of THEMES) {
    const themed = api({ theme });
    for (const item of corpus) {
      if (!detectInfo(item.source)) continue;
      try {
        const prepared = await themed.prepare(item.source, { id: 'mermaid-0' });
        const result = themed.renderSync(item.source, { id: 'mermaid-0' });
        const tree = parseSvg(result.svg);
        cases.push({
          id: `${theme} ${item.id}`,
          theme,
          source: item.source,
          result,
          tree,
          prepared,
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 120_000);

const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

describe('info render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(150);
    // Inputs v13 rejects are the parser's business (parity); none fail to render otherwise.
    expect(skipped.filter((s) => !s.reason.startsWith('SYNTAX'))).toEqual([]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.prepared.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const fresh = new Map(THEMES.map((t) => [t, api({ theme: t })]));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject/);
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('draws one version text, inside the viewBox, holding v12’s canvas', () => {
    for (const c of cases) {
      const { tree } = c;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const texts = tree.find({ tag: 'text' });
      expect(texts.length, c.id).toBe(1);
      const t = texts[0]!;
      expect(tree.getAttr(t, 'class'), c.id).toBe('version');
      expect(t.children.map((n) => n.text).join(''), c.id).toBe(
        `v${/data-mermaid-version="([^"]+)"/.exec(c.result.svg)?.[1]}`
      );
      const tx = Number(tree.getAttr(t, 'x'));
      const ty = Number(tree.getAttr(t, 'y'));
      expect(x! <= 0 && y! <= 0, c.id).toBe(true);
      expect(x! + w! >= INFO_METRICS.width && y! + h! >= INFO_METRICS.height, c.id).toBe(true);
      expect(tx > x! && tx < x! + w! && ty > y! && ty < y! + h!, c.id).toBe(true);
    }
  });

  it('maps the version text to the info header and back (R-PARSE-8)', () => {
    for (const c of cases) {
      const { tree } = c;
      const index = astIndex(c.prepared.parse.ast);
      const mapped = tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined);
      expect(
        mapped.map((n) => tree.getAttr(n, 'data-ast')),
        c.id
      ).toEqual(['info']);
      const node = index.get('info')!;
      expect(node.type, c.id).toBe('Header');
      // From `info` to `showInfo`, which may be on a later line, past comments.
      expect(c.source.slice(node.range.start, node.range.end), c.id).toMatch(
        /^info(?:[\s\S]*showInfo)?$/
      );
    }
  });
});

describe('info render: what is drawn (v12 infoRenderer.ts)', () => {
  it('draws v<version> at v12’s place and size, the SVG at most as wide as its viewBox', async () => {
    const { svg } = await api().render('x', 'info');
    const tree = parseSvg(svg);
    const root = tree.find({ tag: 'svg' })[0]!;
    const t = tree.find({ tag: 'text' })[0]!;
    const version = tree.getAttr(root, 'data-mermaid-version')!;
    expect(version).toMatch(VERSION);
    expect(t.children.map((n) => n.text).join('')).toBe(`v${version}`);
    expect(['x', 'y', 'font-size', 'text-anchor'].map((a) => tree.getAttr(t, a))).toEqual([
      '100',
      '40',
      '32',
      'middle',
    ]);
    expect(tree.getAttr(root, 'width')).toBe('100%');
    const [, , w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
    expect(tree.getAttr(root, 'style')).toContain(`max-width:${w}px`);
    expect(h).toBe(100);
  });

  it('keeps v12’s 400 × 100 canvas when the version fits in it, and grows past it', () => {
    // A seven-character version as v12's `v12.2.0` is about 110 px at 32 px: no growth.
    const measurer = {
      id: 'fixed',
      width: (s: string) => s.length * 16,
      metrics: () => ({ ascent: 30, descent: 8, lineHeight: 38 }),
    };
    const theme = { value: () => 'sans-serif' } as unknown as Parameters<
      typeof layoutInfo
    >[0]['theme'];
    expect(layoutInfo({ measurer, theme, version: '12.2.0' }).bounds).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 100,
    });
    expect(layoutInfo({ measurer, theme, version: '13.0.0-alpha.10' }).bounds).toEqual({
      x: -28,
      y: 0,
      width: 428,
      height: 100,
    });
  });

  it('draws the same SVG for showInfo, title and every theme family but colour', async () => {
    const plain = (await api().render('x', 'info')).svg;
    expect((await api().render('x', 'info showInfo\ntitle Not drawn')).svg).toBe(plain);
    const neo = (await api({ theme: 'neo' }).render('x', 'info')).svg;
    const strip = (s: string) => s.replace(/ style="[^"]*"/, '');
    expect(strip(neo)).toBe(strip(plain));
  });
});
