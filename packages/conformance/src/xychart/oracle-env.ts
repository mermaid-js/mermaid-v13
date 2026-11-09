/**
 * What the XY chart oracle needs (spec #426 §Parser): v12 acceptance is "`parse` succeeds and
 * there is a plot", since v12 throws `No Plot to render, please provide a plot with some data`
 * only when the renderer calls `getDrawableElem()`, and v13 reports it at parse (R-PARSE-4). So
 * the xychart parser is wrapped once, when the oracle loads: after v12's own parse, a chart
 * whose DB holds no plot is rejected with v12's message. Everything else runs through to v12's
 * own parser and DB.
 */

interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: unknown }>;
  };
}

interface XyChartDb {
  getXYChartData(): { plots: unknown[] };
}

/** Wrap v12's xychart parser (once, at oracle load). */
export async function patchXyChartOracle(mermaid: MermaidV12): Promise<void> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText('xychart\n  bar [1]\n');
  const db = diagram.db as XyChartDb;
  // v12's `Diagram` keeps its definition's parser (the jison module object, shared by every parse).
  const parser = (diagram as unknown as { parser: { parse(text: string): unknown } }).parser;
  const parse = parser.parse.bind(parser);
  parser.parse = (text: string) => {
    const out = parse(text);
    if (db.getXYChartData().plots.length === 0) {
      throw new Error('No Plot to render, please provide a plot with some data');
    }
    return out;
  };
}
