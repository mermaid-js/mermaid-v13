import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import * as cynefin from '@mermaid-js/diagram-cynefin';
import type { CynefinModel } from '@mermaid-js/diagram-cynefin';
import { cynefinLayoutViolations } from '@mermaid-js/diagram-cynefin/testing';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #467's first criterion): every
 * source of the cynefin corpus parsed by the v13 parser, laid out at every option set below,
 * gives no `cynefinLayoutViolations`.
 *
 * The parser is T2 (#465). Until it exports `parseCynefin(source) → { model }` this suite is
 * skipped, and the package's `layout/invariants.spec.ts` runs the same checks on hand-built
 * models of the same sources. When T2 lands, it runs as it is; T2 may widen the corpus to its
 * gate set (harvested v12 strings, quirks, CRLF and commented copies), as pie's does.
 */
type Parse = (source: string) => { readonly model: CynefinModel };
const parseCynefin = (cynefin as Readonly<Record<string, unknown>>).parseCynefin as
  | Parse
  | undefined;

const OPTION_SETS: readonly unknown[] = [
  {},
  { boundaryAmplitude: 0 },
  { showDomainDescriptions: false, seed: 42 },
  { width: 1000, height: 700, boundaryAmplitude: 15 },
  { width: 1, height: 1, padding: 0, boundaryAmplitude: 50 },
  { width: -100, height: Number.NaN, padding: -5, boundaryAmplitude: 80, seed: Infinity },
];

let spec: ThemeSpec;
const corpus: CorpusItem[] = [];
beforeAll(async () => {
  spec = await loadTheme('default');
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/cynefin'), 'e2e'))
    corpus.push(item);
});

describe.skipIf(parseCynefin === undefined)('cynefin layout invariants on parsed fixtures', () => {
  it('hold over the corpus and every option set', () => {
    const theme = createTheme(spec, { diagram: cynefin.cynefin.theme });
    const failures: string[] = [];
    let items = 0;
    for (const item of corpus) {
      const { model } = parseCynefin!(item.source);
      for (const d of model.domains) items += d.items.length;
      for (const options of OPTION_SETS) {
        const layout = cynefin.layoutCynefin(model, {
          config: { cynefin: options } as unknown as ResolvedConfig,
          measurer: tableMeasurer,
          theme,
          idPrefix: item.id,
          warn: () => undefined,
        });
        const v = cynefinLayoutViolations(model, layout);
        if (v.length > 0) failures.push(`${item.id} ${JSON.stringify(options)}: ${v.join('; ')}`);
      }
    }
    // The 12 v12 fixtures and the 20 baselines (#469, the review fixes).
    expect(corpus.length).toBe(32);
    expect(items).toBeGreaterThan(40);
    expect(failures.slice(0, 10)).toEqual([]);
  });
});
