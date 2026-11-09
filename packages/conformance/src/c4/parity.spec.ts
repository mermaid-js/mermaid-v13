import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDivergences } from '../divergences.ts';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_FILE } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { c4ParityCorpus, VARIANTS } from './corpus.ts';
import { lexingExclusion } from './d452.ts';
import type { Exclusion } from './d452.ts';
import { c4V12Snapshot } from './v12.ts';
import { c4Adapter, c4V13Snapshot, parseC4ForParity } from './v13.ts';

/**
 * Oracle parity for C4 (R-COMPAT-2…4, #539) over the lexer gate's generated variants: every e2e
 * fixture, v12 spec string and case with comment lines added, CR line breaks cut by a comment or
 * a directive, CRLF, tab indents, U+2028/U+2029 in every line and a directive mid-line. The
 * sources themselves run in the main parity suite (`registry.ts`), each divergence listed in
 * `divergences.json`.
 *
 * A variant may differ from mermaid\@12 only for a reason already decided:
 * - its source is one of D452's lexing exclusions (`d452.ts`; the lexer gate lists them): a
 *   variant puts a line break into an argument (the two-line bodies `commented()` splits
 *   mid-line), or a U+2029 after a comma, which makes v12 read a quoted argument as unquoted
 *   (`[ ]*"` fails) and run it over `)` to the next comma;
 * - or the source it was made from is a listed divergence of the same kind (D452's named
 *   arguments in the label slot, D453's titles): the variant differs the same way;
 * - or only its title differs, and v12's trimmed is v13's (D453): the U+2028/U+2029 variant
 *   adds blanks around every line's text, which v12 kept in the title.
 * Any other difference fails, and so does a variant that stops differing.
 */
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

/** The main suite's id for a variant's source (`c4-gate/e2e/x.mmd (CRLF)` → `e2e/diagrams/c4/x.mmd`). */
function baseId(id: string): string {
  const base = id.replace(/^c4-gate\//, '').replace(VARIANT, '');
  return base.startsWith('e2e/') ? `e2e/diagrams/c4/${base.slice(4)}` : base;
}

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

/** Whether `source`'s two models differ only in v12 keeping blanks around the title (D453). */
async function titleTrimmedOnly(source: string): Promise<boolean> {
  const v12 = await (await loadOracle()).parse(source);
  if (!v12.accepted) return false;
  const old = c4V12Snapshot(v12.db);
  const now = c4V13Snapshot(parseC4ForParity(source));
  return (
    old.title !== now.title &&
    JSON.stringify({ ...old, title: old.title.trim() }) === JSON.stringify(now)
  );
}

describe('c4 oracle parity with mermaid@12 over the generated variants', () => {
  it('differs only by D452 lexing or as the listed source does', async () => {
    const items = await c4ParityCorpus();
    const listed = loadDivergences(fileURLToPath(DIVERGENCES_FILE));
    const listedKind = new Map(listed.map((d) => [d.id, d.kind]));
    const report = await runParity({ adapters: [c4Adapter], corpus: each(items), divergences: [] });
    const lexer = await loadJisonLexerOracle('c4');
    const sources = new Map(items.map((i) => [i.id, i.source]));
    const by: Record<Exclusion | 'as-listed' | 'title trimmed', number> = {
      unquoted: 0,
      comment: 0,
      title: 0,
      'as-listed': 0,
      'title trimmed': 0,
    };
    const unexplained: string[] = [];
    for (const d of report.unlisted) {
      const why = await lexingExclusion(lexer, sources.get(d.id) ?? '');
      if (why) by[why]++;
      else if (listedKind.get(baseId(d.id)) === d.kind) by['as-listed']++;
      else if (d.kind === 'model' && (await titleTrimmedOnly(sources.get(d.id) ?? ''))) {
        by['title trimmed']++;
      } else unexplained.push(`${d.kind} ${d.id}: ${d.detail}`);
    }
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `c4 variant parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ` +
        `${report.unlisted.length} differ: ${by.unquoted} unquoted, ${by.comment} comment, ${by.title} title, ${by['as-listed']} as their source, ${by['title trimmed']} title trimmed\n`
    );
    expect(unexplained).toEqual([]);
    expect(by).toEqual(DIFFERING);
    expect(agree.length).toBeGreaterThan(1500);
    expect(rejected).toBeGreaterThan(400);
  }, 600_000);
});

/** How many variants differ, by reason. */
const DIFFERING = {
  unquoted: 304,
  comment: 21,
  title: 19,
  'as-listed': 296,
  'title trimmed': 52,
};
