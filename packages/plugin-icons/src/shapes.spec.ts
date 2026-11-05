// Flowchart icon shapes with the icons extension (D292, D298, D299, I4 #326): the glyph's colour
// and gradient, the borderless frame, and how an icon that is not drawn degrades.
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type IconLoader, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

/** A pack of 24×24 icons: a `currentColor` fill, a `currentColor` stroke, a fixed colour. */
const fa = {
  prefix: 'fa',
  width: 24,
  height: 24,
  icons: {
    bell: { body: '<path fill="currentColor" d="M0 0H1V24z"/>' },
    ring: { body: '<path fill="none" stroke="currentColor" d="M0 0H2V24z"/>' },
    logo: { body: '<path fill="#ff9900" d="M0 0H3V24z"/>' },
  },
};

async function api(...packs: IconLoader[]): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([icons]);
  m.registerIconPacks(packs.length > 0 ? packs : [{ name: 'fa', icons: fa }]);
  await m.preload({ types: ['flowchart'] });
  return m;
}

const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const themed = (theme: string, body: string) =>
  `---\nconfig:\n  theme: ${theme}\n---\nflowchart LR\n${body}`;
/** The frame (`rect`/`circle`) of the first node. */
const frame = (svg: string) =>
  /<g class="node [^>]*>(<(?:rect|circle) [^>]*>)/.exec(svg)?.[1] ?? '';
/** The glyph's wrapper: the `<g>` that places the fitted glyph in the frame's square. */
const wrapper = (svg: string) => /<g transform="translate\(-24,[^"]*\)"[^>]*>/.exec(svg)?.[0] ?? '';
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe('the glyph (D298)', () => {
  it('takes nodeBorder as its colour', async () => {
    const m = await api();
    const source = 'flowchart LR\n  A@{ icon: "fa:bell", form: square }';
    const r = await m.render('x', source);
    expect(codes(r)).toEqual([]);
    expect(attr(wrapper(r.svg), 'color')).toBe('var(--_nb)');
    const lit = await m.render('x', themed('default', '  A@{ icon: "fa:bell" }'), {
      config: { output: { cssVariables: false } },
    });
    expect(attr(wrapper(lit.svg), 'color')).toBe('#9370db'); // default's nodeBorder
    assertInert(r.svg);
  });

  it('takes the stroke style as its colour, and draws the frame without a border', async () => {
    const m = await api();
    const r = await m.render(
      'x',
      'flowchart LR\n  A@{ icon: "fa:bell", form: circle }\n  style A stroke:#f00,fill:#0f0'
    );
    expect(attr(wrapper(r.svg), 'color')).toBe('#f00');
    expect(attr(frame(r.svg), 'fill')).toBe('#0f0');
    expect(attr(frame(r.svg), 'stroke')).toBe('#0f0');
  });

  it('draws every form borderless: the frame stroke is its fill (mainBkg)', async () => {
    const m = await api();
    for (const form of ['square', 'circle', 'rounded']) {
      const r = await m.render('x', `flowchart LR\n  A@{ icon: "fa:bell", form: ${form} }`);
      expect(attr(frame(r.svg), 'fill'), form).toBe('var(--_mb)');
      expect(attr(frame(r.svg), 'stroke'), form).toBe('var(--_mb)');
    }
  });

  for (const theme of ['neo', 'neo-dark']) {
    it(`takes the gradient under ${theme}, and the frame does not (D182, retires D186)`, async () => {
      const m = await api();
      const r = await m.render(
        'g',
        themed(
          theme,
          '  A@{ icon: "fa:bell", form: square }\n  B@{ icon: "fa:ring" }\n  C@{ icon: "fa:logo" }'
        )
      );
      expect(r.svg).toContain('<path fill="url(#g-gradient)" d="M0 0H1V24z"/>');
      expect(r.svg).toContain('<path fill="none" stroke="url(#g-gradient)" d="M0 0H2V24z"/>');
      expect(r.svg).toContain('<path fill="#ff9900" d="M0 0H3V24z"/>');
      expect(attr(wrapper(r.svg), 'color')).toBeUndefined();
      expect(attr(frame(r.svg), 'stroke')).toBe(attr(frame(r.svg), 'fill'));
      expect(r.svg.match(/url\(#g-gradient\)/g)).toHaveLength(2);
      assertInert(r.svg);
    });
  }

  it('keeps an author stroke over the gradient', async () => {
    const m = await api();
    const r = await m.render(
      'g',
      themed('neo', '  A@{ icon: "fa:bell", form: square }\n  style A stroke:#00f')
    );
    expect(attr(wrapper(r.svg), 'color')).toBe('#00f');
    expect(r.svg).toContain('<path fill="currentColor" d="M0 0H1V24z"/>');
  });
});

describe('an icon that is not drawn (D298, D299)', () => {
  const UNRESOLVED =
    'flowchart LR\n  A@{ icon: "fa:nope", form: square }\n  B@{ icon: "user", form: circle }\n  C@{ icon: "fa:nada" }';

  it('keeps the frame-only drawing, outline included, as without the extension', async () => {
    const m = await api();
    const plain = createMermaid();
    plain.initialize({ deterministic: true });
    for (const theme of ['default', 'neo']) {
      const source = themed(theme, UNRESOLVED.slice('flowchart LR\n'.length));
      expect((await m.render('x', source)).svg, theme).toBe((await plain.render('x', source)).svg);
    }
    const r = await m.render('x', UNRESOLVED);
    expect(attr(frame(r.svg), 'stroke')).not.toBe(attr(frame(r.svg), 'fill'));
  });

  it("gives flowchart's deprecated ICON_UNAVAILABLE naming the shapes, then one ICON_NOT_RENDERED", async () => {
    const m = await api();
    const r = await m.render('x', UNRESOLVED);
    // Flowchart gives the alias as it draws; the extension's warning comes after the draw.
    expect(codes(r)).toEqual(['ICON_UNAVAILABLE', 'ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toBe(
      'ICON_UNAVAILABLE is deprecated and goes in the next alpha: read ICON_NOT_RENDERED. Icons not drawn: "fa:nope", "user", "fa:nada"; an icon with a form draws its frame alone.'
    );
  });

  it("gives the alias without an icons extension too, beside core's label warning", async () => {
    const plain = createMermaid();
    const r = await plain.render('x', 'flowchart LR\n  A["fa:fa-car"] --> B@{ icon: "fa:car" }');
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED', 'ICON_UNAVAILABLE']);
    const shapes = await plain.render('x', 'flowchart LR\n  B@{ icon: "fa:car" }');
    expect(shapes.warnings[0]!.message).toBe(
      'Icons are not rendered without an icons extension: icon shapes draw their frame alone, or nothing without a form.'
    );
  });

  it('gives no alias for a placeholder: the frame with PLACEHOLDER', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    await m.registerExternalDiagrams([icons]);
    m.registerIconPacks([{ name: 'fa', loader: () => Promise.resolve(fa) }]);
    await m.preload({ types: ['flowchart'] });
    const source = 'flowchart LR\n  A@{ icon: "fa:bell", form: square }';
    const r = m.renderSync(source, { placeholders: true });
    expect(codes(r)).toEqual(['PLACEHOLDER']);
    expect(r.svg).toContain('<rect x="-24" y="-24" width="48" height="48"');
    expect(r.svg).not.toContain('M0 0H1V24z');
  });

  it('names only the unresolved shapes in a placeholder render, not the pending ones', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    await m.registerExternalDiagrams([icons]);
    m.registerIconPacks([{ name: 'fa', loader: () => Promise.resolve(fa) }]);
    await m.preload({ types: ['flowchart'] });
    const source = 'flowchart LR\n  A@{ icon: "fa:bell", form: square }\n  B@{ icon: "mdi:x" }';
    const r = m.renderSync(source, { placeholders: true });
    expect(codes(r)).toEqual(['PLACEHOLDER', 'ICON_UNAVAILABLE', 'ICON_NOT_RENDERED']);
    expect(r.warnings[1]!.message).toContain('Icons not drawn: "mdi:x";');
  });

  it('gives no alias when every glyph is drawn, even if a label icon is not', async () => {
    const m = await api();
    const r = await m.render('x', 'flowchart LR\n  A["fa:fa-nope"] --> B@{ icon: "fa:bell" }');
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
  });
});
