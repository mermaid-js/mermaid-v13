// cspell:words nonterminal
import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { parseRailroad } from '@mermaid-js/diagram-railroad';
import { renderRailroadForTest, type RenderedRailroad } from '@mermaid-js/diagram-railroad/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { railroadGateCorpus } from './corpus.ts';

/**
 * Render properties of the railroad renderer (spec #526 T4, DESIGN §13.2, §13.4) over the
 * railroad gate corpus (e2e fixtures, v12 spec strings, the cases and the recovery set, each also
 * with CRLF and comment lines), in a classic, a dark redux and an `auto` theme: well-formed XML,
 * the allow-list, render-twice determinism, no NaN/Infinity/undefined, no `foreignObject` or
 * `<marker>`, a `<style>` only for `auto`, every drawn coordinate inside the viewBox (D224), ids
 * only on the title and description, and the AST round-trip (R-PARSE-8).
 *
 * Until T5 (#615) adds the manifest, `createMermaid()` has no railroad plugin: the sources render
 * through the package's harness (`renderRailroadForTest`: the plugin's `parse`, `layout` and
 * `render` with the config and theme the pipeline would build). Sources v13 rejects are the
 * parser's business (#610 parity) and are not rendered.
 *
 * The round-trip rule (D517, pitfall 12): every `Rule` and expression node of the AST maps to
 * exactly one element with its `data-ast`, a `g` (`g.railroad-rule` or `g.railroad-<kind>`, the
 * kind the node's); every `data-ast` names a node; the header, title and accessibility
 * statements have no element of their own; every text's `data-id` names a drawn node.
 */
const THEMES = ['default', 'redux-dark', 'auto'] as const;

interface Case {
  id: string;
  theme: (typeof THEMES)[number];
  source: string;
  result: RenderedRailroad;
  tree: SvgView;
}

const cases: Case[] = [];
let rejected = 0;

beforeAll(async () => {
  const corpus = await railroadGateCorpus();
  for (const item of corpus) {
    const parse = parseRailroad(item.source);
    if (parse.diagnostics.some((d) => d.severity === 'error')) {
      rejected++;
      continue;
    }
    for (const theme of THEMES) {
      const result = await renderRailroadForTest(item.source, { config: { theme } });
      cases.push({
        id: `${theme} ${item.id}`,
        theme,
        source: item.source,
        result,
        tree: parseSvg(result.svg),
      });
    }
  }
}, 600_000);

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

const rootOf = (tree: SvgView): SvgElement => tree.find({ tag: 'svg' })[0]!;

describe('railroad render properties over the corpus', { timeout: 120_000 }, () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(500);
    expect(rejected).toBeGreaterThan(0);
    const kinds = new Set(
      cases.flatMap((c) => c.tree.find({}).map((n) => c.tree.getAttr(n, 'class')))
    );
    for (const k of [
      'railroad-rule',
      'railroad-rule-name',
      'railroad-start',
      'railroad-end',
      'railroad-line',
      'railroad-terminal',
      'railroad-nonterminal',
      'railroad-special',
      'railroad-sequence',
      'railroad-choice',
      'railroad-optional',
      'railroad-repetition',
    ])
      expect(kinds, k).toContain(k);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.result.svg, { themeStyle: c.result.themeStyle }),
        c.id
      ).not.toThrow();
      // A source's own front-matter theme beats the integrator's `auto`.
      expect(c.result.themeStyle, c.id).toBe(c.result.svg.includes('<style'));
    }
    expect(cases.filter((c) => c.result.themeStyle).length).toBeGreaterThan(500);
  });

  it('is deterministic: a second render writes the same bytes (R-ARCH-6)', async () => {
    for (const c of cases) {
      const again = await renderRailroadForTest(c.source, { config: { theme: c.theme } });
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, no foreignObject or marker, a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      if (c.theme !== 'auto') expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox (D224)', () => {
    for (const c of cases) {
      const { tree } = c;
      const [x, y, w, h] = tree.getAttr(rootOf(tree), 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('round-trips the AST: one data-ast g per rule and expression node (R-PARSE-8)', () => {
    for (const c of cases) {
      const { tree } = c;
      const index = astIndex(c.result.ast as AstNode);
      const drawn = new Map<string, SvgElement[]>();
      for (const n of tree.find({})) {
        const id = tree.getAttr(n, 'data-ast');
        if (id === undefined) continue;
        expect(tree.tag(n), `${c.id} ${id}`).toBe('g');
        drawn.set(id, [...(drawn.get(id) ?? []), n]);
      }
      for (const [id, node] of index) {
        const els = drawn.get(id) ?? [];
        if (node.type === 'Document' || node.type === 'Header') expect(els, id).toEqual([]);
        else if (['Title', 'AccTitle', 'AccDescr'].includes(node.type)) expect(els, id).toEqual([]);
        else {
          expect(els.length, `${c.id} ${id}`).toBe(1);
          const want = node.type === 'Rule' ? 'railroad-rule' : `railroad-${node.type}`;
          expect(tree.getAttr(els[0]!, 'class'), `${c.id} ${id}`).toBe(want);
        }
      }
      for (const id of drawn.keys()) expect(index.has(id), `${c.id} ${id}`).toBe(true);
      for (const t of tree.find({ tag: 'text' })) {
        expect(tree.getAttr(t, 'data-ast'), c.id).toBeUndefined();
        expect(drawn.has(tree.getAttr(t, 'data-id') ?? ''), c.id).toBe(true);
      }
    }
  });
});
