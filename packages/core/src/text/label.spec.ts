import { describe, expect, it } from 'vitest';
import { streamWriter } from '../svg/index.ts';
import {
  Style,
  inlineSpans,
  layoutLabel,
  tableMeasurer,
  type FontKey,
  type LabelMarkup,
  type LabelOptions,
  type MeasuredLabel,
} from './index.ts';

// Arial at 10px: a 5.56, space 2.78, x 5, - 3.33; characters outside Latin-1 (•, ◦) take the
// mean a–z advance, 4.89; CJK and emoji take one em, 10. Bold a is also 5.56.
const arial: FontKey = { family: 'Arial', size: 10, weight: 400 };
const layout = (raw: string, maxWidth = Infinity, markdown = false): MeasuredLabel =>
  layoutLabel(raw, arial, maxWidth, tableMeasurer, { markdown });
const texts = (box: MeasuredLabel): string[] =>
  box.lines.map((line) => line.map((r) => r.text).join(''));
const runs = (box: MeasuredLabel): [string, number][][] =>
  box.lines.map((line) => line.map((r): [string, number] => [r.text, r.style]));

describe('plain labels', () => {
  it('measures a label that fits as one run on one line', () => {
    const box = layout('aaa aaa', 100);
    expect(runs(box)).toEqual([[['aaa aaa', 0]]]);
    expect(box.width).toBeCloseTo(36.14, 9);
    expect(box.lineHeight).toBeCloseTo(11.5, 9); // Arial hhea: ascent + descent + line gap
    expect(box.baseline).toBeCloseTo(9.05, 9);
    expect(box.height).toBeCloseTo(11.5, 9);
  });

  it('measures the label once on the fast path', () => {
    let calls = 0;
    const counting = {
      ...tableMeasurer,
      width: (...a: Parameters<typeof tableMeasurer.width>) => (calls++, tableMeasurer.width(...a)),
    };
    layoutLabel('  Hello World  ', arial, 200, counting);
    expect(calls).toBe(1);
  });

  it('returns an empty box for an empty label', () => {
    expect(layout('')).toMatchObject({ lines: [], width: 0, height: 0 });
  });

  it('wraps greedily at spaces only when the label overflows', () => {
    // 'aaa aaa' = 36.14, 'aaa aaa aaa' = 55.6
    const box = layout('aaa aaa aaa aaa aaa', 40);
    expect(texts(box)).toEqual(['aaa aaa', 'aaa aaa', 'aaa']);
    expect(box.width).toBeCloseTo(36.14, 9);
    expect(box.widths.map((w) => +w.toFixed(2))).toEqual([36.14, 36.14, 16.68]);
    expect(box.height).toBeCloseTo(3 * 11.5, 9);
  });

  it('splits a word wider than the box at characters so nothing overflows', () => {
    // 7 × a = 38.92 fits in 40; 8 do not.
    expect(texts(layout('aaaaaaaaaaaaaaaaaa', 40))).toEqual(['aaaaaaa', 'aaaaaaa', 'aaaa']);
  });

  it('with keepWords, keeps a word wider than the box whole on its own line', () => {
    const keep = (raw: string, markdown = false): MeasuredLabel =>
      layoutLabel(raw, arial, 40, tableMeasurer, { keepWords: true, markdown });
    // 18 × a = 100.08; 'aaa aaa' = 36.14 still wraps as without the option.
    const box = keep('aaa aaaaaaaaaaaaaaaaaa aaa aaa');
    expect(texts(box)).toEqual(['aaa', 'aaaaaaaaaaaaaaaaaa', 'aaa aaa']);
    expect(box.width).toBeCloseTo(100.08, 9);
    expect(box.widths.map((w) => +w.toFixed(2))).toEqual([16.68, 100.08, 36.14]);
    expect(box.height).toBeCloseTo(3 * 11.5, 9);
    // The slow path (markup) and a word alone keep it whole too.
    expect(texts(keep('**aaaaaaaaaaaaaaaaaa**', true))).toEqual(['aaaaaaaaaaaaaaaaaa']);
    expect(keep('aaaaaaaaaaaaaaaaaa').width).toBeCloseTo(100.08, 9);
    // Words that fit wrap exactly as without the option.
    expect(keep('aaa aaa aaa aaa aaa')).toEqual(layout('aaa aaa aaa aaa aaa', 40));
  });

  it('measures each word of a wrapped label once, and a long word once per character', () => {
    const measured: string[] = [];
    const counting = {
      ...tableMeasurer,
      width: (...a: Parameters<typeof tableMeasurer.width>) => (
        measured.push(a[0]),
        tableMeasurer.width(...a)
      ),
    };
    const long = 'abcdefghij'.repeat(30);
    const box = layoutLabel(`one two three ${long} four`, arial, 40, counting);
    expect(box.lines.length).toBeGreaterThan(5);
    const repeats = measured.filter((t, i) => t.length > 1 && measured.indexOf(t) !== i);
    // Only the per-line run measure in finish repeats a string; nothing is measured per prefix.
    expect(measured.filter((t) => t.length > 1).length).toBeLessThan(box.lines.length + 10);
    expect(repeats.length).toBeLessThanOrEqual(box.lines.length);
  });

  it('breaks lines at <br>, newlines and the two-character \\n', () => {
    expect(texts(layout('a<br>b<BR/>c<br />d\ne\\nf'))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('keeps empty lines from consecutive breaks', () => {
    expect(texts(layout('a<br><br>b'))).toEqual(['a', '', 'b']);
  });

  it('collapses runs of spaces as SVG text does', () => {
    expect(texts(layout('a   b\t c'))).toEqual(['a b c']);
  });

  it('never treats "- " or "* " as a bullet', () => {
    expect(texts(layout('- one\n* two'))).toEqual(['- one', '* two']);
  });

  it('keeps markdown markers as literal text', () => {
    expect(runs(layout('**a** _b_ `c`'))).toEqual([[['**a** _b_ `c`', 0]]]);
  });

  it('uses the base style from the options', () => {
    const box = layoutLabel('aaa', arial, Infinity, tableMeasurer, { style: Style.Italic });
    expect(runs(box)).toEqual([[['aaa', Style.Italic]]]);
  });
});

describe('wrapping (R-TEXT-8)', () => {
  it('breaks between CJK characters, which measure one em', () => {
    // 漢 = 10 each, so 4 fit in 45
    const box = layout('漢字漢字漢字', 45);
    expect(texts(box)).toEqual(['漢字漢字', '漢字']);
    expect(box.widths).toEqual([40, 20]);
  });

  it('keeps closing punctuation with the character before it (kinsoku)', () => {
    // '漢字漢。' would start the next line with '。' if broken after the fourth character.
    expect(texts(layout('漢字漢字。字', 45))).toEqual(['漢字漢', '字。字']);
  });

  it('keeps opening punctuation with the character after it (kinsoku)', () => {
    expect(texts(layout('漢字漢「字」', 45))).toEqual(['漢字漢', '「字」']);
  });

  it('measures emoji as wide and never splits a surrogate pair', () => {
    const box = layout('😀😀😀😀😀', 25);
    expect(texts(box)).toEqual(['😀😀', '😀😀', '😀']);
    expect(box.widths).toEqual([20, 20, 10]);
  });

  it('breaks at a zero-width space and drops it from the output', () => {
    // aaaa = 22.24
    expect(texts(layout('aaaa\u200baaaa', 30))).toEqual(['aaaa', 'aaaa']);
    expect(texts(layout('aaaa\u200baaaa'))).toEqual(['aaaaaaaa']);
  });

  it('breaks at a soft hyphen, which shows as "-" only at the break', () => {
    // 'aaaa-' = 25.57 fits 30; the whole word does not
    expect(texts(layout('aaaa\u00adaaaa', 30))).toEqual(['aaaa-', 'aaaa']);
    expect(texts(layout('aaaa\u00adaaaa'))).toEqual(['aaaaaaaa']);
    expect(texts(layout('aa\u00ad', 30))).toEqual(['aa']);
  });

  it('does not break at a soft hyphen when the rest of the word fits', () => {
    // 'x aaaa' = 30.02 fits 31 but 'x aa-' = 22.23 would fit too: the word stays whole
    expect(texts(layout('x aa\u00adaa', 31))).toEqual(['x aaaa']);
  });

  // #394: a hyphen in the text is a break opportunity (UAX #14 HY), as in v12's HTML labels.
  it('breaks after a hyphen between letters before splitting a word (#394)', () => {
    // 'aaaa-' = 25.57 fits 35, 'aaaa-a' = 31.13 would too: the break is at the hyphen
    expect(texts(layout('aaaa-aaaa', 35))).toEqual(['aaaa-', 'aaaa']);
    // 'aa aaa-' = 33.91 fits 35
    expect(texts(layout('aa aaa-aaa', 35))).toEqual(['aa aaa-', 'aaa']);
    // Every hyphen is a break; no line starts with one.
    // 'one-to-zero-' = 54.46 and 'or-one-non-' = 52.24 fit 60.
    expect(texts(layout('one-to-zero-or-one-non-identifying', 60))).toEqual([
      'one-to-zero-',
      'or-one-non-',
      'identifying',
    ]);
    // A label that fits, and the slow path, are unchanged.
    expect(texts(layout('aaaa-aaaa'))).toEqual(['aaaa-aaaa']);
    expect(texts(layout('**aaaa-aaaa**', 35, true))).toEqual(['aaaa-', 'aaaa']);
  });

  it('splits the part before a hyphen only when that part alone is too wide (#394)', () => {
    // 'aaaaaaaa-' = 47.81 does not fit 40: it is split, then 'a' follows the hyphen
    expect(texts(layout('aaaaaaaa-a', 40))).toEqual(['aaaaaaa', 'a-a']);
    const keep = layoutLabel('aaaaaaaaaa-aaaaaaaaaa', arial, 40, tableMeasurer, {
      keepWords: true,
    });
    expect(texts(keep)).toEqual(['aaaaaaaaaa-', 'aaaaaaaaaa']);
  });

  it('does not break at a hyphen before a digit, after a leading hyphen or in a run (#394)', () => {
    const keep = (raw: string): string[] =>
      texts(layoutLabel(raw, arial, 20, tableMeasurer, { keepWords: true }));
    expect(keep('2020-01-15')).toEqual(['2020-01-15']);
    expect(keep('aaaa-1')).toEqual(['aaaa-1']);
    expect(keep('-aaaa')).toEqual(['-aaaa']);
    expect(keep('aa--aa')).toEqual(['aa--aa']);
    expect(keep('aa-)')).toEqual(['aa-)']);
    expect(keep('a1-2b-cd')).toEqual(['a1-2b-', 'cd']);
  });

  it('wraps a long hyphenated word with one measure per piece', () => {
    let calls = 0;
    const counting = {
      ...tableMeasurer,
      width: (...a: Parameters<typeof tableMeasurer.width>) => (calls++, tableMeasurer.width(...a)),
    };
    const box = layoutLabel('ab-'.repeat(2000) + 'ab', arial, 40, counting);
    expect(box.lines.length).toBeGreaterThan(100);
    // One measure per piece (2001), one per drawn line, the fast-path try and a few small widths.
    expect(calls).toBeLessThan(2001 + box.lines.length + 10);
  });
});

describe('HTML subset (R-TEXT-3)', () => {
  const B = Style.Bold;
  const I = Style.Italic;

  it('turns <b>, <strong>, <i> and <em> into style bits', () => {
    expect(runs(layout('a <b>b</b> <strong>c</strong> <i>d</i> <EM>e</EM>'))).toEqual([
      [
        ['a ', 0],
        ['b', B],
        [' ', 0],
        ['c', B],
        [' ', 0],
        ['d', I],
        [' ', 0],
        ['e', I],
      ],
    ]);
  });

  it('marks bold and italic runs for the SVG writer', () => {
    const [line] = layout('<b><i>x</i></b>').lines;
    expect(line).toEqual([{ text: 'x', style: B | I, bold: true, italic: true, width: 5.56 }]);
  });

  it('marks underlined runs from the base style for the SVG writer (#208)', () => {
    const U = Style.Underline;
    const plain = layoutLabel('x', arial, Infinity, tableMeasurer, { style: U });
    expect(plain.lines).toEqual([[{ text: 'x', style: U, underline: true, width: 5 }]]);
    const marked = layoutLabel('<b>x</b>', arial, Infinity, tableMeasurer, { style: U });
    expect(marked.lines).toEqual([
      [{ text: 'x', style: U | B, bold: true, underline: true, width: 5.56 }],
    ]);
  });

  it('nests tags: closing an inner tag keeps the outer style', () => {
    expect(runs(layout('<b>a<strong>b</strong>c</b>d'))).toEqual([
      [
        ['abc', B],
        ['d', 0],
      ],
    ]);
  });

  it('keeps an open tag across line breaks', () => {
    expect(runs(layout('<b>a<br>b</b>c'))).toEqual([
      [['a', B]],
      [
        ['b', B],
        ['c', 0],
      ],
    ]);
  });

  it('drops other known tags and keeps their text', () => {
    expect(runs(layout('<span class="x">a</span> <u>b</u> <a href="x">c</a>'))).toEqual([
      [['a b c', 0]],
    ]);
  });

  // D564: the render's `InlineSpans.dropped` gets the names; the API warns `HTML_DROPPED`.
  const droppedBy = (raw: string, options: LabelOptions = {}): [string[], string[]] => {
    const inline = inlineSpans([], () => undefined);
    const box = layoutLabel(raw, arial, Infinity, tableMeasurer, { ...options, inline });
    return [texts(box), [...inline.dropped]];
  };

  it('names the tags it drops, lower case and once each, but not the formatting subset', () => {
    expect(
      droppedBy('<IMG src="a.png"/> Logo <sub>2</sub> <a href=x>l</a><br><b>b</b><em>e</em>')
    ).toEqual([
      ['Logo 2 l', 'be'],
      ['img', 'sub', 'a'],
    ]);
    expect(droppedBy('<b>a</b><br/><i>b</i> List<T> <foo> a < b')[1]).toEqual([]);
    expect(droppedBy('plain')[1]).toEqual([]);
  });

  it.each<LabelMarkup>(['plain', 'emphasis', 'markdown'])(
    'drops <script> and <style> with what they hold (%s)',
    (markup) => {
      expect(droppedBy('<script>alert(1)</script>', { markup })).toEqual([[''], ['script']]);
      expect(
        droppedBy('a <SCRIPT type="x">1<br>2\n3</Script > b<style>.x{}</style>c <script>rest', {
          markup,
        })
      ).toEqual([['a bc'], ['script', 'style']]);
      // Not a longer name that starts the same.
      expect(droppedBy('<scripts>x</scripts>', { markup })).toEqual([['<scripts>x</scripts>'], []]);
    }
  );

  it('drops script content without a sink too', () => {
    expect(texts(layout('a<script>alert(1)</script>b'))).toEqual(['ab']);
  });

  it('shows unknown tags and stray brackets as literal text', () => {
    expect(texts(layout('List<T> a < b <foo>'))).toEqual(['List<T> a < b <foo>']);
  });

  it('decodes HTML entities and leaves unknown ones as text', () => {
    expect(texts(layout('&lt;b&gt; &amp; &quot;q&quot; &#35; &#x41; &nbsp;x &bogus;'))).toEqual([
      '<b> & "q" # A \u00a0x &bogus;',
    ]);
  });

  it('does not read an entity-decoded tag as a tag', () => {
    expect(runs(layout('&lt;b&gt;x'))).toEqual([[['<b>x', 0]]]);
  });
});

describe('markdown strings (R-TEXT-2)', () => {
  const B = Style.Bold;
  const I = Style.Italic;
  const M = Style.Mono;
  const md = (raw: string, maxWidth = Infinity): MeasuredLabel => layout(raw, maxWidth, true);

  it('reads ** and __ as bold, * and _ as italic', () => {
    expect(runs(md('**a** __b__ *c* _d_'))).toEqual([
      [
        ['a', B],
        [' ', 0],
        ['b', B],
        [' ', 0],
        ['c', I],
        [' ', 0],
        ['d', I],
      ],
    ]);
  });

  it('nests emphasis', () => {
    expect(runs(md('**a *b* c**'))).toEqual([
      [
        ['a ', B],
        ['b', B | I],
        [' c', B],
      ],
    ]);
  });

  it('leaves unmatched markers and intra-word underscores as text', () => {
    expect(texts(md('a * b snake_case_name 2*3'))).toEqual(['a * b snake_case_name 2*3']);
  });

  it('draws inline code in monospace without reading markers inside it', () => {
    const [line] = md('run `x **y**` now').lines;
    expect(line?.map((r) => [r.text, r.style])).toEqual([
      ['run ', 0],
      ['x **y**', M],
      [' now', 0],
    ]);
    expect(line?.[1]?.attrs).toEqual({ 'font-family': 'monospace' });
    expect(line?.[1]?.width).toBeCloseTo(7 * 6, 9); // 0.6 em per character
  });

  it('honours backslash escapes', () => {
    expect(texts(md('\\*a\\* \\_b\\_'))).toEqual(['*a* _b_']);
  });

  it('breaks at newlines and <br>, dropping blank lines and common indentation', () => {
    expect(texts(md('\n    one\n\n    **two**<br/>three\n  '))).toEqual(['one', 'two', 'three']);
  });

  it('keeps emphasis local to a line', () => {
    expect(runs(md('**a\nb**'))).toEqual([[['**a', 0]], [['b**', 0]]]);
  });

  it('wraps markdown runs across styles', () => {
    // 'aaa aaa' = 36.14 fits 40
    expect(runs(md('aaa **aaa aaa** aaa', 40))).toEqual([
      [
        ['aaa ', 0],
        ['aaa', B],
      ],
      [
        ['aaa', B],
        [' aaa', 0],
      ],
    ]);
  });
});

describe('markdown bullet lists (R-TEXT-11)', () => {
  const md = (raw: string, maxWidth = Infinity): MeasuredLabel => layout(raw, maxWidth, true);
  // '• ' = 7.67 and '◦ ' = 7.67 at Arial 10px.

  it('draws "- " and "* " lines as bullets', () => {
    const box = md('Title\n- one\n* two');
    expect(texts(box)).toEqual(['Title', '• one', '• two']);
    expect(box.indents).toEqual([0, 0, 0]);
    expect(box.left).toBe(true);
    expect(md('Title').left).toBeUndefined();
  });

  it('nests one level from leading indentation with a hollow bullet', () => {
    const box = md('- one\n  - two\n    - three\n- four');
    expect(texts(box)).toEqual(['• one', '◦ two', '◦ three', '• four']);
    expect(box.indents.map((x) => +x.toFixed(2))).toEqual([0, 7.67, 7.67, 0]);
  });

  it('aligns wrapped lines to the text, not the bullet (hanging indent)', () => {
    // 'aaa aaa' = 36.14 does not fit 40 - 7.67; 'aaa' does
    const box = md('- aaa aaa aaa', 40);
    expect(texts(box)).toEqual(['• aaa', 'aaa', 'aaa']);
    expect(box.indents.map((x) => +x.toFixed(2))).toEqual([0, 7.67, 7.67]);
    expect(box.widths.map((x) => +x.toFixed(2))).toEqual([24.35, 24.35, 24.35]);
    expect(box.width).toBeLessThanOrEqual(40);
  });

  it('applies emphasis inside bullet items', () => {
    expect(runs(md('- **a**'))).toEqual([
      [
        ['• ', 0],
        ['a', Style.Bold],
      ],
    ]);
  });

  it('reads a one-line markdown string as a bullet item', () => {
    expect(texts(md('- one'))).toEqual(['• one']);
  });

  it('measures nesting after removing the indentation all lines share', () => {
    expect(texts(md('\n    - one\n    - two\n      - three\n  '))).toEqual([
      '• one',
      '• two',
      '◦ three',
    ]);
  });

  it('needs a space after the marker', () => {
    expect(texts(md('-one\n*two*'))).toEqual(['-one', 'two']);
  });
});

describe('label modes (D560)', () => {
  const SOURCE = '- **b** _i_ `c` \\*';
  const mode = (markup?: LabelMarkup, raw = SOURCE): MeasuredLabel =>
    layoutLabel(raw, arial, Infinity, tableMeasurer, { markup });

  it('plain, the default, draws emphasis markers, backticks and a leading dash as written', () => {
    expect(runs(mode())).toEqual([[[SOURCE, 0]]]);
    expect(runs(mode('plain'))).toEqual([[[SOURCE, 0]]]);
    expect(mode('plain').left).toBeUndefined();
  });

  it('emphasis styles ** * __ _ and leaves bullets, inline code and escapes as written', () => {
    const box = mode('emphasis');
    expect(runs(box)).toEqual([
      [
        ['- ', 0],
        ['b', Style.Bold],
        [' ', 0],
        ['i', Style.Italic],
        [' `c` \\*', 0],
      ],
    ]);
    expect(box.left).toBeUndefined();
    expect(runs(mode('emphasis', '__b__ *i*'))).toEqual([
      [
        ['b', Style.Bold],
        [' ', 0],
        ['i', Style.Italic],
      ],
    ]);
  });

  it('emphasis breaks lines as a plain label does', () => {
    expect(texts(mode('emphasis', 'a\\n*b*<br>c'))).toEqual(['a', 'b', 'c']);
  });

  it('markdown adds bullets, inline code and backslash escapes', () => {
    const box = mode('markdown');
    expect(runs(box)).toEqual([
      [
        ['• ', 0],
        ['b', Style.Bold],
        [' ', 0],
        ['i', Style.Italic],
        [' ', 0],
        ['c', Style.Mono],
        [' *', 0],
      ],
    ]);
    expect(box.left).toBe(true);
  });

  it('reads markdown: true as markup markdown', () => {
    expect(layoutLabel(SOURCE, arial, Infinity, tableMeasurer, { markdown: true })).toEqual(
      mode('markdown')
    );
  });
});

describe('backslashBreak (D560)', () => {
  const written = (raw: string, options: LabelOptions): string[] =>
    texts(layoutLabel(raw, arial, Infinity, tableMeasurer, options));

  it('breaks at a written \\n by default', () => {
    expect(written('a\\nb', {})).toEqual(['a', 'b']);
    expect(written('a\\nb', { backslashBreak: true })).toEqual(['a', 'b']);
  });

  it('keeps a written \\n when false, in plain and emphasis labels', () => {
    expect(written('a\\nb', { backslashBreak: false })).toEqual(['a\\nb']);
    expect(written('*a*\\nb', { backslashBreak: false, markup: 'emphasis' })).toEqual(['a\\nb']);
  });

  it('still breaks at <br> and at a newline when false', () => {
    expect(written('a\\nb<br/>c\nd\r\ne', { backslashBreak: false })).toEqual([
      'a\\nb',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('drawing with SvgWriter.label()', () => {
  it('draws a laid-out label as styled tspans', () => {
    const w = streamWriter();
    w.label(layout('a <b>b</b>'), 0, 0);
    expect(w.finish()).toBe(
      '<text text-anchor="middle" xml:space="preserve"><tspan x="0" y="3.3">a </tspan><tspan font-weight="bold">b</tspan></text>'
    );
  });

  it('draws bullet items left-aligned with a hanging indent', () => {
    const w = streamWriter();
    w.label(layout('- aaa aaa', 30, true), 0, 0);
    // width 24.35, lines 11.5 apart, baseline 9.05 below the top (-11.5)
    expect(w.finish()).toBe(
      '<text text-anchor="start" xml:space="preserve"><tspan x="-12.17" y="-2.45">• aaa</tspan><tspan x="-4.51" y="9.05">aaa</tspan></text>'
    );
  });
});
