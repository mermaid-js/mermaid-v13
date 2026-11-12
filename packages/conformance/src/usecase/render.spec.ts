import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert, type OutlineRole } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderUsecaseForTest, type RenderedUsecase } from '@mermaid-js/diagram-usecase/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { usecaseCases, usecaseCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of usecase (spec #517 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224, D475) over the parsed corpus: the e2e fixtures (the decoded `Hostile("<img …>")`
 * labels of D471 among them), the v12 spec and syntax-page strings and the cases, each in every
 * theme and `theme: 'auto'` set as `initialize()` would (a source's own front matter still
 * wins), and once under `colorScheme: rotate`. Sources go through the plugin's own seam, parse →
 * layout → render, with core's render context (`renderUsecaseForTest`): there is no manifest
 * until T5, and the checks read the layout beside the SVG. Sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` and no `<style>` but `theme: 'auto'`'s, no element id but `<id>-title` and
 * `<id>-desc`, every drawn coordinate inside the viewBox (an oval by its box), every alias
 * declared. Round-trip: every actor, use case, boundary, note, JSON table and relationship has
 * exactly one `data-ast` element, a `<g>` whose `data-id` is its model id; every `data-ast`
 * names an AST node; nothing else carries one.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly rendered: RenderedUsecase;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

async function add(item: CorpusItem, label: string, config: Readonly<Record<string, unknown>>) {
  if (rejected.has(item.id)) return;
  let rendered: RenderedUsecase;
  try {
    rendered = await renderUsecaseForTest(item.source, { config });
  } catch (e) {
    if (!(e as Error).message.startsWith('usecase parse error')) throw e;
    rejected.add(item.id);
    return;
  }
  cases.push({
    id: `${item.id} ${label}`,
    config,
    source: item.source,
    rendered,
    tree: parseSvg(rendered.svg),
  });
}

beforeAll(async () => {
  corpus = [...(await usecaseCorpus()), ...usecaseCases()];
  for (const theme of THEMES) for (const item of corpus) await add(item, theme, { theme });
  for (const item of corpus)
    await add(item, 'rotate', { theme: 'redux-color', usecase: { colorScheme: 'rotate' } });
}, 600_000);

describe('usecase render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every kind of element', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(54);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(cases.length).toBeGreaterThan(100 * THEMES.length);
    const all = cases.map((c) => c.rendered.svg).join('');
    for (const part of [
      'usecase-actor-normal',
      'usecase-actor-hollow',
      'usecase-actor-awesome',
      'usecase-actor-icon',
      'usecase-ellipse',
      'usecase-rect',
      'usecase-business-marker',
      'usecase-stereotype',
      'usecase-note',
      'usecase-json-table',
      'system-boundary-rect',
      'system-boundary-package',
      'relationship-include',
      'relationship-extend',
      'relationship-generalization',
      'marker point',
      'marker circle',
      'marker cross',
      'marker extension',
      'usecaseDiagramTitleText',
      'data-color-id',
    ])
      expect(all, part).toContain(part);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or style sheet', () => {
    for (const c of cases) {
      expect(wellFormed(c.rendered.svg), c.id).toBeUndefined();
      expect(
        () =>
          assertInert(c.rendered.svg, {
            gradient: c.rendered.gradient,
            themeStyle: c.rendered.themeStyle,
          }),
        c.id
      ).not.toThrow();
      expect(c.rendered.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|<marker|<defs/
      );
      expect(c.rendered.svg.includes('<style'), c.id).toBe(c.rendered.themeStyle);
    }
  });

  it('keeps the decoded Hostile("<img …>") labels inert: no element, no handler (D471)', () => {
    const hostile = cases.filter((c) => c.source.includes('Hostile("<img'));
    expect(hostile.length).toBeGreaterThanOrEqual(2 * THEMES.length);
    for (const c of hostile) {
      expect(c.rendered.svg, c.id).not.toMatch(/<img\b/);
      const handlers = c.tree.find((n, t) => t.getAttr(n, 'onerror') !== undefined);
      expect(handlers, c.id).toEqual([]);
      // Shown as text, escaped, as v12 escaped plain labels; the accessible name keeps it too.
      expect(c.rendered.svg, c.id).toContain('&lt;img src=x');
      expect(c.rendered.svg, c.id).toContain(
        'aria-label="use case &lt;img src=x onerror=alert(1)&gt;"'
      );
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderUsecaseForTest(c.source, { config: c.config })).svg, c.id).toBe(
        c.rendered.svg
      );
  });

  it('writes no element id but <id>-title and <id>-desc, each only with its text (D475)', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      const expected = [
        ...(c.rendered.model.accTitle.trim() ? ['title#mermaid-0-title'] : []),
        ...(c.rendered.model.accDescr.trim() ? ['desc#mermaid-0-desc'] : []),
      ];
      expect(ids, c.id).toEqual(expected);
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
      // Ovals, by the layout's boxes, shifted by the title band and centring.
      const p = c.rendered.layout.usecase!;
      const band = p.title ? p.title.height + p.config.diagramPadding : 0;
      const pad = p.config.diagramPadding;
      const dx = p.title ? Math.max(0, (p.title.width + 2 * pad - c.rendered.layout.width) / 2) : 0;
      const boxes = [...c.rendered.layout.nodes.values()].flatMap((b) => [
        { x: b.x - b.width / 2 + dx, y: b.y - b.height / 2 + band },
        { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + band },
      ]);
      expect(boxes.filter(off).slice(0, 2), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.rendered.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.rendered.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });
});

describe('usecase AST round-trip (R-PARSE-8, D475)', () => {
  it('maps every element and relationship to one <g> with its model id, and only those', () => {
    let drawn = 0;
    for (const c of cases.filter((k) => k.id.endsWith(' default'))) {
      const index = astIndex(c.rendered.ast!);
      const m = c.rendered.model;
      const expected = new Map<string, string>();
      for (const e of [...m.actors, ...m.useCases, ...m.boundaries, ...m.notes, ...m.jsonTables])
        expected.set(e.astId, e.id);
      for (const r of m.relationships) expected.set(r.astId, r.id);
      const byAst = new Map<string, string[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        expect(index.has(id), `${c.id}: ${id}`).toBe(true);
        expect(c.tree.tag(el), `${c.id}: ${id}`).toBe('g');
        byAst.set(id, [...(byAst.get(id) ?? []), c.tree.getAttr(el, 'data-id')!]);
      }
      expect(Object.fromEntries([...byAst].sort()), c.id).toEqual(
        Object.fromEntries([...expected].sort().map(([k, v]) => [k, [v]]))
      );
      drawn += expected.size;
    }
    expect(drawn).toBeGreaterThan(900);
  });
});

/** `<g class="outline-…">` around its one path: what the fixture drew. */
const OUTLINED = /<g class="outline-[a-z]+"><path [^>]*\/><\/g>/g;
/**
 * What stays plain under hand-drawn: markers, label backgrounds, business marks (v12 drew them
 * with `append('path')`, never through roughjs) and an icon's glyph.
 */
const PLAIN = [
  /<path class="marker[^"]*"[^>]*\/>/g,
  /<rect class="labelBkg"[^>]*\/>/g,
  /<path class="usecase-business-marker[^"]*"[^>]*\/>/g,
];
const SHAPE = /<(rect|circle|ellipse|polygon|line|path)\b[^>]*>/;
const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

describe('usecase hand-drawn: every outline goes through w.outline (D301, D302, spec #517)', () => {
  it('sends each node, part, frame and line to the drawer, and no marker, mark or text', async () => {
    const roles = new Set<OutlineRole>();
    let compared = 0;
    for (const c of cases.filter((k) => k.id.endsWith(' default'))) {
      const drawn = await renderUsecaseForTest(c.source, {
        config: c.config,
        outline: (role, tag, attrs, sink) => {
          roles.add(role);
          expect(String(attrs.class ?? '')).not.toMatch(/\bmarker\b/);
          return outlineFixture.draw(role, tag, attrs, sink);
        },
      });
      for (const re of [...PLAIN, /<text\b/g, /<tspan\b/g])
        expect(count(drawn.svg, re), `${c.id}: ${String(re)}`).toBe(count(c.rendered.svg, re));
      let rest = drawn.svg.replace(OUTLINED, '');
      for (const re of PLAIN) rest = rest.replace(re, '');
      expect(SHAPE.exec(rest)?.[0], c.id).toBeUndefined();
      compared++;
    }
    expect(compared).toBeGreaterThan(100);
    expect([...roles].sort()).toEqual(['edge', 'group', 'node', 'part']);
  });
});
