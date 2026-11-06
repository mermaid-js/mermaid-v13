import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { GanttDocument, GanttModel } from '@mermaid-js/diagram-gantt';
import { createMermaid, MermaidError } from 'mermaid';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { CLICK_CASES, DB_SPEC_CASES, EDGE_CASES, ganttCases, ganttCorpus } from './corpus.ts';
import { GANTT_PARITY_NOW } from './oracle-env.ts';

/**
 * Render properties and the AST round-trip of the gantt renderer (spec #293 T4, DESIGN §13.2,
 * §13.4, R-PARSE-8) over the parsed corpus, through the public `createMermaid().render()` with
 * `deterministic: true` and a fixed `now`: the e2e fixtures, the v12 spec strings, the parser,
 * DB, click and edge cases, in every theme and `theme: 'auto'`, and once more in `default` at a
 * `now` inside most charts (so the today line is drawn). Gantt loads through the generated
 * registry (#385).
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, ids
 * only `<prefix>-title`/`-desc`, every drawn coordinate in the viewBox, every alias declared.
 * Round-trip: every `data-ast` names an AST node whose range lies in the source; each drawn task
 * is one `rect.task` and each section title one `text.sectionTitle`, with no other `data-ast`.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const PREFIX = 'mermaid-0';
const IN_DOMAIN = new Date(2014, 0, 8, 12).getTime();
const TOL = 0.01;

function api(config: Record<string, unknown>): ReturnType<typeof createMermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly now: number;
  readonly source: string;
  readonly model: GanttModel;
  readonly ast: GanttDocument;
  readonly svg: string;
  readonly gradient: string | false;
  readonly themeStyle: boolean;
  readonly tree: SvgView;
}

const RUNS = [
  ...THEMES.map((theme) => ({ theme: theme as string, now: GANTT_PARITY_NOW })),
  { theme: 'default', now: IN_DOMAIN },
];
const cases: Case[] = [];
const rejected = new Map<string, string>();
let corpus: CorpusItem[];

beforeAll(async () => {
  corpus = [
    ...(await ganttCorpus()),
    ...ganttCases(),
    ...DB_SPEC_CASES,
    ...CLICK_CASES,
    ...EDGE_CASES,
  ];
  for (const { theme, now } of RUNS) {
    const m = api({ theme });
    for (const item of corpus) {
      try {
        const prepared = await m.prepare(item.source, { id: PREFIX, now });
        const { svg } = m.renderSync(item.source, { id: PREFIX, now });
        expect(prepared.diagramType, item.id).toBe('gantt');
        cases.push({
          id: `${item.id} ${theme} ${now}`,
          theme,
          now,
          source: item.source,
          model: prepared.parse.model as GanttModel,
          ast: prepared.parse.ast as GanttDocument,
          svg,
          gradient: svg.includes('<linearGradient') ? `${PREFIX}-gradient` : false,
          themeStyle: String(prepared.config.theme) === 'auto',
          tree: parseSvg(svg),
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        rejected.set(`${item.id} ${theme} ${now}`, e.code);
      }
    }
  }
}, 600_000);

describe('gantt render properties over the parsed corpus', () => {
  it('renders the corpus in every theme', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(80);
    expect(cases.length).toBeGreaterThan(150 * RUNS.length);
    expect(cases.reduce((n, c) => n + c.model.tasks.length, 0)).toBeGreaterThan(500 * RUNS.length);
    expect(cases.some((c) => c.svg.includes('<line class="today"'))).toBe(true);
    expect(cases.some((c) => c.svg.includes('<a href='))).toBe(true);
    expect(cases.some((c) => c.svg.includes('class="exclude-range"'))).toBe(true);
    expect(cases.some((c) => c.svg.includes('milestone'))).toBe(true);
    // Only sources whose parse or schedule fails stay out (D274): many parser cases are syntax
    // errors on purpose.
    expect(new Set(rejected.values())).toEqual(new Set(['SYNTAX', 'SEMANTIC']));
    expect(rejected.size).toBeLessThan((corpus.length * RUNS.length) / 2);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker', () => {
    for (const c of cases) {
      expect(wellFormed(c.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.svg, { gradient: c.gradient, themeStyle: c.themeStyle }),
        c.id
      ).not.toThrow();
      // Task ids and texts are the author's (`test task:undefined, …` is a v12 spec string).
      const drawn = c.svg.replace(/ data-(?:id|ast)="[^"]*"/g, '').replace(/>[^<]*</g, '><');
      expect(drawn, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const apis = new Map<string, ReturnType<typeof api>>();
    for (const theme of new Set(RUNS.map((r) => r.theme))) apis.set(theme, api({ theme }));
    for (const c of cases)
      expect((await apis.get(c.theme)!.render(PREFIX, c.source, { now: c.now })).svg, c.id).toBe(
        c.svg
      );
  });

  it('writes no element ids but the title and the description, and no gradient (D278)', () => {
    for (const c of cases) {
      expect(c.gradient, c.id).toBe(false);
      expect(c.svg, c.id).not.toContain('filter=');
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined)) {
        const id = c.tree.getAttr(el, 'id')!;
        const tag = c.tree.tag(el)!;
        const ok =
          (tag === 'title' && id === `${PREFIX}-title`) ||
          (tag === 'desc' && id === `${PREFIX}-desc`);
        expect(ok, `${c.id}: <${tag} id="${id}">`).toBe(true);
      }
    }
  });

  it('keeps every drawn coordinate inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(c.tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });
});

describe('gantt AST round-trip over the parsed corpus (R-PARSE-8)', () => {
  it('maps each drawn task and section to exactly one data-ast element of its kind', () => {
    let tasks = 0;
    for (const c of cases) {
      const index = astIndex(c.ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: data-ast ${id} is not an AST id`).toBeDefined();
        const cls = c.tree.getAttr(el, 'class')!.split(' ');
        if (node!.type === 'Task') {
          tasks++;
          expect([c.tree.tag(el), cls[0]], `${c.id}: ${id}`).toEqual(['rect', 'task']);
          // The bar's data-id is the task's id, as written.
          const task = c.model.tasks.find((t) => t.ast === id)!;
          expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(task.id);
        } else {
          expect(node!.type, `${c.id}: ${id}`).toBe('Section');
          expect([c.tree.tag(el), cls[0]], `${c.id}: ${id}`).toEqual(['text', 'sectionTitle']);
        }
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id}`).toBe(1);
      // A label carries the bar's data-id only.
      const labels = c.tree.find(
        (n, t) => t.tag(n) === 'text' && (t.getAttr(n, 'class') ?? '').includes('taskText')
      );
      for (const l of labels) expect(c.tree.getAttr(l, 'data-ast'), c.id).toBeUndefined();
      // Every task AST node of a chart that drew a bar for each task is drawn.
      const bars = c.tree.find(
        (n, t) => t.tag(n) === 'rect' && (t.getAttr(n, 'class') ?? '').startsWith('task')
      );
      if (bars.length === c.model.tasks.length)
        for (const t of c.model.tasks) expect(seen.has(t.ast), `${c.id}: ${t.ast}`).toBe(true);
    }
    expect(tasks).toBeGreaterThan(500 * RUNS.length);
  });
});
