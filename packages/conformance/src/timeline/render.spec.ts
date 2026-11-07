import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { TimelineDocument, TimelineModel } from '@mermaid-js/diagram-timeline';
import { createMermaid, MermaidError } from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { timelineCases, timelineCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the timeline (spec #291 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8) over the parsed corpus, through the public `createMermaid().render()` with
 * `deterministic: true`: the e2e fixtures, the v12 spec strings, the parser cases and the edge
 * cases, each in every theme and `theme: 'auto'` set by `initialize()` (a source's own front
 * matter and directives still win).
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, ids only `<prefix>-title`/`-desc`, every drawn coordinate in
 * the viewBox, every alias declared. Round-trip: every `data-ast` names an AST node whose range
 * lies in the source and holds its text (punctuation aside, as entities are encoded); each
 * section, period and event node has exactly one `data-ast` element of its kind, and no other
 * node (header, title, `accTitle`, `accDescr`, `st:<n>`) has one.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const PREFIX = 'mermaid-0';
const TOL = 0.01;

interface Rendered {
  readonly svg: string;
  readonly gradient: string | false;
  readonly themeStyle: boolean;
}

function api(theme: (typeof THEMES)[number]): ReturnType<typeof createMermaid> {
  const m = createMermaid();
  m.initialize({ theme, deterministic: true });
  return m;
}

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly model: TimelineModel;
  readonly ast: TimelineDocument;
  readonly r: Rendered;
  readonly tree: SvgView;
}

const cases: Case[] = [];
const rejected = new Set<string>();
let corpus: CorpusItem[];

beforeAll(async () => {
  // The lexer gate's line-separator cases stay out: a comment v12 removed after a U+2028 can
  // fall inside a node's range there, which the AST text check below does not allow for.
  const parsed = timelineCases().filter((c) => !c.id.startsWith('timeline-cases/line separators '));
  corpus = [...(await timelineCorpus()), ...parsed];
  for (const theme of THEMES) {
    const m = api(theme);
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      try {
        const prepared = await m.prepare(item.source, { id: PREFIX });
        const { svg } = m.renderSync(item.source, { id: PREFIX });
        expect(prepared.diagramType, item.id).toBe('timeline');
        cases.push({
          id: `${item.id} ${theme}`,
          theme,
          source: item.source,
          model: prepared.parse.model as TimelineModel,
          ast: prepared.parse.ast as TimelineDocument,
          r: {
            svg,
            gradient: svg.includes('<linearGradient') ? `${PREFIX}-gradient` : false,
            themeStyle: String(prepared.config.theme) === 'auto',
          },
          tree: parseSvg(svg),
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        rejected.add(item.id);
      }
    }
  }
}, 300_000);

/** Every point an element draws at; the renderer writes absolute coordinates. */
function points(tree: SvgView, node: SvgElement): [number, number][] {
  const a = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
  switch (tree.tag(node)) {
    case 'line':
      return [
        [a('x1'), a('y1')],
        [a('x2'), a('y2')],
      ];
    case 'path': {
      const n = (tree.getAttr(node, 'd') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const out: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!]);
      return out;
    }
    case 'text':
    case 'tspan':
      return tree.getAttr(node, 'x') === undefined ? [] : [[a('x'), a('y')]];
    case undefined:
    default:
      return [];
  }
}

const DRAWN: Readonly<Record<string, string>> = {
  Section: 'timeline-node',
  Period: 'taskWrapper',
  Event: 'eventWrapper',
};

describe('timeline render properties over the parsed corpus', () => {
  it('renders the corpus in every theme', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(57);
    expect(cases.length).toBeGreaterThan(70 * THEMES.length);
    expect(cases.reduce((n, c) => n + c.model.periods.length, 0)).toBeGreaterThan(
      300 * THEMES.length
    );
    // Only sources v12 rejects stay out (#336's accept/reject parity).
    expect(rejected.size).toBeLessThan(corpus.length / 4);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const apis = new Map(THEMES.map((t) => [t as string, api(t)]));
    for (const c of cases)
      expect((await apis.get(c.theme)!.render(PREFIX, c.source)).svg, c.id).toBe(c.r.svg);
  });

  it('writes no element ids but the title, the description and the gradient', () => {
    for (const c of cases)
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined)) {
        const id = c.tree.getAttr(el, 'id')!;
        const tag = c.tree.tag(el)!;
        const ok =
          (tag === 'title' && id === `${PREFIX}-title`) ||
          (tag === 'desc' && id === `${PREFIX}-desc`) ||
          (tag === 'linearGradient' && id === c.r.gradient);
        expect(ok, `${c.id}: <${tag} id="${id}">`).toBe(true);
      }
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = c.tree
        .find(() => true)
        .flatMap((n) => points(c.tree, n))
        .filter(
          ([px, py]) => px < x! - TOL || py < y! - TOL || px > x! + w! + TOL || py > y! + h! + TOL
        );
      expect(out.slice(0, 3), c.id).toEqual([]);
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
});

describe('timeline AST round-trip over the parsed corpus (R-PARSE-8)', () => {
  it('maps each section, period and event node to exactly one data-ast element of its kind', () => {
    for (const c of cases) {
      const index = astIndex(c.ast as AstNode);
      const seen = new Map<string, SvgElement[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, [...(seen.get(id) ?? []), el]);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
      }
      for (const [id, els] of seen) {
        const node = index.get(id);
        expect(node, `${c.id}: data-ast ${id} is not an AST id`).toBeDefined();
        expect(els, `${c.id}: ${id}`).toHaveLength(1);
        const cls = DRAWN[node!.type];
        expect(cls, `${c.id}: ${id} is a ${node!.type}`).toBeDefined();
        expect(c.tree.getAttr(els[0]!, 'class')!.split(' '), `${c.id}: ${id}`).toContain(cls);
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
        // The text, compared without punctuation: v12 encodes entities (`#lt;` is `&lt;`).
        const bare = (t: string): string => t.replace(/\W+/g, '');
        const text = bare((node as AstNode & { text: string }).text);
        expect(bare(c.source.slice(start, end)), `${c.id}: ${id}`).toContain(text);
      }
      for (const n of c.ast.children)
        if (DRAWN[n.type]) expect(seen.has(n.id), `${c.id}: ${n.id} is not drawn`).toBe(true);
        else expect(seen.has(n.id), `${c.id}: ${n.id} (${n.type}) has data-ast`).toBe(false);
    }
  });

  it('includes an empty accDescr {} statement, which draws nothing', () => {
    const c = cases.find((k) => k.ast.children.some((n) => n.type === 'AccDescr'));
    expect(c, 'a corpus source with accDescr').toBeDefined();
  });
});
