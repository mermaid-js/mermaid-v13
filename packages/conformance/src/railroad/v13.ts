/**
 * The v13 side of railroad parity: the railroad parsers and the normaliser from their
 * `RailroadModel` to the {@link RailroadSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 * One adapter per notation (D511): each claims its v12 type, and a source v12 rejects by
 * v13's detection of its header.
 */
import { detectRailroad, parseRailroad } from '@mermaid-js/diagram-railroad';
import type { RailroadModel, RailroadNotation } from '@mermaid-js/diagram-railroad';
import { parseForParity } from '../parity-parse.ts';
import type { DiagramAdapter } from '../types.ts';
import { nodeSnapshot, railroadV12Snapshot } from './v12.ts';
import type { RailroadSnapshot } from './v12.ts';

export function railroadV13Snapshot(model: RailroadModel): RailroadSnapshot {
  return {
    rules: model.rules.map((r) => ({ name: r.name, definition: nodeSnapshot(r.definition) })),
    title: model.title ?? '',
    accTitle: model.accTitle,
    accDescr: model.accDescr,
  };
}

/**
 * v13 parse for parity: the model, or a throw carrying the first error diagnostic. The
 * front-matter title is held back, as the oracle holds it back from v12 (see `v12.ts`); the
 * D218 fallback has its own specs in the railroad package.
 */
export const parseRailroadForParity = (text: string): RailroadModel =>
  parseForParity(text, parseRailroad, { withoutTitle: true });

function adapter(notation: RailroadNotation): DiagramAdapter<RailroadModel> {
  return {
    id: notation,
    v12Types: [notation],
    detect: (text) => detectRailroad(text) === notation,
    parse: parseRailroadForParity,
    normaliseV13: railroadV13Snapshot,
    normaliseV12: (db) => railroadV12Snapshot(db, notation),
  };
}

/** IR, `railroad-beta`. */
export const railroadAdapter = adapter('railroad');
/** EBNF, `railroad-ebnf-beta`. */
export const railroadEbnfAdapter = adapter('railroadEbnf');
/** ABNF, `railroad-abnf-beta`. */
export const railroadAbnfAdapter = adapter('railroadAbnf');
/** PEG, `railroad-peg-beta`. */
export const railroadPegAdapter = adapter('railroadPeg');

/** The four, in v12's detector order. */
export const RAILROAD_ADAPTERS = [
  railroadAdapter,
  railroadEbnfAdapter,
  railroadAbnfAdapter,
  railroadPegAdapter,
];
