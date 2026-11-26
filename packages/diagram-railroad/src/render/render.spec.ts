// cspell:words nonterminal
import { describe, expect, it } from 'vitest';
import { assertInert, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { RAILROAD_CONFIG_INVALID } from '../config.ts';
import { layoutRailroad } from '../layout/index.ts';
import { FIXTURES } from '../layout/layout.fixtures.ts';
import { renderRailroadForTest as render } from './harness.ts';

/**
 * The railroad renderer (spec #526 T4): v12's class names and DOM structure
 * (`railroadRenderer.ts`), `data-ast` on each rule and expression `g`, `data-id` on texts, ids
 * only on the title and description, and the colour and font precedence of v12's `styles.ts`
 * (the ported `styles.spec.ts` read v12's CSS text and stays skipped; its cases are here, on the
 * SVG): a `railroad` config key beats the theme variable, which follows the shared variable.
 */
const JSON_RULE = `railroad-beta
value = choice(nonterminal("object"), terminal("true"), special("any"), optional(terminal("x")), zeroOrMore(terminal(",")), oneOrMore(terminal(";"))) ;
`;

const tagOf = (t: SvgTree, n: SvgNode): string => t.tag(n) ?? '#text';
const cls = (t: SvgTree, n: SvgNode): string => t.getAttr(n, 'class') ?? '';
const kids = (t: SvgTree, n: SvgNode): SvgNode[] =>
  t.children(n).filter((c) => t.tag(c) !== undefined);
const textOf = (t: SvgTree, n: SvgNode): string =>
  t.textOf(n) ??
  t
    .children(n)
    .map((c) => textOf(t, c))
    .join('');
const shape = (t: SvgTree, n: SvgNode): string =>
  `${tagOf(t, n)}${cls(t, n) ? '.' + cls(t, n).split(' ').join('.') : ''}`;

async function tree(src: string, config?: Record<string, unknown>) {
  const r = await render(src, { tree: true, ...(config ? { config } : {}) });
  return { ...r, t: r.tree! };
}

describe('railroad SVG structure (v12 class names)', () => {
  it('writes v12’s rule group: definition, name, markers, lead lines', async () => {
    const { t } = await tree('railroad-beta\na = terminal("x") ;\n');
    const root = t.find({ tag: 'svg' })[0]!;
    expect(cls(t, root).split(' ')).toContain('railroad-diagram');
    const [rule] = t.find({ class: 'railroad-rule' });
    expect(t.getAttr(rule!, 'transform')).toBe('translate(0,10)');
    expect(t.getAttr(rule!, 'data-ast')).toBe('rule:a');
    expect(kids(t, rule!).map((n) => shape(t, n))).toEqual([
      'g',
      'g.railroad-rule-name-group',
      'g.railroad-start',
      'g.railroad-end',
      'path.railroad-line',
      'path.railroad-line',
    ]);
    const [def, name, start, end] = kids(t, rule!);
    expect(t.getAttr(def!, 'data-ast')).toBeUndefined();
    expect(kids(t, def!).map((n) => shape(t, n))).toEqual(['g.railroad-terminal']);
    const terminal = kids(t, def!)[0]!;
    expect(t.getAttr(terminal, 'transform')).toBeUndefined();
    expect(kids(t, terminal).map((n) => tagOf(t, n))).toEqual(['rect', 'text']);
    const [rect, text] = kids(t, terminal);
    expect([t.getAttr(rect!, 'rx'), t.getAttr(rect!, 'ry')]).toEqual(['10', '10']);
    expect(textOf(t, text!)).toBe('x');
    expect(t.getAttr(text!, 'text-anchor')).toBe('middle');
    expect(t.getAttr(text!, 'dominant-baseline')).toBe('middle');
    const label = kids(t, name!)[0]!;
    expect(shape(t, label)).toBe('text.railroad-rule-name');
    expect(textOf(t, label)).toBe('a =');
    expect(t.getAttr(label, 'font-weight')).toBe('bold');
    // The rule name's text carries its rule's data-id; its group, no source mapping.
    expect(t.getAttr(label, 'data-id')).toBe('rule:a');
    expect(t.getAttr(label, 'data-ast')).toBeUndefined();
    expect(t.getAttr(name!, 'data-id')).toBeUndefined();
    expect(kids(t, start!).map((n) => tagOf(t, n))).toEqual(['circle']);
    expect(t.getAttr(kids(t, end!)[0]!, 'r')).toBe('5');
  });

  it('nests every kind as g.railroad-<kind>, in v12’s DOM order', async () => {
    const { t } = await tree(JSON_RULE);
    for (const kind of ['choice', 'terminal', 'nonterminal', 'special', 'optional', 'repetition'])
      expect(t.find({ class: `railroad-${kind}` }).length, kind).toBeGreaterThan(0);
    const choice = t.find({ class: 'railroad-choice' })[0]!;
    const order = kids(t, choice).map((n) => tagOf(t, n));
    // v12 `renderChoice` (L243-300): each branch, then its left and right paths.
    expect(order).toEqual(Array.from({ length: 6 }, () => ['g', 'path', 'path']).flat());
    // Each alternative is translated in the choice; each choice path is a track.
    for (const g of kids(t, choice).filter((n) => tagOf(t, n) === 'g'))
      expect(t.getAttr(g, 'transform')).toMatch(/^translate\(/);
    const special = t.find({ class: 'railroad-special' })[0]!;
    const [rect, text] = kids(t, special);
    expect(t.getAttr(rect!, 'stroke-dasharray')).toBe('5,3');
    expect(t.getAttr(rect!, 'rx')).toBeUndefined();
    expect(textOf(t, text!)).toBe('? any ?');
    const nonterminal = t.find({ class: 'railroad-nonterminal' })[0]!;
    expect(t.getAttr(kids(t, nonterminal)[0]!, 'rx')).toBeUndefined();
    for (const p of t.find({ tag: 'path' })) {
      expect(cls(t, p)).toBe('railroad-line');
      expect(t.getAttr(p, 'fill')).toBe('none');
      const d = t.getAttr(p, 'd') ?? '';
      expect(d.startsWith('M') && !/[^MLA\d., -]/.test(d), d).toBe(true);
    }
  });

  it('writes a sequence’s elements and connectors interleaved, as v12', async () => {
    const { t } = await tree(
      'railroad-beta\na = sequence(terminal("x"), nonterminal("y"), terminal("z")) ;\n'
    );
    const seq = t.find({ class: 'railroad-sequence' })[0]!;
    // v12 `renderSequence` (L186-204): child, connector, child, connector, child.
    expect(kids(t, seq).map((n) => shape(t, n))).toEqual([
      'g.railroad-terminal',
      'path.railroad-line',
      'g.railroad-nonterminal',
      'path.railroad-line',
      'g.railroad-terminal',
    ]);
    const opt = await tree('railroad-beta\na = zeroOrMore(terminal("x")) ;\n');
    const rep = opt.t.find({ class: 'railroad-repetition' })[0]!;
    expect(kids(opt.t, rep).map((n) => tagOf(opt.t, n))).toEqual([
      'g',
      'path',
      'path',
      'path',
      'path',
    ]);
  });

  it('puts data-ast on rules and expressions only, data-id on texts (pitfall 12)', async () => {
    const r = await tree(JSON_RULE);
    const { t } = r;
    const withAst = t.find({}).filter((n) => t.getAttr(n, 'data-ast') !== undefined);
    expect(withAst.every((n) => tagOf(t, n) === 'g')).toBe(true);
    // README T4: every element drawn from the AST carries both.
    for (const n of withAst) expect(t.getAttr(n, 'data-id')).toBe(t.getAttr(n, 'data-ast'));
    const ids = withAst.map((n) => t.getAttr(n, 'data-ast'));
    expect(new Set(ids).size).toBe(ids.length);
    const model: string[] = [];
    const visit = (n: { astId: string; type: string } & Record<string, unknown>): void => {
      model.push(n.astId);
      for (const c of [n.element, ...((n.elements ?? n.alternatives ?? []) as unknown[])])
        if (c) visit(c as never);
    };
    for (const rule of r.model.rules) {
      model.push(r.ast!.children.find((c) => c.type === 'Rule')!.id);
      visit(rule.definition as never);
    }
    expect(new Set(ids)).toEqual(new Set(model));
    for (const text of t.find({ tag: 'text' })) {
      expect(t.getAttr(text, 'data-ast')).toBeUndefined();
      expect(ids).toContain(t.getAttr(text, 'data-id'));
    }
  });

  it('writes ids only on the title and description', async () => {
    const { svg } = await render(
      'railroad-beta\naccTitle: Grammar\naccDescr: The rules\na = terminal("x") ;\n',
      { idPrefix: 'g1' }
    );
    expect([...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])).toEqual(['g1-title', 'g1-desc']);
    expect(svg).toContain('aria-labelledby="g1-title"');
    expect(svg).toContain('aria-describedby="g1-desc"');
    expect(svg).not.toMatch(/<marker|<style|foreignObject/);
  });

  it('names the notation as the role description, and leaves the title undrawn (D218)', async () => {
    for (const [header, type] of [
      ['railroad-beta', 'railroad'],
      ['railroad-ebnf-beta', 'railroadEbnf'],
      ['railroad-abnf-beta', 'railroadAbnf'],
      ['railroad-peg-beta', 'railroadPeg'],
    ] as const) {
      const body =
        type === 'railroad'
          ? 'a = terminal("x") ;'
          : type === 'railroadPeg'
            ? 'a <- "x" ;'
            : 'a = "x" ;';
      const src = `${header}\ntitle Hidden\n${body}\n`;
      const { svg } = await render(src);
      expect(svg, type).toContain(`aria-roledescription="${type}"`);
      expect(svg, type).not.toContain('Hidden');
    }
  });

  it('draws an empty diagram on v12’s 200 × 100 canvas', async () => {
    const { svg } = await render('railroad-beta\n');
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).not.toContain('<g');
  });

  it('honours useMaxWidth', async () => {
    const wide = await render('railroad-beta\na = terminal("x") ;\n');
    expect(wide.svg).toMatch(/width="100%"[^>]*style="max-width:[\d.]+px/);
    const fixed = await render('railroad-beta\na = terminal("x") ;\n', {
      config: { railroad: { useMaxWidth: false } },
    });
    expect(fixed.svg).toMatch(/width="[\d.]+" height="[\d.]+"/);
  });

  it('passes the allow-list and renders deterministically in every theme and auto', async () => {
    for (const theme of ['default', 'dark', 'redux-color', 'neo-dark', 'auto']) {
      const a = await render(JSON_RULE, { config: { theme } });
      const b = await render(JSON_RULE, { config: { theme } });
      expect(() => assertInert(a.svg, { themeStyle: a.themeStyle }), theme).not.toThrow();
      expect(a.svg, theme).toBe(b.svg);
      expect(a.svg, theme).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('railroad colours and fonts (v12 styles.spec.ts, on the SVG)', () => {
  const paintOf = async (
    config: Record<string, unknown>,
    selector: string,
    attr: 'fill' | 'stroke'
  ) => {
    const { t } = await tree(JSON_RULE, { theme: 'default', ...config });
    const [g] = t.find({ class: selector });
    const leaf = selector.startsWith('railroad-') && g && t.tag(g) === 'g' ? kids(t, g)[0]! : g!;
    return t.getAttr(leaf, attr);
  };

  it('draws each part in its theme variable by default', async () => {
    const { svg } = await render(JSON_RULE, { config: { theme: 'default' } });
    for (const alias of [
      'rtf',
      'rts',
      'rtt',
      'rnf',
      'rns',
      'rnt',
      'rrl',
      'rrm',
      'rsf',
      'rss',
      'rrn',
    ])
      expect(svg, alias).toContain(`var(--_${alias})`);
    expect(svg).toContain('--_rtf:var(--mermaid-railroadTerminalFill,#ffffde)');
  });

  it('declares only the colours a diagram draws', async () => {
    const { svg } = await render('railroad-beta\na = terminal("x") ;\n', {
      config: { theme: 'default' },
    });
    expect(svg).toContain('--_rtf:');
    expect(svg).not.toMatch(/--_r(nf|ns|nt|sf|ss):/);
  });

  it('lets each railroad colour key beat the theme (D515, D516)', async () => {
    const config = {
      railroad: {
        terminalFill: '#FF0000',
        terminalStroke: '#00FF00',
        terminalTextColor: '#0000FF',
        nonTerminalFill: '#AAAAAA',
        nonTerminalStroke: '#BBBBBB',
        nonTerminalTextColor: '#CCCCCC',
        lineColor: '#FF00FF',
        markerFill: '#123456',
        specialFill: '#E0E0FF',
        specialStroke: '#9900DD',
        ruleNameColor: '#990000',
      },
    };
    const { t, svg } = await tree(JSON_RULE, config);
    const first = (c: string, i = 0) => kids(t, t.find({ class: c })[0]!)[i]!;
    expect(t.getAttr(first('railroad-terminal'), 'fill')).toBe('#FF0000');
    expect(t.getAttr(first('railroad-terminal'), 'stroke')).toBe('#00FF00');
    expect(t.getAttr(first('railroad-terminal', 1), 'fill')).toBe('#0000FF');
    expect(t.getAttr(first('railroad-nonterminal'), 'fill')).toBe('#AAAAAA');
    expect(t.getAttr(first('railroad-nonterminal'), 'stroke')).toBe('#BBBBBB');
    expect(t.getAttr(first('railroad-nonterminal', 1), 'fill')).toBe('#CCCCCC');
    expect(t.getAttr(first('railroad-special'), 'fill')).toBe('#E0E0FF');
    expect(t.getAttr(first('railroad-special'), 'stroke')).toBe('#9900DD');
    // v12's special text is the nonterminal text colour.
    expect(t.getAttr(first('railroad-special', 1), 'fill')).toBe('#CCCCCC');
    expect(t.getAttr(first('railroad-start'), 'fill')).toBe('#123456');
    expect(t.getAttr(t.find({ class: 'railroad-rule-name' })[0]!, 'fill')).toBe('#990000');
    for (const p of t.find({ tag: 'path' })) expect(t.getAttr(p, 'stroke')).toBe('#FF00FF');
    expect(svg).not.toMatch(/--_r[a-z]+:var\(--mermaid-railroad/);
  });

  it('beats themeVariables.railroad.* too, which beat the shared variables', async () => {
    const nested = await paintOf(
      { themeVariables: { railroad: { terminalFill: '#111111' } } },
      'railroad-terminal',
      'fill'
    );
    expect(nested).toBe('var(--_rtf)');
    const { svg } = await render(JSON_RULE, {
      config: { theme: 'default', themeVariables: { railroad: { terminalFill: '#111111' } } },
    });
    expect(svg).toContain('--_rtf:var(--mermaid-railroadTerminalFill,#111111)');
    const config = await paintOf(
      {
        themeVariables: { railroad: { terminalFill: '#111111' } },
        railroad: { terminalFill: '#222222' },
      },
      'railroad-terminal',
      'fill'
    );
    expect(config).toBe('#222222');
  });

  it('uses the stroke width, font family and font size of the config', async () => {
    const { t } = await tree(JSON_RULE, {
      railroad: { strokeWidth: 4, fontFamily: 'Courier', fontSize: 18 },
    });
    const root = t.find({ tag: 'svg' })[0]!;
    expect(t.getAttr(root, 'stroke-width')).toBe('4');
    expect(t.getAttr(root, 'font-family')).toBe('Courier');
    expect(t.getAttr(root, 'font-size')).toBe('18');
  });

  it('uses the theme’s font where the config sets none', async () => {
    const { t, svg } = await tree(JSON_RULE, { theme: 'default' });
    const root = t.find({ tag: 'svg' })[0]!;
    expect(t.getAttr(root, 'font-family')).toBe('var(--_ff)');
    expect(t.getAttr(root, 'font-size')).toBe('var(--_fs)');
    expect(svg).toContain('--_fs:var(--mermaid-fontSize,');
    expect(svg).toContain('--_ff:var(--mermaid-fontFamily,');
  });

  it('accepts a railroad.fontSize of 0, as v12’s sanitizeNumberValue did', async () => {
    const r = await tree(JSON_RULE, { railroad: { fontSize: 0 } });
    expect(r.t.getAttr(r.t.find({ tag: 'svg' })[0]!, 'font-size')).toBe('0');
    expect(r.layout.fonts.text.size).toBe(0);
    expect(r.warnings.filter((w) => w.code === RAILROAD_CONFIG_INVALID)).toEqual([]);
  });

  it('drops an unusable colour or font with one RAILROAD_CONFIG_INVALID (D515)', async () => {
    const r = await tree(JSON_RULE, {
      theme: 'default',
      railroad: {
        lineColor: 'red; display: none',
        terminalFill: 'url(#x)',
        fontFamily: 'Arial; color: red',
        fontSize: -3,
        markerFill: 'blue',
      },
    });
    const invalid = r.warnings.filter((w) => w.code === RAILROAD_CONFIG_INVALID);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]!.message).toContain('railroad.lineColor');
    expect(invalid[0]!.message).toContain('railroad.terminalFill');
    expect(invalid[0]!.message).toContain('railroad.fontFamily');
    expect(invalid[0]!.message).toContain('railroad.fontSize');
    expect(invalid[0]!.message).not.toContain('markerFill');
    const { t } = r;
    expect(t.getAttr(t.find({ tag: 'path' })[0]!, 'stroke')).toBe('var(--_rrl)');
    expect(t.getAttr(kids(t, t.find({ class: 'railroad-start' })[0]!)[0]!, 'fill')).toBe('blue');
    expect(t.getAttr(t.find({ tag: 'svg' })[0]!, 'font-family')).toBe('var(--_ff)');
    expect(r.svg).not.toContain('display');
    // The layout checks the section and warns; drawing it again does not warn again.
    const warned: string[] = [];
    const layout = layoutRailroad(r.model, {
      config: r.config,
      measurer: tableMeasurer,
      theme: createTheme(await loadTheme('default'), {}),
      warn: (w) => void warned.push(w.code),
    });
    expect(warned).toEqual([RAILROAD_CONFIG_INVALID]);
    expect(layout.config.dropped).toHaveLength(4);
    const clean = await render(JSON_RULE, { config: { railroad: { lineColor: 'red' } } });
    expect(clean.warnings.filter((w) => w.code === RAILROAD_CONFIG_INVALID)).toEqual([]);
  });
});

describe('blank and spaced terminals (#774)', () => {
  const source = FIXTURES.find(([path]) => path.endsWith('ir-blank-and-spaced-terminals'))![1];

  /** Each terminal's text (as written), its rect and its `<text>`, in drawing order. */
  async function terminals() {
    const r = await tree(source);
    const { t } = r;
    return {
      ...r,
      boxes: t.find({ class: 'railroad-terminal' }).map((g) => {
        const [rect, text] = kids(t, g);
        const num = (k: 'width' | 'height' | 'rx') => Number(t.getAttr(rect!, k));
        return {
          text: text ? textOf(t, text) : '',
          width: num('width'),
          height: num('height'),
          rx: num('rx'),
          space: text ? t.getAttr(text, 'xml:space') : undefined,
        };
      }),
    };
  }

  it('draws an empty or whitespace-only terminal as v12’s 20 × 20 circle', async () => {
    const { boxes } = await terminals();
    const blank = boxes.filter((b) => b.text.trim() === '');
    expect(blank.map((b) => b.text)).toEqual([' ', '\t', '']);
    for (const b of blank) expect([b.width, b.height, b.rx]).toEqual([20, 20, 10]);
    // A blank text draws nothing either way, so its spaces are not kept.
    expect(blank.map((b) => b.space)).toEqual([undefined, undefined, undefined]);
    const x = boxes.find((b) => b.text === 'x')!;
    expect(x.height).toBeGreaterThan(20);
  });

  it('draws a terminal’s spaces as written, at the width it was measured for', async () => {
    const { boxes, layout } = await terminals();
    const by = new Map(boxes.map((b) => [b.text, b]));
    const font = layout.fonts.text;
    const padding = layout.config.lengths.padding;
    const measured = (s: string) => tableMeasurer.width(s, font, 0) + 2 * padding;
    expect(by.get('a  b')!.width).toBeCloseTo(measured('a  b'), 1);
    expect(by.get('a  b')!.width).toBeGreaterThan(by.get('a b')!.width);
    for (const kept of ['a  b', ' a', 'a ', 'a\tb']) expect(by.get(kept)!.space).toBe('preserve');
    for (const plain of ['a b', 'x']) expect(by.get(plain)!.space).toBeUndefined();
    // A tab is drawn as a space where spaces are kept, so it is measured as one.
    expect(by.get('a\tb')!.width).toBeCloseTo(by.get('a b')!.width, 2);
  });

  it('keeps the spaces of nonterminal and special texts as before', async () => {
    const { t } = await tree(
      'railroad-beta\na = sequence(nonterminal("q  r"), special("s  t")) ;\n'
    );
    for (const g of [
      ...t.find({ class: 'railroad-nonterminal' }),
      ...t.find({ class: 'railroad-special' }),
    ])
      expect(t.getAttr(kids(t, g)[1]!, 'xml:space')).toBeUndefined();
  });
});

// D710 (spec #1333 T3): terminals and names stay literal, as D268 keeps identifiers; a special
// sequence follows the label rule (`<br>`, the drawn tags, entities, markdown only in a markdown
// string), and its box is sized from the measured label.
describe('label markup (D710)', () => {
  const box = (t: SvgTree, g: SvgNode) => {
    const [rect, text] = kids(t, g);
    return {
      text: textOf(t, text!),
      tspans: kids(t, text!).map((s) => ({
        text: textOf(t, s),
        weight: t.getAttr(s, 'font-weight'),
        style: t.getAttr(s, 'font-style'),
      })),
      width: Number(t.getAttr(rect!, 'width')),
      height: Number(t.getAttr(rect!, 'height')),
    };
  };
  const specials = async (...texts: string[]) => {
    const args = texts.map((s) => `special(${JSON.stringify(s)})`).join(', ');
    const { t } = await tree(`railroad-beta\na = sequence(${args}, special("plain")) ;\n`);
    return t.find({ class: 'railroad-special' }).map((g) => box(t, g));
  };

  it('draws terminals, nonterminals and rule names as written', async () => {
    const { t } = await tree(
      'railroad-beta\na = sequence(terminal("<b>x</b>"), nonterminal("<i>y</i><br>z"), terminal("**w**")) ;\n'
    );
    const terminals = t.find({ class: 'railroad-terminal' }).map((g) => box(t, g));
    expect(terminals.map((b) => [b.text, b.tspans.length])).toEqual([
      ['<b>x</b>', 0],
      ['**w**', 0],
    ]);
    const [nt] = t.find({ class: 'railroad-nonterminal' }).map((g) => box(t, g));
    expect([nt!.text, nt!.tspans.length]).toEqual(['<i>y</i><br>z', 0]);
  });

  it('breaks a special at <br> and grows its box by a line', async () => {
    const [br, plain] = await specials('a<br>b');
    expect(br!.tspans.map((s) => s.text)).toEqual(['? a', 'b ?']);
    expect(br!.height).toBeGreaterThan(plain!.height);
  });

  it('draws a special’s <b> and <i> bold and italic, without the tags', async () => {
    const [s] = await specials('<b>bold</b> and <i>it</i>');
    expect(s!.text).toBe('? bold and it ?');
    expect(s!.tspans.find((x) => x.text === 'bold')?.weight).toBe('bold');
    expect(s!.tspans.find((x) => x.text === 'it')?.style).toBe('italic');
  });

  it('renders a special in backticks as markdown; without them, asterisks stay', async () => {
    const [md, literal] = await specials('`**bold** *it*`', '**x**');
    expect(md!.text).toBe('? bold it ?');
    expect(md!.tspans.find((x) => x.text === 'bold')?.weight).toBe('bold');
    expect(literal!.text).toBe('? **x** ?');
    expect(literal!.tspans).toEqual([]);
  });

  it('sizes a formatted special’s box from the measured label', async () => {
    const { layout } = await tree('railroad-beta\na = special("<b>wide bold text</b>") ;\n');
    const e = layout.rules[0]!.definition;
    const p = layout.config.lengths.padding;
    expect(e.text?.label).toBeDefined();
    expect(e.box!.width).toBeCloseTo(e.text!.label!.width + 2 * p, 6);
    expect(e.box!.height).toBeCloseTo(e.text!.label!.height + 2 * p, 6);
  });
});
