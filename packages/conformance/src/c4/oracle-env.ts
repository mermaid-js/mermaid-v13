/**
 * What the C4 oracle needs (spec #522 §Parser, T2):
 *
 * - v12's C4 DB never clears commonDb's accessibility values (`clear()` misses them, and
 *   `mermaidAPI.reset()` does not reach them), so an `accDescr` leaks into every later parse. The
 *   wrapped parser clears both before each parse: each case is read on its own, as a fresh page
 *   reads it;
 * - v12 acceptance is "`parse` succeeds and every relation's ends name a shape or boundary": v12
 *   threw `C4 rel "a" -> "b" references an unknown shape or boundary` only when the renderer drew
 *   the relations, and v13 reports it at parse (D457). After v12's own parse, a relation whose end
 *   `getC4Shape` cannot find (shapes, then boundaries, as `drawRels` looks them up) rejects the
 *   source with v12's message.
 *
 * The parser is wrapped once, when the oracle loads; everything else runs through to v12's own
 * parser and DB.
 */

interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: unknown }>;
  };
}

interface C4DbV12 {
  setAccTitle(text: string): void;
  setAccDescription(text: string): void;
  getRels(): { from: unknown; to: unknown }[];
  getC4Shape(alias: unknown): unknown;
}

/** Wrap v12's C4 parser (once, at oracle load). */
export async function patchC4Oracle(mermaid: MermaidV12): Promise<void> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText('C4Context\nPerson(a, "A")');
  const db = diagram.db as C4DbV12;
  // v12's `Diagram` keeps its definition's parser (the jison module object, shared by every parse).
  const parser = (diagram as unknown as { parser: { parse(text: string): unknown } }).parser;
  const parse = parser.parse.bind(parser);
  parser.parse = (text: string) => {
    db.setAccTitle('');
    db.setAccDescription('');
    const out = parse(text);
    for (const rel of db.getRels()) {
      if (db.getC4Shape(rel.from) === undefined || db.getC4Shape(rel.to) === undefined) {
        throw new Error(
          `C4 rel "${String(rel.from)}" -> "${String(rel.to)}" references an unknown shape or boundary`
        );
      }
    }
    return out;
  };
}
