/**
 * `parseRailroad`: reads a railroad diagram in the notation its header names (D511), with that
 * notation's parser class (pitfall 6). Never throws: problems are error diagnostics.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { AbnfParser } from './abnf/parser.ts';
import type { RailroadParseOptions, RailroadParseResult, RailroadParser } from './base.ts';
import { detectRailroad } from './detect.ts';
import { EbnfParser } from './ebnf/parser.ts';
import { IrParser } from './ir/parser.ts';
import { PegParser } from './peg/parser.ts';
import type { RailroadNotation } from './tokens.ts';

type ParserClass = new (
  src: string,
  options: RailroadParseOptions,
  computed?: PreprocessResult
) => RailroadParser;

const PARSERS: Readonly<Record<RailroadNotation, ParserClass>> = {
  railroad: IrParser,
  railroadEbnf: EbnfParser,
  railroadAbnf: AbnfParser,
  railroadPeg: PegParser,
};

/**
 * Parse a railroad diagram: in `options.notation`, else the notation the header names
 * (`detectRailroad`, case-insensitive as v12's detectors), else IR.
 */
export function parseRailroad(
  src: string,
  options: RailroadParseOptions = {}
): RailroadParseResult {
  if (options.notation !== undefined) return new PARSERS[options.notation](src, options).parse();
  const pre = options.preprocessed ?? preprocess(src);
  const notation = detectRailroad(src, pre) ?? 'railroad';
  return new PARSERS[notation](src, options, pre).parse();
}
