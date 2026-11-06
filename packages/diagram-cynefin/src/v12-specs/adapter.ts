/**
 * Test-only adapter for the ported v12 cynefin specs (R-TEST-3), backed by the v13 cynefin
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `parser.parse` and `db` stand for v12's `cynefinParser` and `cynefinDb`: `parse` rejects
 *   with the first error's message and loads the model; the getters read it (domains as a
 *   `Map` in the model's order, transitions with `label: undefined` for none, as v12 kept them);
 * - `db.setDomains(blocks)` and `db.setTransitions(transitions)` take v12's Langium AST shapes
 *   (`{ domain, items: [{ label }] }`, `{ from, to, label }`): the adapter writes them out as
 *   cynefin text and parses it, so the DB cases run through the v13 parser too. Blocks add up
 *   over calls and transitions are replaced, as in v12's DB; `null` is ignored.
 */
import type { CynefinModel } from '../model.ts';
import { parseCynefin } from '../parser/index.ts';

interface Block {
  domain: string;
  items?: { label: string }[];
}

interface Transition {
  from: string;
  to: string;
  label?: string;
}

/** A label as a cynefin string: `"…"`, with `\` and `"` escaped (Langium unescapes them). */
const quote = (label: string) => `"${label.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/**
 * v12's `getConfig()`: the 12.2.0 `cynefin` defaults. v13 honours the keys in T5 (#469); until
 * then this is v12's object, which the DB spec only checks is an object.
 */
const V12_CONFIG = {
  useMaxWidth: true,
  width: 800,
  height: 600,
  padding: 40,
  showDomainDescriptions: true,
  boundaryAmplitude: 8,
  seed: 0,
};

class CynefinDB {
  private model: CynefinModel | undefined;
  private blocks: Block[] = [];
  private transitions: Transition[] = [];

  clear(): void {
    this.model = undefined;
    this.blocks = [];
    this.transitions = [];
  }

  load(model: CynefinModel): void {
    this.model = model;
  }

  setDomains(blocks: Block[] | null): void {
    if (!blocks) return;
    this.blocks.push(...blocks);
    this.rebuild();
  }

  setTransitions(transitions: Transition[] | null): void {
    if (!transitions) return;
    this.transitions = [...transitions];
    this.rebuild();
  }

  /** The blocks and transitions set so far, written out as text and parsed. */
  private rebuild(): void {
    const lines = ['cynefin-beta'];
    for (const b of this.blocks) {
      lines.push(b.domain, ...(b.items ?? []).map((i) => `  ${quote(i.label)}`));
    }
    for (const t of this.transitions) {
      lines.push(`${t.from} --> ${t.to}${t.label === undefined ? '' : ` : ${quote(t.label)}`}`);
    }
    const result = parseCynefin(lines.join('\n'));
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    this.model = result.model;
  }

  getDomains(): Map<string, { name: string; items: { label: string }[] }> {
    return new Map(
      (this.model?.domains ?? []).map((d) => [
        d.name,
        { name: d.name, items: d.items.map((i) => ({ label: i.label })) },
      ])
    );
  }

  getTransitions(): { from: string; to: string; label: string | undefined }[] {
    return (this.model?.transitions ?? []).map((t) => ({ from: t.from, to: t.to, label: t.label }));
  }

  getConfig(): Record<string, unknown> {
    return { ...V12_CONFIG };
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

export const db = new CynefinDB();

export const parser = {
  parse(text: string): Promise<void> {
    const result = parseCynefin(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    db.load(result.model);
    return Promise.resolve();
  },
};
