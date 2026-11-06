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
 *   errors (a misplaced field is the DB's error, not Langium's).
 */
import { parsePacket } from '../parser/index.ts';
import type { PacketModel } from '../model.ts';

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

  getPacket(): Block[][] {
    const model = this.model;
    if (!model) return [];
    return model.rows.map((row) =>
      row.map((p) => {
        const f = model.fields[p.field];
        const whole = f !== undefined && f.start === p.start && f.end === p.end;
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
    const result = parsePacket(text);
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

const SEMANTIC = new Set(['PACKET_END_BEFORE_START', 'PACKET_NOT_CONTIGUOUS', 'PACKET_ZERO_BITS']);

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
  const errors = diagnostics.filter((d) => d.severity === 'error' && !SEMANTIC.has(d.code));
  return { value, lexerErrors: [], parserErrors: errors.map((d) => d.message) };
}

export function expectNoErrorsOrAlternatives(result: ReturnType<typeof packetParse>): void {
  if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
    throw new Error([...result.lexerErrors, ...result.parserErrors].join('\n'));
  }
}
