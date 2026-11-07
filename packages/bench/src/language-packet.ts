/**
 * The language-service bench (R-LANG-4, D90) for packet: one editing cycle on the committed
 * 50k-character packet, `fixtures/language/packet-50k.mmd`, as `language-sequence.ts` does for
 * sequence. A cycle is `update` (a full re-parse) and then every query: diagnostics, folding
 * ranges, semantic tokens, and definition, references, prepareRename, rename, astAt and hover
 * on the label `Source Port 7`, and completions on the blank line past the middle, where the
 * next start bit is offered (the probe parse, plus the parse of the text above that finds the
 * bit). Budget: ≤ 15 ms per cycle (D156) on the reference runner.
 */
import { readFileSync } from 'node:fs';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import type { CycleAnswers } from './language.ts';

export const PACKET_FIXTURE = readFileSync(`${FIXTURES_DIR}language/packet-50k.mmd`, 'utf8');

/** The cursor: inside the label `Source Port 7`. */
const cursorOf = (text: string) => text.indexOf('"Source Port 7"') + 2;
/** Completions: the start of the fixture's one blank line, a statement start. */
const completionAt = (text: string) => text.indexOf('\n\n') + 1;

/** One packet cycle on `text`. */
export function packetCycle(
  service: LanguageService,
  text: string
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///packet-50k.mmd', text);
  doc.diagnostics();
  const folds = doc.foldingRanges().length;
  const tokens = doc.semanticTokens().length;
  const definition = doc.definition(at);
  const references = doc.references(at).length;
  doc.prepareRename(at);
  const renamed = doc.rename(at, 'Renamed Port');
  const ids = doc.astAt(at);
  for (const id of ids) doc.rangeOf(id);
  const completions = doc.completions(completionAt(text)).length;
  const hover = doc.hover(at) !== undefined;
  return {
    doc,
    answers: {
      definition,
      references,
      renameEdits: 'edits' in renamed ? renamed.edits.length : -1,
      astAt: ids.length,
      folds,
      tokens,
      completions,
      hover,
    },
  };
}
