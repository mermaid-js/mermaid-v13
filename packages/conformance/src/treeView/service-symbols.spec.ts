import { describe, expect, it } from 'vitest';
import { detectTreeView, parseTreeView } from '@mermaid-js/diagram-treeview';
import type { TreeViewNodeNode } from '@mermaid-js/diagram-treeview';
import { treeViewLanguage } from '@mermaid-js/diagram-treeview/language';
import type { Range } from '@mermaid-js/core/parser-kit';
import { createLanguageService } from '@mermaid-js/language-service';
import type { DocumentSnapshot } from '@mermaid-js/language-service';
import { loadOracle } from '../oracle.ts';
import { treeViewGateCorpus } from './corpus.ts';
import { TREEVIEW_V12_TYPES, treeViewV12Snapshot } from './v12.ts';

/**
 * The oracle expectations re-run through the language service for treeView (language.md step 8,
 * D99 suite 2, R-LANG-1, #576), as `treemap/service-symbols.spec.ts` does for treemap:
 * definition, references and folding asked at the places the parse output records, checked
 * against the mermaid v12 DB over the treeView gate corpus (D487):
 * - v12's nodes, depth first, are the parser's `node` definitions in source order, by name, and
 *   each resolves to itself alone: its definition is its own name, its only reference itself
 *   (names repeat, and each node is a symbol of its own);
 * - each v12 node with nodes under it, written over several lines, has a `node` fold from its
 *   name to the end of its last descendant (v12's depths decide which nodes are under it), and
 *   a multi-line v12 `accDescr` an `accDescr` fold.
 *
 * The facet is passed as an eager row until treeView's manifest has its `language` entry (#577).
 */
const service = createLanguageService({
  facets: [
    {
      type: 'treeView',
      id: 'treeView',
      detector: (t) => detectTreeView(t),
      facet: treeViewLanguage,
    },
  ],
});
const text = (doc: DocumentSnapshot, r: Range) => doc.text.slice(r.start, r.end);

describe('treeView definition, references and folding through the service match v12', () => {
  it('over the gate corpus', async () => {
    const oracle = await loadOracle();
    const problems: string[] = [];
    let checked = 0;
    let nodes = 0;
    let folds = 0;
    let unnamed = 0;
    for (const item of await treeViewGateCorpus()) {
      const v12 = await oracle.parse(item.source);
      if (!v12.accepted || !TREEVIEW_V12_TYPES.includes(v12.diagramType)) continue;
      const doc = service.update(`corpus:///${item.id}`, item.source);
      if (doc.facet?.id !== 'treeView') continue;
      if (doc.diagnostics().some((d) => d.severity === 'error')) continue;
      checked++;
      const fail = (what: string) => problems.push(`${item.id}: ${what}`);
      const rows = treeViewV12Snapshot(v12.db).rows;
      const parsed = parseTreeView(item.source);
      const defs = parsed.symbols.filter((s) => s.kind === 'node');
      const astNodes = parsed.ast.children.filter((n): n is TreeViewNodeNode => n.type === 'Node');
      if (defs.length !== rows.length || astNodes.length !== rows.length) {
        fail(`${rows.length} v12 nodes, ${defs.length} node symbols, ${astNodes.length} nodes`);
        continue;
      }
      const folding = doc.foldingRanges();
      rows.forEach(([depth, name], i) => {
        nodes++;
        const s = defs[i]!;
        if (s.name !== name || s.role !== 'def') fail(`node ${i}: ${s.role} ${s.name} for ${name}`);
        // The occurrence is the name inside its quotes, without a directory's `/`. A name not
        // written as v12 reads it (an entity placeholder) or empty is no occurrence at all.
        const inside = astNodes[i]!;
        const own = doc.definition(s.range.start + (/^["']/.test(text(doc, s.range)) ? 1 : 0));
        const written = text(doc, s.range).replace(/^(["'])(.*)\1$/s, '$2');
        if (name === '' || (written !== name && written !== `${name}/`)) {
          unnamed++;
          if (own) fail(`node ${name}: written otherwise, but it has a definition`);
        } else {
          if (!own || text(doc, own) !== name)
            fail(`node ${name}: definition ${JSON.stringify(own)}`);
          const refs = doc.references(own?.start ?? s.range.start);
          if (refs.length !== 1 || refs[0]?.start !== own?.start)
            fail(`node ${name}: ${refs.length} references`);
        }
        // Its subtree: the rows after it that v12 placed deeper.
        let last = i;
        while ((rows[last + 1]?.[0] ?? -1) > depth) last++;
        if (last === i) return;
        const range = { start: inside.range.start, end: astNodes[last]!.range.end };
        if (!/[\r\n]/.test(text(doc, range))) return;
        folds++;
        if (
          !folding.some(
            (f) => f.kind === 'node' && f.range.start === range.start && f.range.end === range.end
          )
        )
          fail(`the node ${name} has no fold over its subtree`);
      });
      const accDescr = treeViewV12Snapshot(v12.db).accDescr;
      if (/[\r\n]/.test(accDescr) && !folding.some((f) => f.kind === 'accDescr'))
        fail('a multi-line accDescr has no fold range');
    }
    process.stdout.write(
      `treeView service symbols: ${checked} sources, ${nodes} nodes, ${folds} folds, ${unnamed} written otherwise\n`
    );
    expect(checked).toBeGreaterThan(500);
    expect(nodes).toBeGreaterThan(2000);
    expect(folds).toBeGreaterThan(500);
    // Entity placeholders and empty names, each also CRLF and commented.
    expect(unnamed).toBeLessThan(40);
    expect(problems).toEqual([]);
  }, 300_000);
});
