/**
 * Test-only adapter for the ported v12 venn parser spec (R-TEST-3): v12's `venn.jison` parser
 * and its venn DB, backed by the v13 parse. The spec's expectations are kept as v12 wrote them;
 * this file only translates names and shapes:
 *
 * - `venn.parse(text)` throws on an error diagnostic (with its message, which starts with v12's
 *   for the DB's two errors), as v12 threw on a syntax error and its DB on a bad `union`, else
 *   hands the model to `venn.parser.yy`;
 * - the DB's getters return the model in v12's shapes: `getSubsetData()` (`sets`, `size`,
 *   `label`), `getTextData()` (`sets`, `id`, `label`), `getStyleData()` (`targets`, `styles`)
 *   and `getDiagramTitle()`.
 */
import type { VennModel } from '../model.ts';
import { parseVenn } from '../parser/index.ts';

class VennDB {
  model: VennModel | undefined;
  /** v12's logger hook, which the spec sets; v13 parses without a logger. */
  getLogger: unknown;

  clear(): void {
    this.model = undefined;
  }

  getDiagramTitle(): string {
    return this.model?.title ?? '';
  }

  getSubsetData(): { sets: string[]; size: number; label: string | undefined }[] {
    return (this.model?.subsets ?? []).map((s) => ({
      sets: [...s.sets],
      size: s.size,
      label: s.label,
    }));
  }

  getTextData(): { sets: string[]; id: string; label: string | undefined }[] {
    return (this.model?.textNodes ?? []).map((t) => ({
      sets: [...t.sets],
      id: t.id,
      label: t.label,
    }));
  }

  getStyleData(): { targets: string[]; styles: Record<string, string> }[] {
    return (this.model?.styles ?? []).map((s) => ({
      targets: [...s.targets],
      styles: { ...s.properties },
    }));
  }
}

export const db = new VennDB();

const parser = { yy: undefined as VennDB | undefined };

export default {
  parser,
  parse(text: string): void {
    const result = parseVenn(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    if (parser.yy) parser.yy.model = result.model;
  },
};
