import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';
import { runParity } from '../runner.ts';
import type { CorpusItem, ObservedDivergence } from '../types.ts';
import { agentflowGateCorpus, AGENTFLOW_VARIANTS, HEADER_COMMENT_CASE } from './corpus.ts';
import { agentflowAdapter } from './v13.ts';

/**
 * Oracle parity for agentflow (R-COMPAT-2…4, #546) over the lexer gate's whole set: the e2e
 * fixtures, the v12 spec strings and the cases (also in the main parity run, where their
 * divergences are listed in `divergences/agentflow.json`), each in every generated variant that changes
 * it. Accept/reject and the normalised model (`v12.ts`, `v13.ts`: v12's `getSemanticModel()`,
 * the direction and the styling) must agree, except where a variant of a listed source
 * diverges as the source does, or core's YAML reader reads a line separator:
 *
 * - D463: a lone `%` in a label, which mermaid\@12.2.0 failed to lex (the cases below);
 * - D691: a comment before the header that mermaid\@12.2.0 read as a `direction` or a link id and
 *   rejected;
 * - D462: `[/…/]`, a parallelogram of kind input after v12's fix (the sources below), where
 *   only the shape and its diagnostic differ;
 * - core's YAML reader (shared with flowchart's `@{ … }` and front matter) reads U+2028 and
 *   U+2029 as line breaks inside a block over several lines; js-yaml reads them as text, which
 *   makes the block fail or a scalar of it hold them. GAPS #546 gives it to core;
 * - core's YAML reader rejects anchors and aliases, which js-yaml resolved (listed for the
 *   source in `divergences/agentflow.json`, spec #523).
 */
const VARIANT = new RegExp(` \\((${AGENTFLOW_VARIANTS.map(([s]) => s).join('|')})\\)$`);

const LONE_PERCENT = new Set(
  ['diamond', 'pipe', 'round', 'text', 'text-end', 'text-start', 'trap', 'two'].map(
    (c) => `agentflow-cases/percent-${c}`
  )
);

const SHORT_INPUT = new Set([
  'agentflow-cases/shape-09',
  'agentflow-cases/short-input',
  'e2e/pr-check/13-should-render-the-short-input-form.mmd',
  'v12-specs/agentflow-shape-catalogue.spec.ts#7',
  'v12-specs/parser/agentflow-comments.spec.ts#11',
  'v12-specs/parser/agentflow-mappings.spec.ts#2',
]);

/** Sources with a multi-line `@{ … }` whose separator variants core's YAML reads otherwise. */
const SEPARATED_YAML = new Set([
  'agentflow-cases/data-multiline',
  'e2e/nightly-check/9-should-treat-an-empty-metadata-block-as-a-no-op.mmd',
  'v12-specs/parser/agentflow-attachment-mapping.spec.ts#5',
  'v12-specs/parser/agentflow-empty-metadata.spec.ts#1',
  'v12-specs/parser/agentflow-empty-metadata.spec.ts#2',
  'v12-specs/parser/agentflow-empty-metadata.spec.ts#5',
  'v12-specs/parser/agentflow-empty-metadata.spec.ts#8',
  'v12-specs/parser/agentflow-flow-metadata.spec.ts#1',
  'v12-specs/parser/agentflow-flowchart-parity.spec.ts#4',
  'v12-specs/parser/agentflow-inline-metadata-mapping.spec.ts#2',
  'v12-specs/parser/agentflow-metadata-trailing-comma.spec.ts#5',
  'v12-specs/parser/agentflow.spec.ts#26',
  'agentflow-cases/model-empty-metadata',
]);

const ANCHORS = 'agentflow-cases/model-yaml-anchors';

type Kind = 'D463' | 'D691' | 'D462' | 'separated YAML' | 'YAML anchors';

/** Why a gate variant diverges, or undefined when it is not one of the kinds above. */
function classify(d: ObservedDivergence, source: string): Kind | undefined {
  const m = VARIANT.exec(d.id);
  const base = m ? d.id.slice(0, m.index) : d.id;
  const variant = m?.[1];
  if (d.kind === 'accept' && LONE_PERCENT.has(base)) return 'D463';
  if (d.kind === 'accept' && HEADER_COMMENT_CASE.test(base)) return 'D691';
  if (d.kind === 'reject' && base === ANCHORS && d.detail.startsWith('SHAPE_DATA'))
    return 'YAML anchors';
  if (
    d.kind === 'model' &&
    SHORT_INPUT.has(base) &&
    d.detail.split(', ').every((p) => /^(?:diagnostics\b|vertices\[\d+\]\.shape$)/.test(p))
  )
    return 'D462';
  if (
    (variant === 'line separators' || variant === 'paragraph separators') &&
    SEPARATED_YAML.has(base) &&
    /@\{[^}]*[\u2028\u2029]/.test(source)
  )
    return 'separated YAML';
  return undefined;
}

async function* each(items: CorpusItem[]): AsyncGenerator<CorpusItem> {
  yield* items;
}

describe('agentflow oracle parity with mermaid@12 over the gate corpus', () => {
  it('matches accept/reject and the model, but for the listed kinds', async () => {
    const items = await agentflowGateCorpus();
    const sources = new Map(items.map((i) => [i.id, i.source]));
    const report = await runParity({
      adapters: [agentflowAdapter],
      corpus: each(items),
      divergences: loadDivergences(fileURLToPath(DIVERGENCES_DIR)),
    });
    const agree = report.results.filter((r) => r.status === 'agree').length;
    const counts: Record<string, number> = {};
    const unclassified: string[] = [];
    for (const d of report.unlisted) {
      const kind = classify(d, sources.get(d.id) ?? '');
      if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
      else unclassified.push(`[${d.kind}] ${d.id}: ${d.detail.slice(0, 300)}`);
    }
    process.stdout.write(
      `agentflow gate parity: ${report.results.length} sources, ${agree} agree, ` +
        `${report.expected.length} listed, ${JSON.stringify(counts)}\n`
    );
    expect(unclassified).toEqual([]);
    expect(report.disappeared).toEqual([]);
    expect(report.results.length).toBe(items.length);
    expect(counts).toEqual({
      D463: 50,
      D691: 24,
      D462: 46,
      'separated YAML': 26,
      'YAML anchors': 6,
    });
  }, 600_000);
});
