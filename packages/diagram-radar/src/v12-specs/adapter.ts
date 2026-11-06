/**
 * Test-only adapter for the ported v12 radar specs (R-TEST-3), backed by the v13 radar parse.
 * The specs' expectations are kept as v12 wrote them; this file only translates names and
 * shapes:
 *
 * - `parser.parse` and `db` stand for v12's radar `parser` and `db`: `parse` rejects with the
 *   first error's message, and the getters read the model as v12's DB held it (axes and curves
 *   as `{ name, label }`, entries as numbers, the options);
 * - `radarParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as Langium
 *   built it (every axis, curve, entry and option, the last of each text statement), and the
 *   errors are the syntax errors (v12's DB threw the semantic ones, not Langium);
 * - `parseAsync('radar', text)` stands for `@mermaid-js/parser`'s `parse`: it rejects with a
 *   {@link MermaidParseError} whose message places each syntax error as v12's did;
 * - `relativeRadius` is the layout's; `closedRoundCurve`, `Diagram` and `mermaidAPI` serve
 *   only skipped renderer specs (#448).
 */
import { LineIndex } from '@mermaid-js/core/parser-kit';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { relativeRadius } from '../layout/index.ts';
import type { RadarModel } from '../model.ts';
import { parseRadar, RADAR_MISSING_ENTRY, RADAR_NO_AXES } from '../parser/index.ts';

export { relativeRadius };

const notPorted = (): never => {
  throw new Error('v12 renderer API: ported with the renderer (#448)');
};
export const closedRoundCurve = notPorted;
export const Diagram = { fromText: notPorted };
export const mermaidAPI = { parse: notPorted };

/** v12's radar DB: plain functions (the spec reads them off the object), over the last parsed model. */
function radarDb() {
  let model: RadarModel | undefined;
  return {
    clear(): void {
      model = undefined;
    },
    load(next: RadarModel): void {
      model = next;
    },
    getAxes(): { name: string; label: string }[] {
      return (model?.axes ?? []).map((a) => ({ name: a.name, label: a.label }));
    },
    getCurves(): { name: string; label: string; entries: number[] }[] {
      return (model?.curves ?? []).map((c) => ({
        name: c.name,
        label: c.label,
        entries: c.entries.map((e) => e.value),
      }));
    },
    getOptions(): RadarModel['options'] {
      return {
        showLegend: true,
        ticks: 5,
        max: null,
        min: 0,
        graticule: 'circle',
        ...model?.options,
      };
    },
    getDiagramTitle: (): string => model?.title ?? '',
    getAccTitle: (): string => model?.accTitle ?? '',
    getAccDescription: (): string => model?.accDescr ?? '',
  };
}

export const db = radarDb();

export const parser = {
  parse(text: string): Promise<void> {
    const result = parseRadar(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    db.load(result.model);
    return Promise.resolve();
  },
};

/** v12's DB checks, which Langium's parse never ran. */
const SEMANTIC = new Set([RADAR_MISSING_ENTRY, RADAR_NO_AXES]);
const syntaxErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.severity === 'error' && !SEMANTIC.has(d.code));

/** Langium's AST type name of the root. */
export const Radar = { $type: 'Radar' };

interface LangiumEntry {
  $type: 'Entry';
  axis?: { $refText: string };
  value: number;
}

interface LangiumRadar {
  $type: 'Radar';
  axes: { $type: 'Axis'; name: string; label?: string }[];
  curves: { $type: 'Curve'; name: string; label?: string; entries: LangiumEntry[] }[];
  options: { $type: 'Option'; name: string; value: boolean | number | string }[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

export function radarParse(text: string): {
  value: LangiumRadar;
  lexerErrors: string[];
  parserErrors: string[];
} {
  const { ast, diagnostics } = parseRadar(text);
  const value: LangiumRadar = { $type: 'Radar', axes: [], curves: [], options: [] };
  for (const node of ast.children) {
    if (node.type === 'Axis')
      value.axes.push({ $type: 'Axis', name: node.name, label: node.label });
    else if (node.type === 'Curve') {
      value.curves.push({
        $type: 'Curve',
        name: node.name,
        label: node.label,
        entries: node.children.map((e) => ({
          $type: 'Entry',
          value: e.value,
          ...(e.axis === undefined ? {} : { axis: { $refText: e.axis } }),
        })),
      });
    } else if (node.type === 'Option') {
      value.options.push({ $type: 'Option', name: node.name, value: node.value });
    } else if (node.type === 'Title') value.title = node.text;
    else if (node.type === 'AccTitle') value.accTitle = node.text;
    else if (node.type === 'AccDescr') value.accDescr = node.text;
  }
  const errors = syntaxErrors(diagnostics);
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}

export function expectNoErrorsOrAlternatives(result: ReturnType<typeof radarParse>): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}

/** v12's `MermaidParseError`: every syntax error with its 1-based line and column. */
export class MermaidParseError extends Error {}

export function parseAsync(type: string, text: string): Promise<LangiumRadar> {
  if (type !== 'radar') return Promise.reject(new Error(`not ported: ${type}`));
  const errors = syntaxErrors(parseRadar(text).diagnostics);
  if (errors.length === 0) return Promise.resolve(radarParse(text).value);
  const lines = new LineIndex(text);
  const placed = errors.map((d) => {
    const { line, column } = lines.position(d.range.start);
    return `Parse error on line ${line + 1}, column ${column + 1}: ${d.message}`;
  });
  return Promise.reject(new MermaidParseError(`Parsing failed: ${placed.join('\n')}`));
}
