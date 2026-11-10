import { beforeAll, describe, expect, it } from 'vitest';
import { agentflowLanguage } from '@mermaid-js/diagram-agentflow/language';
import type { AgentflowFlow } from '@mermaid-js/diagram-agentflow/language';
import type { AstNode, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import type { DocumentSnapshot, TextEdit } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { agentflowCases, agentflowCorpus } from './corpus.ts';
import { agentflowV12Snapshot, sortDiagnostics, type AgentflowSnapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for agentflow (language.md,
 * D99 suite 2, R-LANG-1, #549), checked against mermaid\@12's `AgentFlowDB` over the agentflow
 * corpus and cases (every source v12 accepts and v13 reads without an error):
 * - names (D468): every v12 vertex, connector and flow id and every class resolves to exactly
 *   one definition holding its name, and references from any of its occurrences give the same
 *   list, with that definition in it; a name the service defines in the node name space is a
 *   v12 vertex, connector or flow;
 * - rename: each v12 vertex, connector and flow id and each class renamed to a fresh name reads
 *   back in v12 as the same semantic model with only that name changed;
 * - folding: each multi-line v12 flow body is a `flow` fold range from its `flow` keyword, and
 *   each member has a reference inside one of its bodies.
 *
 * The service loads the facet through the generated registry row (agentflow's manifest
 * `language` entry, #550).
 */
const service = createLanguageService();
beforeAll(() => service.preload({ types: ['agentflow'] }));

const FRESH = 'renamedZq7';
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);
const inside = (r: Range, outer: Range) => outer.start <= r.start && r.end <= outer.end;
const key = (r: Range) => `${r.start}:${r.end}`;

function apply(source: string, edits: readonly TextEdit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/** `value` with `from` written as `to` in every string. */
function modulo(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((v) => modulo(v, from, to));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        modulo(k, from, to) as string,
        modulo(v, from, to),
      ])
    );
  return value;
}

function flowBodies(nodes: readonly AstNode[], into = new Map<string, Range[]>()) {
  for (const n of nodes) {
    if (n.type === 'Flow') {
      const f = n as AgentflowFlow;
      into.set(f.name, [...(into.get(f.name) ?? []), f.range]);
    }
    if (n.children) flowBodies(n.children, into);
  }
  return into;
}

const ids = (list: unknown[]) => list.map((x) => (x as { id: string }).id);

/** An anonymous flow's generated id (`subGraph0`): written nowhere, so no symbol. */
const GENERATED = /^subGraph\d+$/;

/**
 * v12's model with `from` written as `to`, its diagnostics sorted again: the snapshot sorts
 * them by node id, so a rename moves them.
 */
function renamedModel(model: AgentflowSnapshot, from: string, to: string): string {
  const m = modulo(model, from, to) as AgentflowSnapshot;
  return JSON.stringify({ ...m, diagnostics: sortDiagnostics(m.diagnostics) });
}

describe('agentflow definition, references, rename and folding through the service match v12', () => {
  it('over the corpus and the cases', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let names = 0;
    let renames = 0;
    let folds = 0;
    for (const item of [...(await agentflowCorpus()), ...agentflowCases()]) {
      if (item.source.includes(FRESH)) continue;
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || v12.diagramType !== 'agentflow') continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'agentflow') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string): undefined => {
        problems.push(`${item.id}: ${what}`);
      };
      const model: AgentflowSnapshot = agentflowV12Snapshot(v12.db);
      const parsed = agentflowLanguage.parse(item.source, { keepTokens: true });
      const occurrences = (name: string, kinds: readonly string[]): SymbolOccurrence[] =>
        parsed.symbols.filter((s) => s.name === name && kinds.includes(s.kind));
      // Where to put the cursor on an occurrence: inside the quotes of a quoted one.
      const at = (r: Range) =>
        r.start + (/^(?:"`|"|`)/.exec(doc.text.slice(r.start, r.end))?.[0].length ?? 0);

      /** The single definition and the references of `name`, asked at each occurrence. */
      const resolve = (name: string, kinds: readonly string[]): Range | undefined => {
        const all = occurrences(name, kinds);
        if (all.length === 0) {
          if (!GENERATED.test(name)) fail(`${kinds[0]} ${name} has no occurrence`);
          return undefined;
        }
        names++;
        const defs = new Set<string>();
        const refLists = new Set<string>();
        let def: Range | undefined;
        for (const o of all) {
          const d = doc.definition(at(o.range));
          if (!d || text(doc, d) !== name) return fail(`${name}: definition ${d && text(doc, d)}`);
          defs.add(key(d));
          def = d;
          const refs = doc.references(at(o.range));
          if (refs.some((r) => text(doc, r) !== name)) fail(`${name}: a reference is not ${name}`);
          refLists.add(JSON.stringify(refs));
        }
        if (defs.size !== 1) fail(`${name}: ${defs.size} definitions`);
        if (refLists.size !== 1) fail(`${name}: references differ by occurrence`);
        const refs = doc.references(at(all[0]!.range));
        if (!refs.some((r) => r.start === def!.start)) fail(`${name}: definition not referenced`);
        return def;
      };

      /** `name` renamed to {@link FRESH} reads back in v12 as the same model but for the name. */
      const roundTrip = async (name: string, kinds: readonly string[]) => {
        const first = occurrences(name, kinds)[0];
        if (!first) return;
        const result = doc.rename(at(first.range), FRESH);
        if ('refused' in result) return fail(`${name}: rename refused: ${result.refused}`);
        renames++;
        const back = await oracle.parse(apply(item.source, result.edits));
        if (!back.accepted) return fail(`${name}: v12 rejects the renamed text`);
        const after = renamedModel(agentflowV12Snapshot(back.db), FRESH, name);
        if (after !== renamedModel(model, FRESH, FRESH)) fail(`${name}: v12 reads another model`);
      };

      const NODE = ['node', 'subgraph'];
      const flows = ids(model.subGraphs);
      const nodeIds = new Set([...ids(model.vertices), ...ids(model.connectors), ...flows]);
      for (const id of nodeIds) resolve(id, NODE);
      const classes = (model.styling as { classes: { id: string }[] }).classes.map((c) => c.id);
      for (const c of classes) resolve(c, ['class']);
      const defStarts = new Set(
        parsed.symbols.filter((x) => x.role === 'def').map((x) => at(x.range))
      );
      for (const s of parsed.symbols.filter((x) => NODE.includes(x.kind))) {
        if (nodeIds.has(s.name)) continue;
        const d = doc.definition(at(s.range));
        if (d && defStarts.has(d.start)) fail(`${s.name} is defined but is no v12 id`);
      }
      for (const id of nodeIds) await roundTrip(id, NODE);
      for (const c of classes) await roundTrip(c, ['class']);

      const bodies = flowBodies(parsed.ast.children);
      const foldRanges = doc.foldingRanges().filter((f) => f.kind === 'flow');
      for (const s of model.subGraphs as { id: string; nodes: string[] }[]) {
        const mine = bodies.get(s.id) ?? [];
        if (mine.length === 0) {
          fail(`flow ${s.id} has no AST node`);
          continue;
        }
        const regions = mine.map((b) => {
          if (!/[\r\n]/.test(doc.text.slice(b.start, b.end).trimEnd())) return b;
          folds++;
          const f = foldRanges.find(
            (x) =>
              x.range.start === b.start &&
              doc.text.startsWith('flow', b.start) &&
              doc.text.slice(x.range.end, b.end).trim() === ''
          );
          if (!f) fail(`flow ${s.id} has no fold range`);
          return f?.range ?? b;
        });
        for (const member of s.nodes) {
          if (!nodeIds.has(member)) continue;
          const first = occurrences(member, NODE)[0];
          const refs = first ? doc.references(at(first.range)) : [];
          if (!refs.some((r) => regions.some((g) => inside(r, g))))
            fail(`member ${member} of ${s.id} has no reference in its fold range`);
        }
      }
    }
    expect(problems).toEqual([]);
    // 390 sources, 1,133 names, 227 multi-line flow bodies (#549).
    expect(checked).toBeGreaterThan(350);
    expect(names).toBeGreaterThan(1000);
    expect(renames).toBe(names);
    expect(folds).toBeGreaterThan(200);
  }, 600_000);

  it('loads the facet from the generated registry (#550)', () => {
    expect(firstPartyFacets.find((e) => e.type === 'agentflow')?.load).toBeTypeOf('function');
    expect(service.update('x:///a', 'agentflow-beta\n  a --> b\n').facet?.id).toBe('agentflow');
  });
});
