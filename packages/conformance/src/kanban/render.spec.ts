import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderKanbanForTest, type RenderedKanban } from '@mermaid-js/diagram-kanban/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { kanbanCases, kanbanCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the kanban (spec #424 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings and the parser and lexer cases, each in every theme and `theme: 'auto'` set as
 * `initialize()` would (a source's own front matter and directives still win). The manifest is
 * T5's (#459), so sources go through the plugin's own seam, parse → layout → render, with
 * core's render context (`renderKanbanForTest`); sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject`, no element id at all, every drawn coordinate inside the viewBox, every alias
 * declared, ticket links checked (D377) and one `KANBAN_PRIORITY` where a card's priority is
 * none of v12's five (D375). Round-trip: each `Item` of the AST has exactly one `data-ast`
 * element, a `g.cluster` or `g.node` whose `data-id` is the same id, and its range holds its text.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;
const KNOWN_PRIORITIES = new Set(['Very High', 'High', 'Medium', 'Low', 'Very Low']);

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedKanban;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await kanbanCorpus()), ...kanbanCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedKanban;
      try {
        r = await renderKanbanForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('kanban parse error')) throw e;
        rejected.add(item.id);
        continue;
      }
      cases.push({
        id: `${item.id} ${theme}`,
        theme,
        source: item.source,
        r,
        tree: parseSvg(r.svg),
      });
    }
}, 300_000);

/** Line ends, which `extents` leaves out. */
function lineEnds(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const el of tree.find({ tag: 'line' })) {
    const a = (k: string): number => Number(tree.getAttr(el, k));
    out.push({ x: a('x1'), y: a('y1') }, { x: a('x2'), y: a('y2') });
  }
  return out;
}

describe('kanban render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with cards, bars, links and 15 columns', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(30);
    expect(cases.length).toBeGreaterThan(100 * THEMES.length);
    // Every e2e fixture renders; the cases file holds the rejections.
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(rejected.size).toBeLessThan(corpus.length / 2);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of ['class="node', 'class="kanban-priority"', 'class="kanban-ticket-link"'])
      expect(all, part).toContain(part);
    expect(cases.some((c) => c.r.layout.columns.length >= 15)).toBe(true);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined or foreignObject', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderKanbanForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
        c.r.svg
      );
  });

  it('writes no element id (kanban has no title or description)', () => {
    for (const c of cases)
      expect(
        c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined).map((n) => c.tree.tag(n)),
        c.id
      ).toEqual([]);
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect([...extents(c.tree), ...lineEnds(c.tree)].filter(off).slice(0, 3), c.id).toEqual([]);
      const boxes = [...c.r.layout.columns, ...c.r.layout.cards].flatMap((b) => [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
      ]);
      expect(boxes.filter(off).slice(0, 2), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.r.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.r.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });

  it('opens every ticket link in a new tab with rel, and only to a checked URL (D377)', () => {
    for (const c of cases)
      for (const a of c.tree.find({ tag: 'a' })) {
        expect(c.tree.getAttr(a, 'target'), c.id).toBe('_blank');
        expect(c.tree.getAttr(a, 'rel'), c.id).toBe('noopener noreferrer');
        expect(c.tree.getAttr(a, 'href'), c.id).toMatch(/^(?:https?:|mailto:|[^:]*$)/i);
      }
  });

  it('warns KANBAN_PRIORITY once where a card has a priority none of the five, and never otherwise (D375)', () => {
    for (const c of cases) {
      const odd = c.r.model.items.some(
        (i) =>
          !i.isColumn &&
          i.priority !== undefined &&
          (i.priorityKind === 'other' || !KNOWN_PRIORITIES.has(i.priority))
      );
      expect(c.r.warnings.filter((w) => w.code === 'KANBAN_PRIORITY').length, c.id).toBe(
        odd ? 1 : 0
      );
    }
  });
});

describe('kanban AST round-trip over the parsed corpus (R-PARSE-8)', () => {
  it('maps each Item to exactly one g.cluster or g.node, and nothing else has data-ast', () => {
    for (const c of cases) {
      const ast = c.r.ast!;
      const index = astIndex(ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        const cls = c.tree.getAttr(el, 'class')!.split(' ');
        expect(cls.includes('cluster') || cls.includes('node'), `${c.id}: ${id}`).toBe(true);
        const node = index.get(id);
        expect(node?.type, `${c.id}: data-ast ${id}`).toBe('Item');
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
        // The text, compared without punctuation and as a subsequence: entities are decoded.
        const bare = (t: string): string => t.replace(/\W+/g, '');
        const text = bare((node as AstNode & { text: string }).text);
        const written = bare(c.source.slice(start, end));
        let k = 0;
        for (const ch of written) if (ch === text[k]) k++;
        expect(k, `${c.id}: ${id} holds ${JSON.stringify(text)}`).toBe(text.length);
      }
      for (const n of ast.children) expect(seen.get(n.id), `${c.id}: ${n.id}`).toBe(1);
    }
  });
});
