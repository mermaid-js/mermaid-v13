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
 * Fresh names for a symbol kind whose facet refuses {@link FRESH}, tried in order: the first the
 * facet's `isValidId` accepts for the kind and the file's text does not hold is used (event
 * modeling's frame ids are one to three digits, D528). A symbol none fits is a problem, so no
 * rename is skipped silently; {@link MIN_OTHERWISE} renames must use one.
 */
const FRESH_OTHERWISE = ['987', '986'];
/** At least this many renames use a name of {@link FRESH_OTHERWISE} (the corpus's frame ids). */
const MIN_OTHERWISE = 100;

/**
 * Renames that change the model, found by this test and left to their owners (GAPS.md):
 * - (not a model change) an ER entity name with a `.` is percent-encoded in its attribute ids.
 */
const KNOWN_MODEL_CHANGES = [
  // Not a model change: ER attribute ids percent-encode a `.` in the entity name
  // (`a:2%2E5.id`), so the name-for-name substitution above cannot map `renamedZq7` back.
  'er-diagram/pr-check/should-render-complex-er-diagram-with-mixed-special-entity-names.mmd 2.5@392: model',
  // Not a model change either: journey section and actor ast ids percent-encode a `>` in the
  // name (`s:section <b%3Ebold…`), so the substitution cannot map the fresh name back. #1368's
  // label-syntax fixtures name a section and an actor with tags.
  'journey/pr-check/label-syntax-compat.mmd actor <b>bold</b> <i>ital</i><br>next H<sub>2</sub>O@923: model',
  'journey/pr-check/label-syntax-compat.mmd section <b>bold</b> <i>ital</i><br>next H<sub>2</sub>O@808: model',
  'journey/pr-check/label-syntax.mmd actor <b>bold</b> <i>ital</i><br>next H<sub>2</sub>O@861: model',
  'journey/pr-check/label-syntax.mmd section <b>bold</b> <i>ital</i><br>next H<sub>2</sub>O@746: model',
];

/**
 * Renames whose way back writes the original name quoted: an XY chart name written bare with a
 * blank between its words (#683: v13 reads `jan feb` as one name with the space). The facet
 * writes a name with a blank in quotes (`writtenName`), which mermaid 12.2.0 also reads with its
 * blanks, so the text comes back as `"jan feb"`, the same model.
 */
const KNOWN_BACK_QUOTED = [
  'xychart/pr-check/unquoted-text-keeps-spaces.mmd jan feb@385: back differs',
  'xychart/pr-check/unquoted-text-keeps-spaces.mmd Gross Sales@435: back differs',
];

/**
 * Model lists a facet keeps in name order, sorted again once the name is written back: a rename
 * moves the name in them, which is no model change. Journey's `actors` are sorted by code unit
 * (its legend order, D244), so renaming `Cat` to `renamedZq7` puts it after `Me` (#331).
 */
const NAME_ORDERED: Readonly<Record<string, (model: unknown) => unknown>> = {
  journey: (model) => {
    const m = model as { actors: string[] };
    return { ...m, actors: [...m.actors].sort() };
  },
  // Not ordered but derived from the names alone, so dropped: mindmap's `ast` ids encode the
  // node id (`%3E` for `>`) and number the repeats of an id (`n:a@2`, D289), so a rename
  // re-encodes and renumbers them. The id itself is in `id`, compared as it is.
  mindmap: (model) => {
    const m = model as { nodes: { ast: string }[] };
    return { ...m, nodes: m.nodes.map(({ ast: _, ...node }) => node) };
  },
  // Kanban's `ast` ids are mindmap's (D289): `n:<id>`, the k-th repeat `n:<id>@k`, so renaming
  // the first of two columns `docs` renumbers the second. `id` is compared as it is.
  kanban: (model) => {
    const m = model as { items: { ast: string }[] };
    return { ...m, items: m.items.map(({ ast: _, ...item }) => item) };
  },
  // Venn keeps the ids of an overlap, a text node's area and a style's targets sorted, as v12
  // does, and its `ast` ids are made of them (`union:A+B`, D418), so a rename moves the name in
  // both. The lists are sorted again and the `ast` ids dropped; the ids are compared as they are.
  // A warning quotes its statement cut to 24 characters, so a longer name cuts it elsewhere:
  // warnings are compared by code (the spec compares every diagnostic's code too).
  venn: (model) => {
    interface Entry {
      ast: string;
      sets?: string[];
      targets?: string[];
    }
    const m = model as {
      subsets: Entry[];
      textNodes: Entry[];
      styles: Entry[];
      warnings: { code: string }[];
    };
    const strip = ({ ast: _, ...e }: Entry) => ({
      ...e,
      ...(e.sets ? { sets: [...e.sets].sort() } : {}),
      ...(e.targets ? { targets: [...e.targets].sort() } : {}),
    });
    return {
      ...m,
      subsets: m.subsets.map(strip),
      textNodes: m.textNodes.map(strip),
      styles: m.styles.map(strip),
      warnings: m.warnings.map((w) => w.code),
    };
  },
  // Not ordered but derived from the names: a quoted usecase element's id is its label with
  // every non-word character as `_` (`"Reset password"` is `Reset_password`, D191), so the
  // name written back is the label, not the id. Ids (and the ends, members and parents that
  // name them) are compared as ids again, and the `astId`s made of them are dropped.
  usecase: (model) => {
    const ID_KEYS = new Set(['id', 'source', 'target', 'parentId', 'members']);
    const generated = (label: string) => label.replace(/\W/g, '_');
    // The labels of quoted elements written back as ids: the element's id is the label itself
    // (renamed back from the fresh name), and its id would be the label's generated id.
    const m = model as Record<
      'actors' | 'useCases' | 'boundaries',
      { id: string; label: string }[]
    >;
    const back = new Map<string, string>();
    for (const e of [...m.actors, ...m.useCases, ...m.boundaries]) {
      if (e.id === e.label && generated(e.label) !== e.label) back.set(e.label, generated(e.label));
    }
    const asId = (v: unknown): unknown => {
      if (typeof v === 'string') return back.get(v) ?? v;
      return Array.isArray(v) ? v.map(asId) : v;
    };
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (typeof v !== 'object' || v === null) return v;
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== 'astId')
          .map(([k, x]) => [k, ID_KEYS.has(k) ? asId(x) : walk(x)])
      );
    };
    return walk(model);
  },
};

/** Refused renames: safe, but each one is listed so a new refusal is seen. */
const KNOWN_REFUSALS = [
  // An `L_B_D_0@{ … }` naming a generated edge id: the id is made of its ends' names, so
  // renamed alone it would name a new node, not the edge. Renaming `B` or `D` renames it (#170).
  "flowchart/nightly-check/classic/03-40-should-add-edge-animation.mmd L_B_D_0@420: 'renamedZq7' would not read as the same edge id everywhere it is used.",
  "flowchart/nightly-check/handdrawn/03-fdh49-should-add-edge-animation.mmd L_B_D_0@428: 'renamedZq7' would not read as the same edge id everywhere it is used.",
  // `note right of A : raw &lt; x`: the `;` ends the note's text and is a state id of its own,
  // in v12 too (#1356). A name that does not start with `;` would join the note's text there.
  "state-diagram-v2/nightly-check/entity-without-semicolon.mmd ;@359: 'renamedZq7' would not read as the same state id everywhere it is used.",
];

/**
 * Facets whose symbols are fixed names, so every rename is refused by design, and the reason it
 * must give: cynefin's five domains (D367). Checked, not listed: each of their symbols must be
 * refused with that reason (a refusal for any other, such as a failed read-back, fails), and at
 * least one is.
 */
const FIXED_NAMES: ReadonlyMap<string, string> = new Map([
  [
    'cynefin',
    'Domain names are fixed: a cynefin diagram has the five domains `complex`, `complicated`, `clear`, `chaotic` and `confusion`, so a domain cannot be renamed.',
  ],
]);

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
function symbolPositions(doc: DocumentSnapshot): { at: number; kind: string }[] {
  const seen = new Set<string>();
  const out: { at: number; kind: string }[] = [];
  for (const s of contextOf(doc).result?.symbols ?? []) {
    const prepared = doc.prepareRename(s.range.start);
    if ('refused' in prepared) continue;
    const key = JSON.stringify(doc.references(s.range.start));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: s.range.start, kind: s.kind });
  }
  return out;
}

/**
 * The fresh name for a symbol of `kind`: {@link FRESH}, else the first of the others the facet
 * accepts and `text` does not hold; `undefined` when the facet accepts one but `text` holds
 * them all.
 */
function freshFor(doc: DocumentSnapshot, kind: string, text: string): string | undefined {
  const facet = doc.facet!;
  if (facet.isValidId(FRESH, kind) === undefined) return FRESH;
  const valid = FRESH_OTHERWISE.filter((n) => facet.isValidId(n, kind) === undefined);
  if (valid.length === 0) return FRESH;
  return valid.find((n) => !text.includes(n));
}

describe('rename, re-parse, same model modulo the name', () => {
  it('over the corpus', () => {
    const problems: string[] = [];
    const refused: string[] = [];
    let renamed = 0;
    let otherwise = 0;
    let fixed = 0;
    for (const file of corpus) {
      const text = readFileSync(join(CORPUS, file), 'utf8');
      if (text.includes(FRESH)) continue;
      const doc = service.update(`corpus:///${file}`, text);
      if (!doc.facet) continue;
      const order = NAME_ORDERED[doc.facet.id] ?? ((m: unknown) => m);
      const before = order(modulo(contextOf(doc).result?.model, FRESH, FRESH));
      for (const { at, kind } of symbolPositions(doc)) {
        const fresh = freshFor(doc, kind, text);
        if (fresh === undefined) {
          problems.push(`${file.split('\\').join('/')} @${at}: no fresh ${kind} name fits`);
          continue;
        }
        const name = (doc.prepareRename(at) as { placeholder: string }).placeholder;
        const where = `${file.split('\\').join('/')} ${name}@${at}`;
        const result = doc.rename(at, fresh);
        const reason = FIXED_NAMES.get(doc.facet.id);
        if (reason !== undefined) {
          if (!('refused' in result)) problems.push(`${where}: a fixed name was renamed`);
          else if (result.refused !== reason) problems.push(`${where}: refused: ${result.refused}`);
          else fixed++;
          continue;
        }
        if ('refused' in result) {
          refused.push(`${where}: ${result.refused}`);
          continue;
        }
        renamed++;
        if (fresh !== FRESH) otherwise++;
        const next = service.update(`corpus:///${file}#renamed`, apply(text, result.edits));
        const after = order(modulo(contextOf(next).result?.model, fresh, name));
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
    expect(otherwise).toBeGreaterThanOrEqual(MIN_OTHERWISE);
    expect(fixed).toBeGreaterThan(0);
    expect(problems).toEqual([...KNOWN_MODEL_CHANGES, ...KNOWN_BACK_QUOTED]);
    expect(refused).toEqual(KNOWN_REFUSALS);
  }, 120_000);
});
