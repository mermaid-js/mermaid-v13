/**
 * Test-only adapter for the ported v12 quadrant specs (R-TEST-3): v12's `quadrant.jison` parser
 * and `quadrantDb`, backed by the v13 parse. The specs' expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `parser.parse(text)` throws on an error diagnostic (v12's DB threw on a bad style too), else
 *   calls `parser.yy` (the spec's mock DB) as v12's grammar did, statement by statement: labels
 *   untrimmed as `{ text, type }`, `" ⟶ "` added to a start label that ends in `-->`, styles as
 *   trimmed strings, `''` for a point without a class;
 * - `quadrantDb.parseStyles` checks styles as v13 does and returns v12's `StylesObject`
 *   (`strokeWidth` as written, `10px`).
 */
import { parseQuadrant } from '../parser/index.ts';
import type { QuadrantTextNode } from '../parser/index.ts';
import { applyStyle } from '../parser/styles.ts';
import type { QuadrantStyles } from '../model.ts';

type Db = Record<string, ((...args: unknown[]) => unknown) | undefined>;

const lexText = (t: QuadrantTextNode, suffix = '') => ({
  text: t.text + suffix,
  type: t.markdown ? 'markdown' : 'text',
});

export const parser = {
  yy: {} as Db,
  parse(text: string): void {
    const result = parseQuadrant(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    const yy = parser.yy;
    for (const n of result.ast.children) {
      if (n.type === 'Quadrant') yy[`setQuadrant${n.quadrant}Text`]?.(lexText(n.label));
      else if (n.type === 'Axis') {
        const end = n.children?.[0];
        const [start, other] =
          n.axis === 'x'
            ? ['setXAxisLeftText', 'setXAxisRightText']
            : ['setYAxisBottomText', 'setYAxisTopText'];
        yy[start]?.(lexText(n.label, n.arrow && !end ? ' ⟶ ' : ''));
        if (end) yy[other]?.(lexText(end.label));
      } else if (n.type === 'Title') yy.setDiagramTitle?.(n.text);
      else if (n.type === 'AccTitle') yy.setAccTitle?.(n.text);
      else if (n.type === 'AccDescr') yy.setAccDescription?.(n.text);
      else if (n.type === 'Point') {
        const styles = n.styles.map((s) => s.text);
        yy.addPoint?.(lexText(n.label), n.className ?? '', n.x, n.y, styles);
      } else if (n.type === 'ClassDef') {
        yy.addClass?.(
          n.name,
          n.styles.map((s) => s.text)
        );
      }
    }
  },
};

export const quadrantDb = {
  parseStyles(styles: string[]): Record<string, unknown> {
    const out: { -readonly [K in keyof QuadrantStyles]: QuadrantStyles[K] } = {};
    for (const style of styles) {
      const problem = applyStyle(style, out);
      if (problem) throw new Error(problem.message);
    }
    const { strokeWidth, ...rest } = out;
    return strokeWidth === undefined ? rest : { ...rest, strokeWidth: `${strokeWidth}px` };
  },
  clear(): void {
    // v13 keeps no state between parses.
  },
  setXAxisLeftText(): void {
    // Only the skipped getConfig spec calls it.
  },
};

/** v12's `diagramAPI`, for the skipped getConfig spec. */
export const diagramAPI = { getConfig: (): Record<string, unknown> => ({}) };
