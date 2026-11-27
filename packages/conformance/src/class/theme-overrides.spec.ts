/**
 * #1037 (spec #1035 T0, D654): class's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, parseColor } from '@mermaid-js/core/theme';
import { classDiagram } from '@mermaid-js/diagram-class';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { hex } from '../hex.ts';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';
import { parseSvg } from '../svg-tree.ts';

/** v12 12.2.0's class colours: `capture-theme-overrides.ts class`. */
const V12: ReferenceTable = {
  default: {
    classText: {
      none: '#131300',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  dark: {
    classText: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  forest: {
    classText: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  neutral: {
    classText: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  base: {
    classText: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['classText'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('class colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(classDiagram.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});

/**
 * #1327 (spec #1334 T3): a relation label's tag is filled with classEdgeLabelBackground (the
 * shared edgeLabelBackground unless set, D628, D715) and inked with classEdgeLabelColor,
 * textColor where that reads on the tag (D713).
 */
describe('the class relation-label tag (#1327)', () => {
  // The class corpus writes `&lt;&lt;interface&gt;&gt;` for v12's HTML page; the e2e runner
  // decodes it before `render()` (packages/dev `asHostText`), and so does this spec.
  const fixture = (path: string) =>
    readFileSync(join(REPO_ROOT, 'e2e/diagrams/class-diagram', path), 'utf8')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
  const render = async (source: string, themeVariables?: Record<string, string>) => {
    const m = createMermaid();
    m.initialize({
      deterministic: true,
      output: { cssVariables: false },
      ...(themeVariables && { themeVariables }),
    } as InitializeConfig);
    return (await m.render('tag1327', source)).svg;
  };
  const tags = (svg: string) => {
    const tree = parseSvg(svg);
    return tree.find({ class: 'edgeLabel' }).map((g) => {
      const [rect, text] = ['rect', 'text'].map((tag) =>
        tree.children(g).find((c) => tree.tag(c) === tag)
      );
      return {
        fill: hex(tree.getAttr(rect!, 'fill'), String),
        ink: hex(tree.getAttr(text!, 'fill'), String),
      };
    });
  };

  it.each(['edgeLabelBackground', 'classEdgeLabelBackground'])(
    'recolours only the tags when %s is set',
    async (name) => {
      const source = fixture('baseline/edge-labels/tags.mmd');
      const plain = await render(source);
      const tagged = await render(source, { [name]: '#ffe0a0' });
      expect(tags(plain).map((t) => t.fill)).toEqual(Array(4).fill('#ffffff'));
      expect(tags(tagged).map((t) => t.fill)).toEqual(Array(4).fill('#ffe0a0'));
      // Nothing else moves: the canvas and every other paint stay as they were.
      expect(tagged.replaceAll('#ffe0a0', '#ffffff')).toBe(plain);
    }
  );

  it("inks the #1327 repro's labels so they read on the tag", async () => {
    const svg = await render(
      fixture('nightly-check/should-render-a-simple-class-diagram-with-a-custom-theme.mmd')
    );
    const found = tags(svg);
    expect(found).toHaveLength(3);
    for (const { fill, ink } of found)
      expect(
        contrastRatio(parseColor(ink)!, parseColor(fill)!),
        `${ink} on ${fill}`
      ).toBeGreaterThanOrEqual(4.5);
  });
});
