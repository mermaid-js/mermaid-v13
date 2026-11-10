import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { RequirementModel } from '@mermaid-js/diagram-requirement';
import { createMermaid, MermaidError, type Prepared, type RenderResult } from 'mermaid';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { requirementCases, requirementCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of requirement diagrams (spec #520 T4, DESIGN §13.2,
 * §13.4, R-PARSE-8, D224, D437) over the parsed corpus: the e2e fixtures, the v12 spec and
 * syntax-page strings and the accepted cases, each in every theme and `theme: 'auto'` set as
 * `initialize()` would (a source's own front matter and directives still win). Sources go through
 * the public API (`prepare` then `renderSync`, `deterministic: true`), the one pipeline
 * (pitfall 24), so its warnings are the parse's too; sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, no element id but the title's and description's, every drawn
 * coordinate inside the viewBox, every alias declared, every parse warning reported by the
 * render. Round-trip: each box and each relation
 * with both ends known has exactly one `data-ast` element (its `g.node`, its
 * `path.relationshipLine`), whose AST node is a `Requirement`, `Element` or `Relation` with its
 * range in the source; repeated definitions and relations to unknown names have none (D434).
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: (typeof THEMES)[number];
  readonly source: string;
  readonly r: RenderResult;
  readonly prepared: Prepared;
  readonly tree: SvgView;
}

/** A fresh API object with `deterministic: true` (the table measurer); requirement is registered. */
function api(): ReturnType<typeof createMermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
}

const ID = 'mermaid-0';
const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Map<string, string>();

beforeAll(async () => {
  corpus = [...(await requirementCorpus()), ...requirementCases()];
  const m = api();
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      const options = { id: ID, config: { theme } };
      let prepared: Prepared;
      let r: RenderResult;
      try {
        prepared = await m.prepare(item.source, options);
        r = m.renderSync(item.source, options);
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        rejected.set(item.id, e.code);
        continue;
      }
      cases.push({
        id: `${item.id} ${theme}`,
        theme,
        source: item.source,
        r,
        prepared,
        tree: parseSvg(r.svg),
      });
    }
}, 600_000);

describe('requirement render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with both markers, dividers, labels and titles', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBeGreaterThanOrEqual(172);
    expect(cases.length).toBeGreaterThan(200 * THEMES.length);
    // Every e2e fixture renders; the title file v13's preprocess rejects is a case (spec #520).
    expect([...rejected.keys()].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(rejected.has('requirement-cases/title-front-matter-unclosed')).toBe(true);
    // Only the parser rejects, and detection, which takes the header as v12 did.
    expect([...rejected].filter(([, code]) => code !== 'SYNTAX')).toEqual([
      ['requirement-cases/header-upper-case', 'UNSUPPORTED_DIAGRAM'],
    ]);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="marker requirement_contains"',
      'class="marker requirement_arrow"',
      'class="divider"',
      'class="edgeLabel"',
      'class="requirementDiagramTitleText"',
      'edge-pattern-dashed',
      'data-color-id="color-',
    ])
      expect(all, part).toContain(part);
  });

  it(
    'writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker',
    { timeout: 120_000 },
    () => {
      for (const c of cases) {
        expect(wellFormed(c.r.svg), c.id).toBeUndefined();
        const themeStyle = String(c.prepared.config.theme) === 'auto';
        expect(() => assertInert(c.r.svg, { themeStyle }), c.id).not.toThrow();
        expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      }
    }
  );

  it(
    'is deterministic: a fresh API object renders the same bytes (R-ARCH-6)',
    { timeout: 120_000 },
    async () => {
      const m = api();
      for (const c of cases.filter((_, i) => i % 3 === 0))
        expect((await m.render(ID, c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
          c.r.svg
        );
    }
  );

  it('writes no element id but its title and description (and the gradient in defs)', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      const allowed = new Set([
        'title#mermaid-0-title',
        'desc#mermaid-0-desc',
        'linearGradient#mermaid-0-gradient',
      ]);
      expect(
        ids.filter((i) => !allowed.has(i)),
        c.id
      ).toEqual([]);
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', { timeout: 60_000 }, () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
    }
  });

  it('reports every warning of the parse (pitfall 24: one pipeline)', () => {
    let warned = 0;
    for (const c of cases) {
      const codes = new Set(c.r.warnings.map((w) => w.code));
      const parsed = c.prepared.parse.diagnostics.filter((d) => d.severity === 'warning');
      warned += parsed.length;
      expect(
        parsed.map((d) => d.code).filter((code) => !codes.has(code)),
        c.id
      ).toEqual([]);
    }
    expect(warned).toBeGreaterThan(0);
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

describe('requirement AST round-trip over the parsed corpus (R-PARSE-8, D437)', () => {
  it(
    'maps each drawn box and relation to exactly one element, and nothing else has data-ast',
    { timeout: 60_000 },
    () => {
      let relations = 0;
      for (const c of cases) {
        const index = astIndex(c.prepared.parse.ast);
        const model = c.prepared.parse.model as RequirementModel;
        const drawn = new Set<string>([
          ...model.requirements.map((b) => b.ast),
          ...model.elements.map((b) => b.ast),
          ...model.relations.filter((r) => r.from && r.to).map((r) => r.ast),
        ]);
        const seen = new Map<string, number>();
        for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
          const id = c.tree.getAttr(el, 'data-ast')!;
          seen.set(id, (seen.get(id) ?? 0) + 1);
          const node = index.get(id);
          const cls = c.tree.getAttr(el, 'class')!.split(' ');
          const tag = c.tree.tag(el);
          if (node?.type === 'Relation') {
            relations++;
            expect([tag, cls.includes('relationshipLine')], `${c.id}: ${id}`).toEqual([
              'path',
              true,
            ]);
          } else {
            expect(node?.type === 'Requirement' || node?.type === 'Element', `${c.id}: ${id}`).toBe(
              true
            );
            expect([tag, cls.includes('node')], `${c.id}: ${id}`).toEqual(['g', true]);
          }
          const { start, end } = node!.range;
          expect(start >= 0 && end > start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
        }
        expect([...seen.keys()].sort(), c.id).toEqual([...drawn].sort());
        expect(
          [...seen.values()].every((n) => n === 1),
          c.id
        ).toBe(true);
      }
      expect(relations).toBeGreaterThan(0);
    }
  );
});
