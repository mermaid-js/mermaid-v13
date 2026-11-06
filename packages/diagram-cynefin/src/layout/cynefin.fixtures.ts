/**
 * Hand-built `CynefinModel` fixtures for the layout specs, written as v12 parses the source
 * above each one: the twelve `e2e/diagrams/cynefin/` sources, then cases the corpus misses
 * (spec #423 "Testing"). They stand in for parser-produced fixtures until T2 (#465) lands;
 * `packages/conformance/src/cynefin/layout-corpus.spec.ts` then runs the same invariants on
 * the parser's models.
 */
import type {
  CynefinDomain,
  CynefinDomainName,
  CynefinModel,
  CynefinTransition,
} from '../model.ts';

type Blocks = readonly (readonly [CynefinDomainName, ...string[]])[];
type Arrows = readonly (readonly [CynefinDomainName, CynefinDomainName, string?])[];

/** A model from domain blocks (`[name, ...items]`) and transitions (`[from, to, label?]`). */
export function model(
  blocks: Blocks,
  arrows: Arrows = [],
  extra: Partial<CynefinModel> = {}
): CynefinModel {
  const seen = new Map<string, number>();
  const domains: CynefinDomain[] = blocks.map(([name, ...items]) => ({
    name,
    ast: `d:${name}`,
    items: items.map((label) => {
      const id = `i:${name}/${label}`;
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return { label, ast: n === 1 ? id : `${id}@${n}` };
    }),
  }));
  const repeats = new Map<string, number>();
  const transitions: CynefinTransition[] = arrows.map(([from, to, label]) => {
    const id = `t:${from}>${to}`;
    const n = (repeats.get(id) ?? 0) + 1;
    repeats.set(id, n);
    return { from, to, ...(label ? { label } : {}), ast: n === 1 ? id : `${id}#${n}` };
  });
  return { domains, transitions, accTitle: '', accDescr: '', warnings: [], ...extra };
}

const FOUR: Blocks = [
  ['complex', 'Item A'],
  ['complicated', 'Item B'],
  ['clear', 'Item C'],
  ['chaotic', 'Item D'],
];

export const FIXTURES: Readonly<Record<string, CynefinModel>> = {
  // e2e …straight-boundaries-when-amplitude-is-zero (boundaryAmplitude: 0)
  straight: model(FOUR, [], { title: 'Straight Boundaries' }),
  // e2e …without-domain-descriptions (showDomainDescriptions: false)
  bare: model(
    [
      ['complex', 'Item A'],
      ['clear', 'Item B'],
    ],
    [],
    { title: 'Minimal Labels' }
  ),
  // e2e …many-items-per-domain
  many: model(
    [
      ['complex', 'New product discovery', 'User behavior analysis', 'A/B testing strategy'],
      ['complicated', 'Performance optimization', 'Security audit', 'Database migration'],
      ['clear', 'Deploy to staging', 'Run test suite', 'Merge pull request'],
      ['chaotic', 'Production outage', 'Data breach response'],
    ],
    [],
    { title: 'Software Delivery' }
  ),
  // e2e …config-override (width 1000, height 700, amplitude 15); …theme-override
  two: model([
    ['complex', 'Adaptive work'],
    ['clear', 'Standard work'],
  ]),
  // e2e …accessibility-directives
  acc: model(
    [
      ['complex', 'Feature discovery'],
      ['complicated', 'Refactoring'],
      ['clear', 'Hotfix'],
      ['chaotic', 'Incident'],
    ],
    [],
    {
      accTitle: 'Cynefin framework for software delivery',
      accDescr: 'A Cynefin map categorizing software tasks by complexity domain',
    }
  ),
  // e2e …empty-cynefin-framework
  empty: model([['complex'], ['complicated'], ['clear'], ['chaotic']], [], {
    title: 'Empty Framework',
  }),
  // e2e …all-five-domains
  five: model(
    [
      ['complex', 'Investigate root cause', 'Run chaos experiment'],
      ['complicated', 'Analyze performance data', 'Expert review needed'],
      ['clear', 'Restart service', 'Apply known fix'],
      ['chaotic', 'Page on-call immediately'],
      ['confusion', 'Unknown failure mode'],
    ],
    [],
    { title: 'Incident Response' }
  ),
  // e2e …with-transitions
  transitions: model(
    [
      ['complex', 'Market research'],
      ['complicated', 'Competitive analysis'],
      ['clear', 'Standard pricing'],
      ['chaotic', 'Crisis management'],
    ],
    [
      ['complex', 'complicated', 'Pattern identified'],
      ['complicated', 'clear', 'Best practice codified'],
      ['clear', 'chaotic', 'Complacency'],
      ['chaotic', 'complex', 'Stabilized'],
    ],
    { title: 'Strategy Categorization' }
  ),
  // e2e …explicit-seed-override (seed: 42)
  seeded: model(
    [
      ['complex', 'Probe'],
      ['complicated', 'Analyse'],
      ['clear', 'Categorise'],
      ['chaotic', 'Act'],
    ],
    [],
    { title: 'Seeded Boundaries' }
  ),
  // e2e …self-loop-transitions-silently-dropped: the parser drops `complex --> complex`.
  selfLoop: model(
    [
      ['complex', 'Emergent work'],
      ['complicated', 'Expert work'],
    ],
    [['complex', 'complicated', 'Pattern found']],
    { title: 'Self-loop Handling' }
  ),
  // e2e …confusion-domain-items-without-overflow (five items: a `+2 more` badge is drawn)
  confusion: model(
    [['confusion', 'Unknown A', 'Unknown B', 'Unknown C', 'Unknown D', 'Unknown E']],
    [],
    { title: 'Confusion Items' }
  ),

  // Not in the corpus: twelve items crossing the horizon and the canvas bottom (D361).
  crowded: model([
    ['chaotic', ...Array.from({ length: 12 }, (_, i) => `Chaotic item ${i + 1}`)],
    ['complex', ...Array.from({ length: 6 }, (_, i) => `Complex item ${i + 1}`)],
  ]),
  // Labels and a title wider than the canvas (D361).
  wide: model(
    [
      ['complicated', 'An item label far wider than its quadrant, which v12 let run over the edge'],
      ['confusion', 'A confusion item wider than the ellipse'],
    ],
    [],
    {
      title:
        'A title far wider than the eight hundred px canvas and its padding, which v12 clipped at both ends',
    }
  ),
  // Every pair, both ways: diagonals through the ellipse, to and from confusion, repeats.
  allTransitions: model(
    [],
    (['complex', 'complicated', 'clear', 'chaotic', 'confusion'] as const).flatMap((from) =>
      (['complex', 'complicated', 'clear', 'chaotic', 'confusion'] as const)
        .filter((to) => to !== from)
        .map((to) => [from, to, `${from} to ${to}`] as const)
    ),
    {}
  ),
  repeats: model(
    [],
    [
      ['complex', 'clear', 'first'],
      ['complex', 'clear', 'again'],
      ['complex', 'clear'],
    ]
  ),
  // Core label layout (D363): `<br>` breaks a badge onto two lines, entities decode,
  // a markdown string, an empty item, a title of two lines.
  labels: model(
    [
      ['complex', 'First<br>line', 'Tom &amp; Jerry', '`**bold** item`', ''],
      ['clear', 'Three<br/>short<br>lines'],
    ],
    [['complex', 'clear', 'Two<br>lines']],
    { title: 'Title<br>on two lines' }
  ),
};
