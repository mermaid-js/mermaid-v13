/**
 * Rename round-trip (D99 suite 4, D92): over every corpus document with a facet, every symbol
 * renamed to a fresh name re-parses to the same model modulo the name (ranges aside, since the
 * text moved), and renaming it back gives the original text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import { contextOf } from './snapshot.ts';
import type { DocumentSnapshot, Range, TextEdit } from './index.ts';
import { UNLISTED_FACETS } from './testing/unlisted-facets.ts';

const CORPUS = join(import.meta.dirname, '..', '..', '..', 'e2e', 'diagrams');
const FRESH = 'renamedZq7';

/**
 * Renames that change the model, found by this test and left to their owners (GAPS.md):
 * - renaming a node renames the generated id of its edges (`L_B_D_0`), and an `L_B_D_0@{ … }`
 *   written in the text then names an edge that no longer exists;
 * - `class link …` for the edge id `link` is recorded as a node mention, so renaming the edge
 *   id (or the "node") leaves the other one behind and the class moves;
 * - (not a model change) an ER entity name with a `.` is percent-encoded in its attribute ids.
 */
const KNOWN_MODEL_CHANGES = [
  // Not a model change: ER attribute ids percent-encode a `.` in the entity name
  // (`a:2%2E5.id`), so the name-for-name substitution above cannot map `renamedZq7` back.
  'er-diagram/pr-check/should-render-complex-er-diagram-with-mixed-special-entity-names.mmd 2.5@392: model',
  'flowchart/nightly-check/classic/03-40-should-add-edge-animation.mmd B@257: model',
  'flowchart/nightly-check/classic/03-40-should-add-edge-animation.mmd D@303: model',
  'flowchart/nightly-check/handdrawn/03-fdh49-should-add-edge-animation.mmd B@265: model',
  'flowchart/nightly-check/handdrawn/03-fdh49-should-add-edge-animation.mmd D@311: model',
  'flowchart/visual-check/v2-17-should-apply-class-def-colour-to-edge-label.mmd link@315: model',
  'flowchart/visual-check/v2-17-should-apply-class-def-colour-to-edge-label.mmd link@516: model',
];

/**
 * Renames whose way back is refused: the original name is a v12 state id that the state facet
 * will not take as a new name (`isValidId`, #151), so it cannot be typed back. Both come from the
 * corpus text, not from the rename: `state State1: Description 1` in a `stateDiagram-v2` makes
 * `State1:` (and `Description`, `1`) state ids in v12 too, and the fork/join fixtures write
 * `&lt;&lt;fork&gt;&gt;` HTML-escaped, so the marker is an id that `class`/`style` cannot name.
 */
const KNOWN_BACK_REFUSALS = [
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-dark-theme.mmd State1:@410: back refused: 'State1:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-dark-theme.mmd State2:@442: back refused: 'State2:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-dark-theme.mmd State3:@474: back refused: 'State3:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-dark-theme.mmd State4:@506: back refused: 'State4:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-theme.mmd State1:@400: back refused: 'State1:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-theme.mmd State2:@432: back refused: 'State2:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-theme.mmd State3:@464: back refused: 'State3:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-neo-theme.mmd State4:@496: back refused: 'State4:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-dark-theme.mmd State1:@414: back refused: 'State1:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-dark-theme.mmd State2:@446: back refused: 'State2:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-dark-theme.mmd State3:@478: back refused: 'State3:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-dark-theme.mmd State4:@510: back refused: 'State4:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-theme.mmd State1:@404: back refused: 'State1:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-theme.mmd State2:@436: back refused: 'State2:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-theme.mmd State3:@468: back refused: 'State3:' is not a state id.",
  "state-diagram-v2/nightly-check/states-with-descriptions-neo-look-redux-theme.mmd State4:@500: back refused: 'State4:' is not a state id.",
  "state-diagram/pr-check/should-render-forks-and-joins.mmd &lt;&lt;fork&gt;&gt;@299: back refused: '&lt;&lt;fork&gt;&gt;' cannot be named in `class` or `style` statements (letters, digits and `_` only).",
  "state-diagram/pr-check/should-render-forks-and-joins.mmd &lt;&lt;join&gt;&gt;@409: back refused: '&lt;&lt;join&gt;&gt;' cannot be named in `class` or `style` statements (letters, digits and `_` only).",
  "state-diagram/pr-check/should-render-forks-in-composit-states.mmd &lt;&lt;fork&gt;&gt;@321: back refused: '&lt;&lt;fork&gt;&gt;' cannot be named in `class` or `style` statements (letters, digits and `_` only).",
  "state-diagram/pr-check/should-render-forks-in-composit-states.mmd &lt;&lt;join&gt;&gt;@431: back refused: '&lt;&lt;join&gt;&gt;' cannot be named in `class` or `style` statements (letters, digits and `_` only).",
];

/** Refused renames: safe, but each one is listed so a new refusal is seen. */
const KNOWN_REFUSALS = [
  // An `L_B_D_0@{ … }` naming a generated edge id: renamed, it would name a new edge.
  "flowchart/nightly-check/classic/03-40-should-add-edge-animation.mmd L_B_D_0@420: 'renamedZq7' would not read as the same edge id everywhere it is used.",
  "flowchart/nightly-check/handdrawn/03-fdh49-should-add-edge-animation.mmd L_B_D_0@428: 'renamedZq7' would not read as the same edge id everywhere it is used.",
];

const corpus = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort();

const service = createLanguageService({ facets: UNLISTED_FACETS });
beforeAll(() => service.preload());

function apply(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

const isRange = (v: unknown): v is Range =>
  typeof v === 'object' && v !== null && Object.keys(v).length === 2 && 'start' in v && 'end' in v;

/** `value` with source ranges dropped and `from` written as `to` in every string. */
function modulo(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((v) => modulo(v, from, to));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => !isRange(v))
        .map(([k, v]) => [k, modulo(v, from, to)])
    );
  return value;
}

/** One position per distinct symbol: the first occurrence the service can rename. */
function symbolPositions(doc: DocumentSnapshot): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const s of contextOf(doc).result?.symbols ?? []) {
    const prepared = doc.prepareRename(s.range.start);
    if ('refused' in prepared) continue;
    const key = JSON.stringify(doc.references(s.range.start));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.range.start);
  }
  return out;
}

describe('rename, re-parse, same model modulo the name', () => {
  it('over the corpus', () => {
    const problems: string[] = [];
    const refused: string[] = [];
    let renamed = 0;
    for (const file of corpus) {
      const text = readFileSync(join(CORPUS, file), 'utf8');
      if (text.includes(FRESH)) continue;
      const doc = service.update(`corpus:///${file}`, text);
      if (!doc.facet) continue;
      const before = modulo(contextOf(doc).result?.model, FRESH, FRESH);
      for (const at of symbolPositions(doc)) {
        const name = (doc.prepareRename(at) as { placeholder: string }).placeholder;
        const where = `${file.split('\\').join('/')} ${name}@${at}`;
        const result = doc.rename(at, FRESH);
        if ('refused' in result) {
          refused.push(`${where}: ${result.refused}`);
          continue;
        }
        renamed++;
        const next = service.update(`corpus:///${file}#renamed`, apply(text, result.edits));
        const after = modulo(contextOf(next).result?.model, FRESH, name);
        if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`${where}: model`);
        const codes = (d: DocumentSnapshot) => d.diagnostics().map((x) => x.code);
        if (JSON.stringify(codes(next)) !== JSON.stringify(codes(doc)))
          problems.push(`${where}: diagnostics`);
        const back = next.rename(result.edits[0]!.range.start, name);
        if ('refused' in back) problems.push(`${where}: back refused: ${back.refused}`);
        else if (apply(next.text, back.edits) !== text) problems.push(`${where}: back differs`);
      }
    }
    expect(renamed).toBeGreaterThan(2000);
    expect(problems).toEqual([...KNOWN_MODEL_CHANGES, ...KNOWN_BACK_REFUSALS]);
    expect(refused).toEqual(KNOWN_REFUSALS);
  }, 120_000);
});
