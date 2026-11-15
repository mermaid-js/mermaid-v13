import { describe, expect, it } from 'vitest';
import { c4betaDiagramPadding, c4betaStereotypeShown } from '../config.ts';
import { c4betaConfigDefaults } from '../generated/config-defaults.ts';
import { layoutC4Beta } from './layout.ts';
import { prepareC4Beta } from './prepare.ts';
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
    expect(c4betaConfigDefaults).toEqual({
      useMaxWidth: true,
      diagramPadding: 10,
      showStereotypes: true,
    });
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

describe('c4betaStereotypeShown', () => {
  const shown = (
    c4beta: Record<string, unknown>,
    kind: Parameters<ReturnType<typeof c4betaStereotypeShown>>[0]
  ) => c4betaStereotypeShown(beta(c4beta))(kind);

  it('shows every kind when the section is silent', () => {
    expect(shown({}, 'person')).toBe(true);
    expect(c4betaStereotypeShown({} as never)('container')).toBe(true);
  });

  it('showStereotypes: false hides every kind, and wins over a list', () => {
    expect(shown({ showStereotypes: false }, 'softwareSystem')).toBe(false);
    expect(shown({ showStereotypes: false, hideStereotypes: [] }, 'person')).toBe(false);
  });

  it('hideStereotypes hides the kinds it names and no other', () => {
    const c4beta = { hideStereotypes: ['person', 'component'] };
    expect(shown(c4beta, 'person')).toBe(false);
    expect(shown(c4beta, 'component')).toBe(false);
    expect(shown(c4beta, 'softwareSystem')).toBe(true);
    expect(shown(c4beta, 'container')).toBe(true);
  });

  it.each([[[]], ['person'], [null], [{ person: true }], [['nothing']]])(
    'hides nothing for %j, which is not a list of kinds it knows',
    (hideStereotypes) => {
      expect(shown({ hideStereotypes }, 'person')).toBe(true);
    }
  );

  it.each(['no', 0, null, 'false'])(
    'shows the line for showStereotypes %j, which is not false',
    (v) => {
      expect(shown({ showStereotypes: v }, 'person')).toBe(true);
    }
  );
});

describe('the c4-beta element shapes follow the stereotype keys', () => {
  const TEXT = [
    'c4-beta container',
    'person clerk "Clerk" "Posts journal entries and closes the month for every branch office."',
    'softwareSystem ledger "Ledger"',
    'softwareSystem books "Books" {',
    '  container api "API" "Keeps the books." "Rust"',
    '}',
    'clerk --> ledger : "Posts"',
  ].join('\n');

  async function leaves(c4beta?: Record<string, unknown>) {
    const theme = await c4TestTheme('default');
    const { model } = parseC4Beta(TEXT);
    const ctx = c4TestContext(c4TestConfig(undefined, c4beta ? { c4beta } : {}, true), theme);
    return prepareC4Beta(model, ctx).leaves;
  }
  const typeLine = (
    l: { sections: readonly ({ text: { lines: readonly unknown[] } } | undefined)[] } | undefined
  ) => l?.sections[1];

  it('hides the person type line and the line takes no room', async () => {
    const base = await leaves();
    const hidden = await leaves({ hideStereotypes: ['person'] });
    expect(typeLine(base.get('clerk'))).toBeDefined();
    expect(typeLine(hidden.get('clerk'))).toBeUndefined();
    expect(hidden.get('clerk')!.textH).toBeLessThan(base.get('clerk')!.textH);
    expect(typeLine(hidden.get('ledger'))).toBeDefined();
    expect(hidden.get('ledger')!.h).toBe(base.get('ledger')!.h);
  });

  it('a shape shrinks by the line, and a person keeps the height its width asks for', async () => {
    const base = await leaves();
    const hidden = await leaves({ hideStereotypes: ['softwareSystem', 'person'] });
    expect(hidden.get('ledger')!.textH).toBeLessThan(base.get('ledger')!.textH);
    expect(hidden.get('ledger')!.h).toBeLessThan(base.get('ledger')!.h);
    // A person's body is at least as tall as its width asks for, so a short label loses the line
    // from its text but not from its shape.
    expect(hidden.get('clerk')!.h).toBeLessThanOrEqual(base.get('clerk')!.h);
  });

  it('showStereotypes: false hides the line on every element, a technology staying', async () => {
    const off = await leaves({ showStereotypes: false });
    for (const id of ['clerk', 'ledger']) expect(typeLine(off.get(id))).toBeUndefined();
    const api = (await leaves({ showStereotypes: false })).get('api');
    expect(typeLine(api)?.text).toBeDefined();
  });
});
