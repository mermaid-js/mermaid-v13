/**
 * What the event modeling oracle needs (#602). v12's event modeling DB keeps Langium's AST in a
 * module variable and builds lanes, boxes and relations only in `getState()`, which measures
 * text in the page:
 * - `setAst` is wrapped once, when the oracle loads, to keep the last AST on the DB object
 *   (`lastAst`), so model parity reads the entities, data blocks, notes and `gwt` specifications
 *   v12 parsed (D526); everything else runs through to v12's own DB;
 * - {@link withStubDocument} runs `getState()` against a stub `document` whose text measures
 *   0 px wide and 1 px high: v12's `calculateTextDimensions` and `wrapLabel` then measure without
 *   a page and never wrap. Lanes, boxes and relations do not depend on sizes; the box positions,
 *   which do, are not compared (T3 #604 lists their difference).
 */

interface MermaidV12 {
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: unknown }>;
  };
}

interface EventModelingDbV12 {
  setAst(ast: unknown): void;
  lastAst?: unknown;
}

/** Wrap v12's event modeling `setAst` (once, at oracle load). */
export async function patchEventModelingOracle(mermaid: MermaidV12): Promise<void> {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText('eventmodeling\ntf 01 evt A');
  const db = diagram.db as EventModelingDbV12;
  const setAst = db.setAst.bind(db);
  db.setAst = (ast: unknown) => {
    db.lastAst = ast;
    setAst(ast);
  };
}

const SVG = 'http://www.w3.org/2000/svg';

/** What a stub setter does: nothing (no style or attribute is read back). */
const ignore = (): undefined => undefined;

interface StubNode {
  ownerDocument: unknown;
  namespaceURI: string;
  parentNode: StubNode | null;
  textContent: string;
  style: Record<string, unknown>;
  setAttribute(): void;
  removeAttribute(): void;
  getAttribute(): null;
  appendChild(child: StubNode): StubNode;
  insertBefore(child: StubNode): StubNode;
  removeChild(child: StubNode): StubNode;
  getBBox(): { x: number; y: number; width: number; height: number };
  getComputedTextLength(): number;
}

/** The DOM d3 and v12's text measuring touch, measuring every text 0 × 1 px. */
function stubDocument(): unknown {
  const doc: Record<string, unknown> = {};
  const element = (namespaceURI: string): StubNode => {
    const node: StubNode = {
      ownerDocument: doc,
      namespaceURI,
      parentNode: null,
      textContent: '',
      style: { setProperty: ignore, removeProperty: ignore, getPropertyValue: () => '' },
      setAttribute: ignore,
      removeAttribute: ignore,
      getAttribute: () => null,
      appendChild(child) {
        child.parentNode = node;
        return child;
      },
      insertBefore(child) {
        return node.appendChild(child);
      },
      removeChild(child) {
        child.parentNode = null;
        return child;
      },
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 1 }),
      getComputedTextLength: () => 0,
    };
    return node;
  };
  const body = element('http://www.w3.org/1999/xhtml');
  Object.assign(doc, {
    documentElement: body,
    body,
    createElementNS: (ns: string) => element(ns || SVG),
    createElement: () => element('http://www.w3.org/1999/xhtml'),
    querySelector: () => body,
    querySelectorAll: () => [],
  });
  return doc;
}

/** Run `fn` with the stub `document` installed (and the previous one put back). */
export function withStubDocument<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const had = 'document' in g;
  const saved = g.document;
  g.document = stubDocument();
  try {
    return fn();
  } finally {
    if (had) g.document = saved;
    else delete g.document;
  }
}
