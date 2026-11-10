import { describe, expect, it } from 'vitest';
import { parseC4 } from '@mermaid-js/diagram-c4';
import type { C4BoundaryNode, C4StatementNode } from '@mermaid-js/diagram-c4';
import { detectC4 } from '@mermaid-js/diagram-c4/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { c4GateCorpus } from './corpus.ts';
import { c4V12Snapshot } from './v12.ts';
import type { C4Snapshot } from './v12.ts';
import { c4V13Snapshot } from './v13.ts';

/**
 * The oracle expectations re-run through the language service for C4 (language.md, D99 suite
 * 2, R-LANG-1, #543, D458), checked against the mermaid v12 DB over the c4 gate corpus:
 * - aliases: every v12 shape and boundary whose alias the source writes as it is (bare or in
 *   its quotes) has exactly one definition, the alias of its first statement; every other
 *   statement with that alias, and every v12 relation end and `Update…Style` target naming it,
 *   is a reference to it, looked up as v12 looks a relation end up (a shape first, else a
 *   boundary);
 * - rename: each such alias renamed to a fresh name, v12 reads the new text with that alias
 *   changed, in its own list and in every relation end naming it, and nothing else;
 * - folding: every v12 boundary that holds a shape or boundary on a later line folds from its
 *   statement to its `}`.
 *
 * Sources whose items v12 reads otherwise than v13 are left out: those are the listed parity
 * divergences (D452's lexing: an unquoted argument v12 ran over `)` and line breaks).
 *
 * The service loads the facet from the generated registry row (#542), as kanban's does.
 */
const service = createLanguageService();
await service.preload({ types: ['c4'] });

const key = (r: Range) => `${r.start}:${r.end}`;
const FRESH = 'renamedZq7';

function apply(text: string, edits: readonly { range: Range; newText: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/** Every element and boundary statement, in source order, at any depth. */
function statements(list: readonly C4StatementNode[], out: C4StatementNode[] = []) {
  for (const n of list) {
    out.push(n);
    if (n.type === 'Boundary') statements(n.children, out);
  }
  return out;
}

/** `snapshot` with alias `from` of the given kind written `to` (and every end naming it). */
function renamed(s: C4Snapshot, from: string, to: string, shape: boolean): C4Snapshot {
  const end = (a: string) => {
    if (a !== from) return a;
    // A relation end names a shape first.
    const isShape = s.shapes.some((x) => x.alias === from);
    return isShape === shape ? to : a;
  };
  const parent = (p: string) => (!shape && p === from ? to : p);
  return {
    ...s,
    shapes: s.shapes.map((x) => ({
      ...x,
      alias: shape && x.alias === from ? to : x.alias,
      parent: parent(x.parent),
    })),
    boundaries: s.boundaries.map((x) => ({
      ...x,
      alias: !shape && x.alias === from ? to : x.alias,
      parent: parent(x.parent),
    })),
    rels: s.rels.map((r) => ({ ...r, from: end(r.from), to: end(r.to) })),
  };
}

describe('c4 symbols and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let aliases = 0;
    let merged = 0;
    let ends = 0;
    let renames = 0;
    let refusals = 0;
    let divergent = 0;
    let folds = 0;
    for (const item of await c4GateCorpus()) {
      if (item.source.includes(FRESH) || !detectC4(item.source)) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'c4') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'c4') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      const model = c4V12Snapshot(v12.db);
      const parsed = parseC4(item.source);
      const items = (x: C4Snapshot) => JSON.stringify([x.shapes, x.boundaries, x.rels]);
      if (items(model) !== items(c4V13Snapshot(parsed.model))) {
        divergent++;
        continue;
      }
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const all = statements(parsed.ast.children);
      const shapeAliases = new Set(model.shapes.map((s) => s.alias));
      const boundaryAliases = new Set(model.boundaries.map((b) => b.alias));

      // Each alias: one definition, at its first statement; its other statements refer to it.
      const lists: [string, 'element' | 'boundary', C4StatementNode['type']][] = [
        ...[...shapeAliases].map(
          (a) => [a, 'element', 'Element'] as [string, 'element', 'Element']
        ),
        ...[...boundaryAliases].map(
          (a) => [a, 'boundary', 'Boundary'] as [string, 'boundary', 'Boundary']
        ),
      ];
      for (const [alias, kind, type] of lists) {
        if (alias === '') continue;
        const nodes = all.filter((n) => n.type === type && 'alias' in n && n.alias === alias);
        const first = nodes[0];
        const arg = first?.args[0];
        // Given by a named `$alias` (the statement's own alias is another), or v12 read the
        // statements apart (a listed D452 divergence): no statement writes it first.
        if (!first || !arg || arg.name !== undefined) continue;
        const written = item.source.slice(arg.range.start, arg.range.end);
        // Not written as it is (an entity, a named `$alias`): no symbol, as the service wants.
        if (written !== alias && written !== `"${alias}"`) continue;
        aliases++;
        const inner =
          written === alias ? arg.range : { start: arg.range.start + 1, end: arg.range.end - 1 };
        const d = doc.definition(inner.start);
        if (!d || key(d) !== key(inner)) fail(`${kind} ${alias}: definition ${d && key(d)}`);
        const refs = new Set(doc.references(inner.start).map(key));
        for (const later of nodes.slice(1)) {
          const a = later.args[0];
          if (!a || item.source.slice(a.range.start, a.range.end) !== alias) continue;
          merged++;
          if (!refs.has(key(a.range))) fail(`${kind} ${alias}: merged statement not a reference`);
        }
        // Relation ends and style targets naming it, as v12 looks them up.
        const named = (a: string) =>
          a === alias && (kind === 'element' ? shapeAliases.has(a) : !shapeAliases.has(a));
        for (const n of all) {
          if (n.type !== 'Relation' && n.type !== 'Style') continue;
          const index = n.macro === 'RelIndex' ? 1 : 0;
          const slots =
            n.type === 'Relation' || n.macro === 'UpdateRelStyle'
              ? [index, index + 1]
              : n.macro === 'UpdateElementStyle'
                ? [0]
                : [];
          for (const k of slots) {
            const a = n.args[k];
            if (!a || a.name !== undefined || !named(a.value)) continue;
            const text = item.source.slice(a.range.start, a.range.end);
            const r =
              text === alias
                ? a.range
                : text === `"${alias}"`
                  ? { start: a.range.start + 1, end: a.range.end - 1 }
                  : undefined;
            if (!r) continue;
            ends++;
            if (!refs.has(key(r)))
              fail(`${kind} ${alias}: ${n.macro} argument ${k + 1} not a reference`);
          }
        }

        // A rename changes that alias in v12's DB and nothing else. It is refused when an
        // occurrence is not written as the alias (a directive or an entity in it): the service
        // could not rename it.
        const readable = parsed.symbols
          .filter((x) => x.name === alias && x.kind === kind)
          .every((x) => {
            const at = item.source.slice(x.range.start, x.range.end);
            return at === alias || at === `"${alias}"`;
          });
        const result = doc.rename(inner.start, FRESH);
        if ('refused' in result) {
          if (readable) fail(`${kind} ${alias}: rename refused: ${result.refused}`);
          else refusals++;
          continue;
        }
        if (!readable) fail(`${kind} ${alias}: renamed with an occurrence it cannot rename`);
        const after = await oracle.parse(apply(item.source, result.edits));
        const got = after.accepted ? c4V12Snapshot(after.db) : undefined;
        const want = renamed(model, alias, FRESH, kind === 'element');
        if (JSON.stringify(got) !== JSON.stringify(want))
          fail(`${kind} ${alias}: rename changes more`);
        else renames++;
      }

      // Folding: a boundary holding something on a later line folds over it.
      const ranges = doc.foldingRanges().filter((f) => f.kind === 'boundary');
      const lineOf = (offset: number) => item.source.slice(0, offset).split('\n').length;
      for (const b of model.boundaries) {
        const holds =
          model.shapes.some((s) => s.parent === b.alias) ||
          model.boundaries.some((x) => x.parent === b.alias);
        const node = all.find(
          (n): n is C4BoundaryNode => n.type === 'Boundary' && n.alias === b.alias
        );
        if (!holds || !node || lineOf(node.range.end) === lineOf(node.range.start)) continue;
        folds++;
        const f = ranges.find((x) => x.range.start === node.range.start);
        if (!f) fail(`boundary ${b.alias} has no fold`);
        else if (!item.source.slice(f.range.start, f.range.end).trimEnd().endsWith('}'))
          fail(`boundary ${b.alias}: fold does not reach its }`);
      }
    }
    expect(problems).toEqual([]);
    // Measured: 1,550 sources checked, 299 left out, 4,045 aliases, 18 merged statements, 3,963
    // ends, 3,998 renames, 47 refusals, 807 folds.
    expect(checked).toBeGreaterThan(1500);
    expect(divergent).toBeLessThan(checked / 4);
    expect(aliases).toBeGreaterThan(4000);
    expect(merged).toBeGreaterThan(10);
    expect(ends).toBeGreaterThan(3900);
    expect(renames + refusals).toBe(aliases);
    expect(refusals).toBeGreaterThan(10);
    expect(folds).toBeGreaterThan(800);
  }, 600_000);
});
