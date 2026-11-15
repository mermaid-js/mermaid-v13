import { describe, expect, it } from 'vitest';
import { c4betaDiagramPadding } from '../config.ts';
import { c4betaConfigDefaults } from '../generated/config-defaults.ts';
import { layoutC4Beta } from './layout.ts';
import { parseC4Beta } from './parser.ts';
import { c4TestConfig, c4TestContext, c4TestTheme } from '../test-context.ts';
import { renderC4BetaForTest } from '../render/harness.ts';

/**
 * The `c4beta` config section (spec #730 T1): `diagramPadding` is the margin round the drawing, and
 * `useMaxWidth` sizes the root. The public-API cases are in `packages/mermaid/src/c4beta.spec.ts`.
 */
const SOURCE = [
  'c4-beta context',
  'title Ledger',
  'person clerk "Clerk"',
  'softwareSystem ledger "Ledger"',
  'clerk --> ledger : "Posts"',
].join('\n');

const beta = (c4beta: Record<string, unknown>) => c4TestConfig(undefined, { c4beta }, true);

describe('c4betaDiagramPadding', () => {
  it('is the schema default, 10, when the section is silent', () => {
    expect(c4betaConfigDefaults).toEqual({ useMaxWidth: true, diagramPadding: 10 });
    expect(c4betaDiagramPadding(c4TestConfig(undefined, undefined, true))).toBe(10);
    expect(c4betaDiagramPadding({} as never)).toBe(10);
  });

  it('takes a number of at least 0, or a numeric string as its number', () => {
    expect(c4betaDiagramPadding(beta({ diagramPadding: 40 }))).toBe(40);
    expect(c4betaDiagramPadding(beta({ diagramPadding: 0 }))).toBe(0);
    expect(c4betaDiagramPadding(beta({ diagramPadding: '25' }))).toBe(25);
  });

  it.each([-1, 'wide', '', true, null, Number.NaN, Infinity])(
    'draws the default for %s, which is not a length',
    (diagramPadding) => {
      expect(c4betaDiagramPadding(beta({ diagramPadding }))).toBe(10);
    }
  );
});

describe('the c4-beta canvas follows diagramPadding', () => {
  it('grows by twice the change on each axis: 40 against 10 is 60 px wider and taller', async () => {
    const theme = await c4TestTheme('default');
    const { model } = parseC4Beta(SOURCE);
    const at = (diagramPadding?: number) =>
      layoutC4Beta(
        model,
        c4TestContext(
          c4TestConfig(
            undefined,
            diagramPadding === undefined ? {} : { c4beta: { diagramPadding } },
            true
          ),
          theme
        )
      );
    const base = at();
    const wide = at(40);
    expect(wide.width - base.width).toBe(60);
    expect(wide.height - base.height).toBe(60);
    expect(at(0).width - base.width).toBe(-20);
  });
});

describe('the c4-beta root follows c4beta.useMaxWidth', () => {
  it('scales by default and draws at its own size when false', async () => {
    const scaled = await renderC4BetaForTest(SOURCE);
    expect(scaled.svg).toMatch(/ width="100%"/);
    const fixed = await renderC4BetaForTest(SOURCE, { config: { c4beta: { useMaxWidth: false } } });
    expect(fixed.svg).not.toMatch(/ width="100%"|max-width/);
    expect(fixed.svg).toMatch(/ width="\d+" height="\d+"/);
  });

  it('reads c4beta, not c4, when both are set', async () => {
    const config = { c4: { useMaxWidth: false }, c4beta: { useMaxWidth: true } };
    expect((await renderC4BetaForTest(SOURCE, { config })).svg).toMatch(/ width="100%"/);
  });
});
