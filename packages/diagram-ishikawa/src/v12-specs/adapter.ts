/**
 * Test-only adapter for the ported v12 ishikawa parser spec (R-TEST-3): v12's `ishikawa.jison`
 * parser and its `IshikawaDB`, backed by the v13 parse. The spec's expectations are kept as v12
 * wrote them; this file only translates names and shapes:
 *
 * - `ishikawa.parse(text)` throws on an error diagnostic (with its message), as v12 threw on a
 *   syntax error, else hands the model to `ishikawa.yy`;
 * - `IshikawaDB.getRoot()` returns the tree in v12's shape (`{ text, children }`, the effect at
 *   the root) and `getDiagramTitle()` the effect's text, as v12 set it;
 * - `setLogLevel` does nothing: v13 parses without a logger.
 */
import type { IshikawaCause, IshikawaModel } from '../model.ts';
import { parseIshikawa } from '../parser/index.ts';

interface IshikawaNode {
  text: string;
  children: IshikawaNode[];
}

const node = (c: IshikawaCause): IshikawaNode => ({ text: c.text, children: c.causes.map(node) });

export class IshikawaDB {
  model: IshikawaModel | undefined;

  clear(): void {
    this.model = undefined;
  }

  getRoot(): IshikawaNode | undefined {
    const m = this.model;
    return m?.effect && { text: m.effect.text, children: m.causes.map(node) };
  }

  getDiagramTitle(): string {
    return this.model?.effect?.text ?? '';
  }
}

export const ishikawa = {
  yy: undefined as IshikawaDB | undefined,
  parse(text: string): void {
    const result = parseIshikawa(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    if (this.yy) this.yy.model = result.model;
  },
};

export function setLogLevel(_level: string): void {
  // v13 parses without a logger.
}
