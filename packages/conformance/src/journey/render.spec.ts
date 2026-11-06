import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { JourneyModel } from '@mermaid-js/diagram-journey';
import {
  createMermaid,
  MermaidError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import { journeyCorpus } from './corpus.ts';

/**
 * Render properties of the journey renderer (spec #290 T5, DESIGN §13.2, §13.4) over the
 * journey corpus (e2e fixtures, baselines and v12 spec strings), through the public `render()`
 * with `deterministic: true`: well-formed XML (a full XML parse, which the package's own spec
 * cannot import), the allow-list, render-twice determinism, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, no ids but the title and description, every drawn coordinate
 * inside the viewBox, and every section line and task mapped to exactly one `data-ast` element
 * whose id resolves to an AST range (R-PARSE-8). Colours differ by theme only (D227); the corpus
 * renders in a redux and a classic theme, and in `neo-dark`.
 */
const THEMES = ['redux-color', 'default', 'neo-dark'] as const;

interface Case {
  id: string;
  theme: (typeof THEMES)[number];
  source: string;
  result: RenderResult & { tree: SvgView };
  prepared: Prepared;
}

const api = (theme?: MermaidConfig['theme']): Mermaid => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...(theme !== undefined ? { theme } : {}) });
  return m;
};

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

beforeAll(async () => {
  const corpus = await journeyCorpus();
  for (const theme of THEMES) {
    const themed = api(theme);
    for (const item of corpus) {
      try {
        const prepared = await themed.prepare(item.source, { id: 'mermaid-0' });
        const result = themed.renderSync(item.source, { id: 'mermaid-0' });
        cases.push({
          id: `${theme} ${item.id}`,
          theme,
          source: item.source,
          result: { ...result, tree: parseSvg(result.svg) },
          prepared,
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 240_000);

// The writer rounds coordinates to two decimals; strokes are inside the bounds (D224).
const TOL = 0.01;

describe('journey render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(30);
    expect(cases.every((c) => c.result.diagramType === 'journey')).toBe(true);
    // Inputs v13 rejects are the parser's business (#302 parity); none fail to render.
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
    const fresh = new Map(THEMES.map((t) => [t, api(t)] as const));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, no foreignObject and no marker', () => {
    for (const c of cases)
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every section line, task and actor mention to one data-ast element with an AST range', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const parse = c.prepared.parse;
      const model = parse.model as JourneyModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      for (const s of model.sections) expect(seen.get(s.ast), `${c.id}: section ${s.ast}`).toBe(1);
      for (const t of model.tasks) expect(seen.get(t.ast), `${c.id}: task ${t.ast}`).toBe(1);
      // Every section, task and actor-mention node: one element each (a task's dot per mention).
      for (const [id, node] of index)
        if (['Section', 'Task', 'Actor'].includes(node.type))
          expect(seen.get(id), `${c.id}: ${node.type} ${id}`).toBe(1);
    }
  });
});

describe('journey render: security', () => {
  it('renders hostile names, colours and titles inert', async () => {
    const hostile = [
      'journey\ntitle </text><script>alert(1)</script>\nsection <img src=x onerror=alert(1)>\nT: 5: <svg onload=alert(1)>',
      'journey\naccTitle: <script>x</script>\naccDescr: ]]><x\nT: 3: "&<>\'',
      '---\nconfig:\n  journey:\n    titleColor: "red;fill:url(#x)"\n    sectionColours: ["url(javascript:alert(1))"]\n    actorColours: ["</style><script>"]\n---\njourney\ntitle T\nsection S\nA: 4: Me',
      '---\nconfig:\n  journey:\n    taskFontFamily: "x;}</style><script>alert(1)</script>"\n---\njourney\nsection S\nA: 4: Me',
    ];
    const m = api();
    for (const source of hostile) {
      const result = await m.render('x', source);
      expect(() => assertInert(result.svg), source).not.toThrow();
      expect(wellFormed(result.svg), source).toBeUndefined();
      expect(result.svg, source).not.toMatch(/<script|javascript:/);
    }
  });
});
