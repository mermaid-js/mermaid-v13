// cspell:ignore setid
/**
 * v12's drawn venn geometry (spec #429 T3, D412): what mermaid\@12's `vennRenderer.ts` handed
 * venn.js 2.0.0 for its visible circles, and what `VennDiagram` did with it, in plain Node
 * (venn.js's solver needs no DOM). The steps are v12's and venn.js's own, copied from
 * `fa796a943:packages/mermaid/src/diagrams/venn/vennRenderer.ts` (`ensurePairwiseSubsets`, the
 * `48s` title row) and `@upsetjs/venn.js` `VennDiagram` (zero-size sets dropped, then `venn`,
 * `normalizeSolution`, `scaleSolution` with padding 15, `computeTextCentres`); the maths is
 * venn.js's, imported.
 */
import * as venn from '@upsetjs/venn.js';

/** v12's `VennData`. */
export interface V12Subset {
  sets: string[];
  size: number;
  label?: string;
}

export interface V12Circle {
  x: number;
  y: number;
  radius: number;
  setid: string;
}

export interface V12Drawn {
  /** The data venn.js drew, in order (v12's areas after the zero-size drop). */
  data: V12Subset[];
  circles: Record<string, V12Circle>;
  textCentres: Record<string, { x: number; y: number; disjoint?: boolean }>;
}

/**
 * v12 `ensurePairwiseSubsets`, verbatim but for the comments and two checks the types make
 * redundant (`size !== undefined`, `==`).
 */
export function ensurePairwiseSubsets(subsets: V12Subset[]): V12Subset[] {
  const existingKeys = new Set(subsets.map((s) => [...s.sets].sort().join('|')));
  const individualSetSizes = new Map(
    subsets.filter((s) => s.sets.length === 1).map((s) => [s.sets[0], s.size])
  );
  const synthetic: V12Subset[] = [];
  for (const subset of subsets) {
    if (subset.sets.length < 3) continue;
    const members = [...subset.sets].sort();
    for (let i = 0; i < members.length - 1; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const pair = [members[i]!, members[j]!];
        const key = pair.join('|');
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          const sizeA = individualSetSizes.get(pair[0]);
          const sizeB = individualSetSizes.get(pair[1]);
          const pairSize =
            sizeA !== undefined && sizeB !== undefined ? Math.min(sizeA, sizeB) / 4 : 2.5;
          synthetic.push({ sets: pair, size: pairSize, label: '' });
        }
      }
    }
  }
  return synthetic.length > 0 ? [...subsets, ...synthetic] : subsets;
}

/** What {@link v12Drawn} lays out: v12's subsets, its canvas, title and padding. */
export interface V12Input {
  readonly subsets: V12Subset[];
  readonly width: number;
  readonly height: number;
  /** The diagram's title: with one, v12's chart is `48s` shorter. */
  readonly title?: string;
  /** venn.js's 15, which v12's visible circles used; D412 reads the source's `venn.padding`. */
  readonly padding?: number;
}

/** The circles and text centres v12 drew for `input`. */
export function v12Drawn({ subsets, width, height, title, padding = 15 }: V12Input): V12Drawn {
  const titleHeight = title === undefined ? 0 : 48 * (width / 1600);
  let data = ensurePairwiseSubsets(subsets);
  // VennDiagram's chart(): handle 0-sized sets by removing from input.
  const toRemove = new Set<string>();
  for (const datum of data) {
    if (datum.size === 0 && datum.sets.length === 1) toRemove.add(datum.sets[0]!);
  }
  data = data.filter((datum) => !datum.sets.some((set) => toRemove.has(set)));
  let circles: Record<string, V12Circle> = {};
  let textCentres: V12Drawn['textCentres'] = {};
  if (data.length > 0) {
    let solution = venn.venn(data, { lossFunction: venn.lossFunction } as never);
    solution = venn.normalizeSolution(solution, Math.PI / 2, null as never);
    circles = venn.scaleSolution(solution, width, height - titleHeight, padding, null as never);
    textCentres = venn.computeTextCentres(circles, data, false) as never;
  }
  return { data, circles, textCentres };
}
