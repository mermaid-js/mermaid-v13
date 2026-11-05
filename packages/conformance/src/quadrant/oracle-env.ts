/**
 * What the quadrant oracle needs: v12's quadrant DB keeps its builder's data private, so the
 * model a parse built cannot be read back from it. The DB (a module singleton, the grammar's
 * `yy`) is wrapped once, when the oracle loads, to record the calls the grammar makes on it;
 * `clear()`, which v12 calls before each parse, empties the record. Calls run through to v12's
 * own DB, so its state, and `getQuadrantData()` after a parse, are v12's.
 */

/** One call of the grammar on v12's quadrant DB: the method and its (cloned) arguments. */
export type QuadrantCall = readonly [method: string, args: readonly unknown[]];

/** The DB methods the grammar calls, which the recorder wraps. */
const RECORDED = [
  'setQuadrant1Text',
  'setQuadrant2Text',
  'setQuadrant3Text',
  'setQuadrant4Text',
  'setXAxisLeftText',
  'setXAxisRightText',
  'setYAxisBottomText',
  'setYAxisTopText',
  'addPoint',
  'addClass',
  'setDiagramTitle',
  'setAccTitle',
  'setAccDescription',
] as const;

let calls: QuadrantCall[] = [];

/** The calls of the last quadrant parse (valid until the next one). */
export function quadrantCalls(): readonly QuadrantCall[] {
  return calls;
}

interface MermaidV12 {
  mermaidAPI: { getDiagramFromText(text: string): Promise<{ db: unknown }> };
}

/** Wrap v12's quadrant DB to record the grammar's calls (once, at oracle load). */
export async function patchQuadrantOracle(mermaid: MermaidV12): Promise<void> {
  const db = (await mermaid.mermaidAPI.getDiagramFromText('quadrantChart\n')).db as Record<
    string,
    unknown
  >;
  const clear = db.clear as () => void;
  db.clear = () => {
    calls = [];
    clear();
  };
  for (const name of RECORDED) {
    const original = db[name] as (...args: unknown[]) => unknown;
    db[name] = (...args: unknown[]) => {
      const out = original(...args);
      // Recorded after the call: a call v12 rejects (a bad style) throws first.
      calls.push([name, structuredClone(args)]);
      return out;
    };
  }
}
