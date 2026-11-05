/**
 * Test-only adapter for the ported v12 pie specs (R-TEST-3), backed by the v13 pie parse. The
 * specs' expectations are kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `parser.parse` and `db` stand for v12's `pieParser` and `pieDb`: `parse` rejects with the
 *   first error's message, and the getters read the model (sections as a `Map`, in order);
 * - `pieParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as Langium
 *   built it (every section, the last of each text statement), and the errors are the syntax
 *   errors (a negative value is the DB's error, not Langium's).
 */
import { parsePie } from '../parser/index.ts';
import type { PieModel } from '../model.ts';

/** The specs set `securityLevel`; the parse reads no config. */
export function setConfig(next: Record<string, unknown>): void {
  void next;
}

/** v12's pie DB defaults; its `config` is read only by the skipped `getConfig` spec. */
export const DEFAULT_PIE_DB = {
  sections: new Map<string, number>(),
  showData: false,
  config: {},
};

class PieDB {
  private model: PieModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  load(model: PieModel): void {
    this.model = model;
  }

  getSections(): Map<string, number> {
    return new Map((this.model?.sections ?? []).map((s) => [s.label, s.value]));
  }

  getShowData(): boolean {
    return this.model?.showData ?? false;
  }

  getDiagramTitle(): string {
    return this.model?.title ?? '';
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

export const db = new PieDB();

export const parser = {
  parse(text: string): Promise<void> {
    const result = parsePie(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    db.load(result.model);
    return Promise.resolve();
  },
};

/** Langium's AST type name of the root. */
export const Pie = { $type: 'Pie' };

interface LangiumPie {
  $type: 'Pie';
  showData: boolean;
  sections: { $type: 'PieSection'; label: string; value: number }[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

export function pieParse(text: string): {
  value: LangiumPie;
  lexerErrors: string[];
  parserErrors: string[];
} {
  const { ast, diagnostics } = parsePie(text);
  const value: LangiumPie = { $type: 'Pie', showData: false, sections: [] };
  for (const node of ast.children) {
    if (node.type === 'Header') value.showData = node.showData;
    else if (node.type === 'Slice') {
      value.sections.push({ $type: 'PieSection', label: node.label, value: node.value });
    } else if (node.type === 'Title') value.title = node.text;
    else if (node.type === 'AccTitle') value.accTitle = node.text;
    else value.accDescr = node.text;
  }
  const errors = diagnostics.filter(
    (d) => d.severity === 'error' && d.code !== 'PIE_NEGATIVE_VALUE'
  );
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}

export function expectNoErrorsOrAlternatives(result: ReturnType<typeof pieParse>): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}
