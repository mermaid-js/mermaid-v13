/**
 * Test-only adapter for the ported v12 pie specs (R-TEST-3), backed by the v13 pie parse. The
 * specs' expectations are kept as v12 wrote them; this file only translates names and shapes:
 *
 * - `parser.parse` and `db` stand for v12's `pieParser` and `pieDb`: `parse` rejects with the
 *   first error's message, and the getters read the model (sections as a `Map`, in order);
 * - `pieParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as Langium
 *   built it (every section, the last of each text statement), and the errors are the syntax
 *   errors (a negative value is the DB's error, not Langium's);
 * - `draw` stands for v12's `pieRenderer.draw`: it lays out and renders the loaded model with
 *   the v13 layout and renderer, and `document` answers the renderer spec's DOM reads from the
 *   rendered tree: `body.innerHTML =` clears it, `querySelectorAll('.<class>')` finds elements
 *   by class, and an element's `__data__.data` is the section its `data-id` names, as d3
 *   bound it in v12.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { treeWriter, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { layoutPie } from '../layout/index.ts';
import { parsePie } from '../parser/index.ts';
import { renderPie } from '../render/index.ts';
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

  /** The loaded model, for `draw`. */
  current(): PieModel | undefined {
    return this.model;
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

/** The tree the last `draw` rendered, and the model it drew. */
let drawn: { tree: SvgTree; model: PieModel } | undefined;

/** v12 `draw(text, id, version, diagObj)`: renders the model `diagObj.db` holds. */
export async function draw(
  _text: string,
  _id: string,
  version: string,
  diagObj: { db: PieDB }
): Promise<void> {
  const model = diagObj.db.current();
  if (!model) throw new Error('draw: nothing parsed');
  const theme = createTheme(await loadTheme('default'));
  const ctx = {
    config: { pie: {} } as unknown as ResolvedConfig,
    theme,
    measurer: tableMeasurer,
    warn: () => undefined,
    idPrefix: 'my-svg',
    version,
  };
  const w = treeWriter();
  renderPie(model, layoutPie(model, ctx), ctx, w);
  w.finish();
  drawn = { tree: w.tree, model };
}

/** An element as the spec reads it: an attribute, and the datum d3 bound to it. */
interface Element {
  readonly __data__: { readonly data?: { readonly label: string; readonly value: number } };
  getAttribute(name: string): string | null;
}

export const document = {
  body: {
    set innerHTML(_html: string) {
      drawn = undefined;
    },
  },
  querySelectorAll(selector: string): Element[] {
    const m = /^\.([\w-]+)$/.exec(selector);
    if (!m) throw new Error(`document shim: unsupported selector ${selector}`);
    if (!drawn) return [];
    const { tree, model } = drawn;
    const nodes = tree.find((n: SvgNode, t: SvgTree) =>
      (t.getAttr(n, 'class') ?? '').split(' ').includes(m[1]!)
    );
    return nodes.map((n) => {
      const id = tree.getAttr(n, 'data-id');
      const section = model.sections.find((s) => s.astId === id);
      return {
        __data__: { data: section && { label: section.label, value: section.value } },
        getAttribute: (name: string) =>
          tree.getAttr(n, name as Parameters<SvgTree['getAttr']>[1]) ?? null,
      };
    });
  },
};
