/**
 * Test-only adapter for the ported v12 sankey spec (R-TEST-3): v12's `sankey.jison` parser, its
 * sankey DB and the two text helpers the spec calls, backed by the v13 parse. The spec's
 * expectations are kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `sankey.parser.parse(text)` throws on an error diagnostic, as v12's jison threw on a syntax
 *   error, else hands the model to `sankey.parser.yy`;
 * - `db.getGraph()` returns v12's `{ nodes: [{ id }], links: [{ source, target, value }] }`;
 * - `cleanupComments` and `prepareTextForParsing` are the identity: the v13 parser runs v12's
 *   whole preprocessing (comments, sankey's trimming and collapsed blank lines) itself.
 */
import { parseSankey } from '../parser/index.ts';
import type { SankeyModel } from '../model.ts';

class SankeyDB {
  model: SankeyModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  getGraph(): {
    nodes: { id: string }[];
    links: { source: string; target: string; value: number }[];
  } {
    const m = this.model;
    return {
      nodes: m ? m.nodes.map((n) => ({ id: n.id })) : [],
      links: m ? m.links.map((l) => ({ source: l.source, target: l.target, value: l.value })) : [],
    };
  }
}

export const db = new SankeyDB();

export const sankey = {
  parser: {
    yy: undefined as SankeyDB | undefined,
    parse(text: string): void {
      const result = parseSankey(text);
      const error = result.diagnostics.find((d) => d.severity === 'error');
      if (error) throw new Error(error.message);
      if (this.yy) this.yy.model = result.model;
    },
  },
};

/** v12's `cleanupComments`: the v13 parser removes comment lines itself. */
export const cleanupComments = (text: string): string => text;

/** v12's `prepareTextForParsing`: the v13 parser trims and collapses blank lines itself. */
export const prepareTextForParsing = (text: string): string => text;
