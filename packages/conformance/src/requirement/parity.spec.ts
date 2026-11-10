import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';
import type { Oracle } from '../oracle.ts';
import { diffPaths } from '../runner.ts';
import type { CorpusItem } from '../types.ts';
import { decidedOracle, requirementGateCorpus } from './corpus.ts';
import { requirementAdapter } from './v13.ts';

/**
 * Model parity over the lexer gate's whole set (R-COMPAT-2…4, spec #520 T2): the e2e fixtures,
 * the v12 spec strings and `corpus/requirement-cases.json`, each also in every generated
 * variant (comments, CR cuts, CRLF, tabs, a blank before every line break, a mid-line
 * directive). The plain sources also run in the main parity suite against mermaid\@12 itself,
 * with D431's and D432's changes listed in `divergences.json`; here every source runs against
 * mermaid\@12 with those two lexer rules applied to its own lexer (`decidedOracle`), so the
 * variants need no list: accept/reject and the normalised model (`v12.ts`, `v13.ts`) must agree,
 * except where {@link LISTED} says, and for the forms below.
 *
 * D431's choice (GAPS #560, #564): v12 accepted six forms only because its `\s+` swallowed a
 * line break after a blank (`requirement ⏎ a {`, `a - traces ⏎-> b`, `a - ⏎traces -> b`,
 * `risk: ⏎high`, `requirement "a" ⏎{`, `"a" ⏎- traces -> b`); with D431's rule alone v12
 * rejects them. v13 skips such a line break where the grammar needs none, so they keep v12's
 * own model: wherever v13 accepts what the decided oracle rejects, plain mermaid\@12 must accept
 * it with v13's model. The second test names the six forms by case id.
 */
const LISTED: ReadonlyMap<string, { kind: Kind; detail: RegExp; why: string }> = new Map([
  [
    'e2e/visual-check/with-a-theme-default.mmd',
    {
      kind: 'accept',
      detail: /Parse error/,
      why: 'core reads front matter after a leading blank line (divergences.json)',
    },
  ],
  [
    'requirement-cases/direction-then-relation',
    {
      kind: 'reject',
      detail:
        /^UNEXPECTED: Unexpected `a.* - traces.*` after `direction LR`; a direction statement ends its line/,
      why: 'a direction statement ends its line (D432, GAPS #564); v12 with the decided lexer reads the relation',
    },
  ],
]);

/** The six forms v12 accepted only by swallowing a line break after a blank (D431). */
const SPLIT_FORMS = [
  'requirement-cases/blank-split-name',
  'requirement-cases/blank-split-relation',
  'requirement-cases/blank-split-value',
  'requirement-cases/blank-split-quoted-brace',
  'requirement-cases/blank-split-quoted-relation',
];

type Kind = 'accept' | 'reject' | 'model';

interface Side {
  accepted: boolean;
  model?: unknown;
  error?: string;
}

/** One oracle's verdict and normalised model (read at once: v12's DB is a singleton). */
async function v12(oracle: Oracle, source: string): Promise<Side> {
  const r = await oracle.parse(source);
  if (!r.accepted) return { accepted: false, error: r.error };
  if (r.diagramType !== 'requirement') return { accepted: false, error: r.diagramType };
  return { accepted: true, model: requirementAdapter.normaliseV12(r.db) };
}

function v13(source: string): Side {
  try {
    return {
      accepted: true,
      model: requirementAdapter.normaliseV13(requirementAdapter.parse(source)),
    };
  } catch (error) {
    return { accepted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** How two sides differ, or undefined when they agree. */
function divergence(ref: Side, ours: Side): { kind: Kind; detail: string } | undefined {
  if (ref.accepted && !ours.accepted) return { kind: 'reject', detail: ours.error ?? '' };
  if (!ref.accepted && ours.accepted) return { kind: 'accept', detail: ref.error ?? '' };
  if (!ref.accepted) return undefined;
  const paths = diffPaths(ref.model, ours.model);
  return paths.length > 0 ? { kind: 'model', detail: paths.join(', ') } : undefined;
}

const base = (id: string) => id.replace(/ \([^()]*\)$/, '');

interface Run {
  items: CorpusItem[];
  agree: number;
  rejected: number;
  /** Ids where v13 keeps plain v12's model of a swallowed line break (D431's choice). */
  swallowed: string[];
  listed: string[];
  bad: string[];
}

let cached: Promise<Run> | undefined;

/** One pass over the gate corpus (shared by the tests). */
function run(): Promise<Run> {
  cached ??= (async () => {
    const decided = await decidedOracle();
    const plain = await loadOracle();
    const items = (await requirementGateCorpus()).filter((i) =>
      requirementAdapter.detect(i.source)
    );
    const byId = new Map(items.map((i) => [i.id, i.source]));
    /**
     * Whether v13's reading of a swallowed line break is v12's: plain mermaid\@12 reads this
     * source so, or (for a variant, which keeps its source's meaning) it or the decided oracle
     * reads the source the variant was made from so. A variant may add what D431 or D432
     * changes (a blank before the line break after `requirementDiagram`, a comment line in a
     * relation that has `direction` in it), so its own plain verdict may differ.
     */
    const keepsV12 = async (item: CorpusItem, ours: Side): Promise<boolean> => {
      if (!divergence(await v12(plain, item.source), ours)) return true;
      const from = byId.get(base(item.id));
      if (from === undefined || from === item.source) return false;
      if (!divergence(await v12(plain, from), ours)) return true;
      return !divergence(await v12(decided, from), ours);
    };
    const out: Run = { items, agree: 0, rejected: 0, swallowed: [], listed: [], bad: [] };
    for (const item of items) {
      const ref = await v12(decided, item.source);
      const ours = v13(item.source);
      const d = divergence(ref, ours);
      if (!d) {
        out.agree++;
        if (!ref.accepted) out.rejected++;
        continue;
      }
      const listed = LISTED.get(base(item.id));
      if (listed && listed.kind === d.kind && listed.detail.test(d.detail)) {
        out.listed.push(item.id);
        continue;
      }
      if (d.kind === 'accept' && (await keepsV12(item, ours))) {
        out.swallowed.push(item.id);
        continue;
      }
      out.bad.push(`${item.id}: ${d.kind}: ${d.detail.slice(0, 200)}`);
    }
    return out;
  })();
  return cached;
}

describe('requirement oracle parity over the gate corpus (v12 with D431 and D432)', () => {
  it('matches accept/reject and the model, except the listed sources', async () => {
    const r = await run();
    process.stdout.write(
      `requirement parity (decided lexer): ${r.items.length} sources, ${r.agree} agree ` +
        `(${r.rejected} rejected by both), ${r.listed.length} listed, ` +
        `${r.swallowed.length} keep v12's model of a swallowed line break\n`
    );
    expect(r.bad.slice(0, 20)).toEqual([]);
    expect(r.agree).toBeGreaterThan(2900);
    expect(r.rejected).toBeGreaterThan(400);
    for (const id of LISTED.keys())
      expect(
        r.listed.some((l) => base(l) === id),
        id
      ).toBe(true);
  }, 300_000);

  it("keeps v12's own model for the six split forms D431 would reject (by case id)", async () => {
    const r = await run();
    const plain = await loadOracle();
    for (const id of SPLIT_FORMS) {
      expect(r.swallowed, id).toContain(id);
      const item = r.items.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      const source = item?.source ?? '';
      const ref = await v12(plain, source);
      const ours = v13(source);
      expect(ref.accepted && ours.accepted, id).toBe(true);
      expect(ours.model, id).toEqual(ref.model);
    }
    // `blank-split-relation` holds both relation forms: `a - traces ⏎-> b` and `a - ⏎traces -> b`.
    const relation = r.items.find((i) => i.id === 'requirement-cases/blank-split-relation');
    expect(v13(relation?.source ?? '').model).toMatchObject({ relations: { length: 2 } });
    // Every source v13 reads that way is one of the six or a variant of one.
    const bases = new Set(r.swallowed.map(base));
    expect([...bases].filter((id) => !SPLIT_FORMS.includes(id))).toEqual([
      'requirement-cases/direction-mid-line',
    ]);
  }, 300_000);

  it('compares each relation by type and both ends, in order', async () => {
    const r = await run();
    const plain = await loadOracle();
    const item = r.items.find((i) => i.id === 'requirement-cases/keyword-every-relation');
    const ref = await v12(plain, item?.source ?? '');
    const ours = v13(item?.source ?? '');
    const relations = (ours.model as { relations: { type: string; src: string; dst: string }[] })
      .relations;
    expect(relations).toHaveLength(14);
    expect(relations[1]).toEqual({ type: 'contains', src: 'a', dst: 'b' });
    expect(ours.model).toEqual(ref.model);
    const swapped = { ...(ours.model as object), relations: [...relations].reverse() };
    expect(divergence(ref, { accepted: true, model: swapped })?.kind).toBe('model');
  }, 300_000);
});
