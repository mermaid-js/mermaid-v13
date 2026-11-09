import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutRailroad, parseRailroad } from '@mermaid-js/diagram-railroad';
import { railroadLayoutViolations, railroadSectionOf } from '@mermaid-js/diagram-railroad/testing';
import { railroadGateCorpus, type GateItem } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #612): every source of the railroad
 * gate corpus (e2e fixtures, v12 spec strings, the cases and the recovery set, each also with
 * CRLF and comment lines), parsed by the v13 parser with its own `railroad` config, rejected
 * sources included (the model of the rules that parsed), laid out with that config and with each
 * override below, gives no `railroadLayoutViolations`.
 */
const OVERRIDES: readonly Readonly<Record<string, unknown>>[] = [
  {},
  { arcRadius: 24 },
  { arcRadius: 0, padding: 0, verticalSeparation: 0, horizontalSeparation: 0 },
  { verticalSeparation: 40, markerRadius: 15, strokeWidth: 8, fontSize: 30 },
];

let theme: Theme;
let corpus: GateItem[];
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'), {});
  corpus = await railroadGateCorpus();
});

describe('railroad layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus under every option set', () => {
    const failures: string[] = [];
    const kinds = new Map<string, number>();
    let rules = 0;
    for (const item of corpus) {
      const pre = preprocess(item.source);
      const { model } = parseRailroad(item.source, { preprocessed: pre });
      const section = railroadSectionOf(pre);
      rules += model.rules.length;
      for (const o of OVERRIDES) {
        const layout = layoutRailroad(model, {
          config: { railroad: { ...section, ...o } } as unknown as ResolvedConfig,
          measurer: tableMeasurer,
          theme,
        });
        if (o === OVERRIDES[0]) {
          const stack = layout.rules.map((r) => r.definition);
          for (let e = stack.pop(); e; e = stack.pop()) {
            kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
            stack.push(...e.children);
          }
        }
        const v = railroadLayoutViolations(model, layout);
        if (v.length > 0) {
          failures.push(`${item.id} ${JSON.stringify(o)}: ${v.slice(0, 3).join('; ')}`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.variant).length).toBe(27);
    expect(rules).toBeGreaterThan(1_000);
    for (const kind of [
      'terminal',
      'nonterminal',
      'special',
      'sequence',
      'choice',
      'optional',
      'repetition',
    ]) {
      expect(kinds.get(kind) ?? 0, kind).toBeGreaterThan(20);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  }, 240_000);
});
