import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDivergences } from '../divergences.ts';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import { loadOracle } from '../oracle.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { diffPaths, runParity } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { c4Cases, c4Corpus, c4ParityCorpus, VARIANTS } from './corpus.ts';
import { lexingExclusion, usesDirection } from './d452.ts';
import type { Exclusion } from './d452.ts';
import { c4V12Snapshot } from './v12.ts';
import type { C4Snapshot } from './v12.ts';
import { c4Adapter, c4V13Snapshot, parseC4ForParity } from './v13.ts';

/**
 * Oracle parity for C4 (R-COMPAT-2…4, #539) over the lexer gate's generated variants: every e2e
 * fixture, v12 spec string and case with comment lines added, CR line breaks cut by a comment or
 * a directive, CRLF, tab indents, U+2028/U+2029 in every line and a directive mid-line. The
 * sources themselves run in the main parity suite (`registry.ts`), each divergence listed in
 * `divergences/c4.json`.
 *
 * A variant may differ from mermaid\@12 only for a reason already decided:
 * - its source is one of D452's lexing exclusions (`d452.ts`; the lexer gate lists them): a
 *   variant puts a line break into an argument (the two-line bodies `commented()` splits
 *   mid-line), or a U+2029 after a comma, which makes v12 read a quoted argument as unquoted
 *   (`[ ]*"` fails) and run it over `)` to the next comma;
 * - or the source it was made from is a listed divergence of the same kind (D452's named
 *   arguments in the label slot, D453's titles) and differs from v12 where its source does (every
 *   differing path the same; for an accept v12's same error, for a reject v13's same code): a
 *   variant may change the text at those paths, but one more difference fails;
 * - or only its title differs, and v12's trimmed is v13's (D453): the U+2028/U+2029 variant
 *   adds blanks around every line's text, which v12 kept in the title.
 * - or v13 accepts it for its `direction` statement, which 12.2.0 refuses (#730, amending D452).
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

/**
 * How v12 and v13 differ on `text`: for a model divergence every path where they differ (blanks
 * left out, a title v12 kept blanks around, D453, too), for an accept v12's error, for a reject
 * v13's error code.
 */
async function difference(text: string): Promise<string> {
  const v12 = await (await loadOracle()).parse(text);
  let v13: C4Snapshot;
  try {
    v13 = c4V13Snapshot(parseC4ForParity(text));
  } catch (error) {
    return `reject ${(error instanceof Error ? error.message : String(error)).split(':')[0] ?? ''}`;
  }
  if (!v12.accepted) return `accept ${v12.error.split('\n')[0] ?? ''}`;
  const old = c4V12Snapshot(v12.db);
  // D453's trim is its own reason (below); the variants insert blanks and line breaks only, which
  // both sides read alike, also into names.
  const trimmed = old.title.trim() === v13.title;
  const paths = diffPaths(old, v13, '', 1_000).filter((p) => !(p === 'title' && trimmed));
  return `model ${paths
    .map((p) => p.replace(/\s+/g, ''))
    .sort()
    .join(', ')}`;
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
    const listed = loadDivergences(fileURLToPath(DIVERGENCES_DIR));
    const listedKind = new Map(listed.map((d) => [d.id, d.kind]));
    const report = await runParity({ adapters: [c4Adapter], corpus: each(items), divergences: [] });
    const lexer = await loadJisonLexerOracle('c4');
    const sources = new Map(items.map((i) => [i.id, i.source]));
    // The sources of the variants, by their main-suite ids.
    const originals = new Map(
      [...(await c4Corpus()), ...c4Cases()].map((i) => [baseId(i.id), i.source])
    );
    const by: Record<Exclusion | 'as-listed' | 'title trimmed' | 'v12 has no direction', number> = {
      unquoted: 0,
      comment: 0,
      title: 0,
      hash: 0,
      quote: 0,
      direction: 0,
      'v12 has no direction': 0,
      'as-listed': 0,
      'title trimmed': 0,
    };
    const unexplained: string[] = [];
    for (const d of report.unlisted) {
      const why = await lexingExclusion(lexer, sources.get(d.id) ?? '');
      if (why) by[why]++;
      else if (d.kind === 'accept' && usesDirection(sources.get(d.id) ?? '')) {
        by['v12 has no direction']++;
      } else if (
        listedKind.get(baseId(d.id)) === d.kind &&
        (await difference(sources.get(d.id) ?? '')) ===
          (await difference(originals.get(baseId(d.id)) ?? ''))
      ) {
        by['as-listed']++;
      } else if (d.kind === 'model' && (await titleTrimmedOnly(sources.get(d.id) ?? ''))) {
        by['title trimmed']++;
      } else unexplained.push(`${d.kind} ${d.id}: ${d.detail}`);
    }
    const agree = report.results.filter((r) => r.status === 'agree');
    const rejected = agree.filter((r) => !r.oracleAccepted).length;
    process.stdout.write(
      `c4 variant parity: ${report.results.length} sources, ${agree.length} agree (${rejected} rejected by both), ` +
        `${report.unlisted.length} differ: ${by.unquoted} unquoted, ${by.comment} comment, ${by.title} title, ${by.hash} hash, ${by.quote} quote, ${by.direction} direction, ${by['v12 has no direction']} no direction in v12, ${by['as-listed']} as their source, ${by['title trimmed']} title trimmed\n`
    );
    expect(unexplained).toEqual([]);
    expect(by).toEqual(DIFFERING);
    expect(agree.length).toBeGreaterThan(1500);
    // #730: the sources with a `direction` statement are no longer rejected by both.
    expect(rejected).toBeGreaterThan(390);
  }, 600_000);
});

/** How many variants differ, by reason. */
const DIFFERING = {
  unquoted: 317,
  comment: 21,
  title: 19,
  hash: 19,
  quote: 13,
  direction: 33,
  'v12 has no direction': 44,
  'as-listed': 356,
  'title trimmed': 54,
};
