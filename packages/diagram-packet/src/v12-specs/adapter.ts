/**
 * Test-only adapter for the ported v12 packet specs (R-TEST-3), backed by the v13 packet parse.
 * The specs' expectations are kept as v12 wrote them; this file only translates names and
 * shapes:
 *
 * - `parser.parse` and `PacketDB` stand for v12's packet parser and DB: `parse` rejects with the
 *   first error's message (v12 threw on the first one) and loads the model into
 *   `parser.parser.yy`; `getPacket()` is the model's rows as v12's blocks. A whole field's block
 *   has its `bits`; a split field's pieces get v12's `bits`, one short (`rowEnd - start`), the
 *   divergence listed in the conformance parity spec, which v13's model does not carry;
 * - `packetParse` stands for `@mermaid-js/parser`'s Langium parse: `value` is the AST as Langium
 *   built it (every block, the last of each text statement), and the errors are the syntax
 *   errors (a misplaced field is the DB's error, not Langium's);
 * - `configApi` stands for v12's config module: `setConfig({ packet })` sets the `packet`
 *   section the parse splits rows with and the renderer draws with, `reset()` clears it;
 * - `renderer.draw` stands for v12's packet renderer: it lays out and renders the loaded model
 *   with the v13 layout and renderer, and `document` answers the renderer spec's DOM reads from
 *   the rendered tree: `body.innerHTML =` clears it, `querySelectorAll('#<id> > g')` gives the
 *   root's row groups and `querySelectorAll('.<class>')` the elements of a class, each with
 *   `children`, `getAttribute` and `textContent`.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { treeWriter, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { layoutPacket } from '../layout/index.ts';
import { isWholeField, PACKET_SEMANTIC_ERRORS, parsePacket } from '../parser/index.ts';
import type { PacketModel } from '../model.ts';
import { packet } from '../plugin.ts';
import { renderPacket } from '../render/index.ts';

/** The `packet` config section v12's `setConfig` last set. */
let section: Readonly<Record<string, unknown>> = {};

export const configApi = {
  setConfig(next: { packet?: Readonly<Record<string, unknown>> }): void {
    section = { ...section, ...next.packet };
  },
  reset(): void {
    section = {};
  },
};

interface Block {
  start: number;
  end: number;
  bits: number;
  label: string;
}

export class PacketDB {
  private model: PacketModel | undefined;

  load(model: PacketModel): void {
    this.model = model;
  }

  /** The loaded model, for `renderer.draw`. */
  current(): PacketModel | undefined {
    return this.model;
  }

  getPacket(): Block[][] {
    const model = this.model;
    if (!model) return [];
    return model.rows.map((row) =>
      row.map((p) => {
        const f = model.fields[p.field];
        const whole = f !== undefined && isWholeField(f, p);
        return {
          start: p.start,
          end: p.end,
          bits: whole ? f.bits : p.end - p.start,
          label: f?.label ?? '',
        };
      })
    );
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

export const parser = {
  parser: { yy: undefined as PacketDB | undefined },
  parse(text: string): Promise<void> {
    const result = parsePacket(text, { config: section });
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    const db = parser.parser.yy;
    if (!db) return Promise.reject(new Error('parser.parser.yy was not a PacketDB'));
    db.load(result.model);
    return Promise.resolve();
  },
};

/** Langium's AST type name of the root. */
export const Packet = { $type: 'Packet' };

interface LangiumPacket {
  $type: 'Packet';
  blocks: { $type: 'PacketBlock'; start?: number; end?: number; bits?: number; label: string }[];
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

export function packetParse(text: string): {
  value: LangiumPacket;
  lexerErrors: string[];
  parserErrors: string[];
} {
  const { ast, diagnostics } = parsePacket(text);
  const value: LangiumPacket = { $type: 'Packet', blocks: [] };
  for (const node of ast.children) {
    if (node.type === 'Field') {
      value.blocks.push({
        $type: 'PacketBlock',
        start: node.start,
        end: node.end,
        label: node.label,
      });
    } else if (node.type === 'Title') value.title = node.text;
    else if (node.type === 'AccTitle') value.accTitle = node.text;
    else if (node.type === 'AccDescr') value.accDescr = node.text;
  }
  const errors = diagnostics.filter(
    (d) => d.severity === 'error' && !PACKET_SEMANTIC_ERRORS.includes(d.code)
  );
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}

export function expectNoErrorsOrAlternatives(result: ReturnType<typeof packetParse>): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}

/** The tree the last `draw` rendered. */
let drawn: SvgTree | undefined;

export const renderer = {
  /** v12 `draw(text, id, version, diagram)`: renders the model `diagram.db` holds. */
  async draw(
    _text: string,
    _id: string,
    version: string,
    diagram: { db: PacketDB }
  ): Promise<void> {
    const model = diagram.db.current();
    if (!model) throw new Error('draw: nothing parsed');
    const ctx = {
      config: { packet: section } as unknown as ResolvedConfig,
      theme: createTheme(await loadTheme('default'), { diagram: packet.theme }),
      measurer: tableMeasurer,
      idPrefix: 'packet-diagram',
      version,
    };
    const w = treeWriter();
    renderPacket(model, layoutPacket(model, ctx), ctx, w);
    w.finish();
    drawn = w.tree;
  },
};

/** An element as the spec reads it. */
interface Element {
  readonly children: Element[];
  readonly textContent: string;
  getAttribute(name: string): string | null;
}

function element(tree: SvgTree, n: SvgNode): Element {
  const text = (m: SvgNode): string => tree.textOf(m) ?? tree.children(m).map(text).join('');
  return {
    get children() {
      return tree
        .children(n)
        .filter((c) => tree.tag(c) !== undefined)
        .map((c) => element(tree, c));
    },
    get textContent() {
      return text(n);
    },
    getAttribute: (name) => tree.getAttr(n, name as Parameters<SvgTree['getAttr']>[1]) ?? null,
  };
}

export const document = {
  body: {
    set innerHTML(_html: string) {
      drawn = undefined;
    },
  },
  querySelectorAll(selector: string): Element[] {
    if (!drawn) return [];
    const tree = drawn;
    if (/^#[\w-]+ > g$/.test(selector)) {
      const root = tree.find({ tag: 'svg' })[0];
      if (root === undefined) return [];
      return tree
        .children(root)
        .filter((c) => tree.tag(c) === 'g')
        .map((c) => element(tree, c));
    }
    const m = /^\.([\w-]+)$/.exec(selector);
    if (!m) throw new Error(`document shim: unsupported selector ${selector}`);
    return tree.find({ class: m[1]! }).map((c) => element(tree, c));
  },
};
