import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type ExtensionPlugin } from 'mermaid';
import type { LabelSource, Measured } from './dom.ts';
import { extensionWith, type Env } from './extension.ts';
import type { LinkRules } from './sanitize.ts';

/** What the stand-in environment was asked. */
interface Calls {
  measured: LabelSource[];
  links: LinkRules[];
  mounted: number;
}

/**
 * An environment without a DOM: a "document" that is only passed along, a measure that gives
 * every label 200 × 60 px, wraps its HTML as the real one does and puts box `i` at
 * (10 + 30 i, 5), and a mount that counts.
 */
function standIn(hasDocument = true): { env: Env; calls: Calls } {
  const document = hasDocument ? {} : undefined;
  const calls: Calls = { measured: [], links: [], mounted: 0 };
  const env: Env = {
    document: () => document as Document | undefined,
    sanitizer(_document, links) {
      calls.links.push({ linkSchemes: links.linkSchemes, securityLevel: links.securityLevel });
      return (() => undefined) as never;
    },
    measure(_document, _sanitize, label): Measured {
      calls.measured.push(label);
      return {
        width: 200,
        height: 60,
        html: `<div class="${label.className}">${label.html}</div>`,
        at: label.boxes.map((_box, i) => ({ x: 10 + 30 * i, y: 5 })),
      };
    },
    mount: () => ++calls.mounted,
  };
  return { env, calls };
}

/** A stand-in math extension: every `$$…$$` span is a 20 × 12 px box holding a classed path. */
const math: ExtensionPlugin = {
  id: 'fixture-math',
  inline: [
    {
      open: '$$',
      close: '$$',
      box: () => ({
        width: 20,
        height: 12,
        baseline: 9,
        node: { tag: 'path', attrs: { class: 'fixture-math' } },
      }),
    },
  ],
};

async function api(
  extension: ExtensionPlugin,
  config: Record<string, unknown> = {},
  ...others: ExtensionPlugin[]
) {
  const m = createMermaid();
  m.initialize(config);
  await m.registerExternalDiagrams([...others, extension]);
  return m;
}

const FLOW = 'flowchart LR\n  A["Alpha <b>one</b>"] -->|goes| B("`**Beta**`")';
const PLACEHOLDER = '<g class="mermaid-html-label"><rect width="200" height="60" fill="none"/>';
const count = (text: string, part: string): number => text.split(part).length - 1;

describe('the HTML labels extension', () => {
  it('gives each label a placeholder of the measured size holding its HTML as text', async () => {
    const { env, calls } = standIn();
    const r = await (await api(extensionWith(env))).render('x', FLOW);
    expect(count(r.svg, PLACEHOLDER)).toBe(3);
    expect(r.svg).toContain(
      '<desc>&lt;div class=&quot;html-label nodeLabel&quot;&gt;Alpha &lt;b&gt;one&lt;/b&gt;&lt;/div&gt;</desc>'
    );
    expect(r.svg).toContain('&lt;strong&gt;Beta&lt;/strong&gt;');
    expect(calls.measured.map((m) => m.html)).toContain('goes');
  });

  it('keeps the svg string inert: no HTML elements and no foreignObject', async () => {
    const { env } = standIn();
    const r = await (await api(extensionWith(env))).render('x', FLOW);
    assertInert(r.svg);
    expect(r.svg).not.toContain('foreignObject');
    expect(r.svg).not.toMatch(/<(div|b|strong)[ >]/);
  });

  it('measures a label once per render, with its wrap width and font', async () => {
    const { env, calls } = standIn();
    await (await api(extensionWith(env))).render('x', 'flowchart LR\n  A["Same"] --> B["Same"]');
    expect(calls.measured).toHaveLength(1);
    expect(calls.measured[0]!.maxWidth).toBeGreaterThan(0);
    expect(calls.measured[0]!.font.family).not.toBe('');
  });

  it("gives a node's and a group's label v12's nodeLabel class, an edge's edgeLabel (D699)", async () => {
    const { env, calls } = standIn();
    const text = 'flowchart LR\n  subgraph G["Group"]\n    A["Alpha"]\n  end\n  A -->|goes| B';
    await (await api(extensionWith(env))).render('x', text);
    const classOf = (html: string) => calls.measured.find((m) => m.html === html)?.className;
    expect(classOf('Alpha')).toBe('html-label nodeLabel');
    expect(classOf('Group')).toBe('html-label nodeLabel');
    expect(classOf('goes')).toBe('html-label edgeLabel');
  });

  it('gives the label of a diagram that names no role the plain class', async () => {
    const { env, calls } = standIn();
    await (await api(extensionWith(env))).render('x', 'pie\n  title Pets\n  "Dogs" : 3');
    expect(calls.measured.length).toBeGreaterThan(0);
    expect(calls.measured.every((m) => m.className === 'html-label')).toBe(true);
  });

  it('mounts through bindFunctions, with the sanitizer of the render', async () => {
    const { env, calls } = standIn();
    const r = await (await api(extensionWith(env))).render('x', FLOW);
    expect(calls.links).toHaveLength(1);
    r.bindFunctions!({} as Element);
    expect(calls.mounted).toBe(1);
  });

  it("hands the render's link rules to the sanitizer", async () => {
    const { env, calls } = standIn();
    const m = await api(extensionWith(env), { linkSchemes: ['https', 'tel'] });
    await m.render('x', FLOW);
    expect(calls.links[0]!.linkSchemes).toEqual(['https', 'tel']);
  });
});

describe('math and icons in an HTML label (D698)', () => {
  const TEXT = 'flowchart LR\n  A["Energy $$E=mc^2$$ and $$x$$"] --> B["Plain"]';

  it("leaves room for each inline box and draws the box's SVG there", async () => {
    const { env, calls } = standIn();
    const r = await (await api(extensionWith(env), {}, math)).render('x', TEXT);
    // Every label is HTML: the one with math too.
    expect(count(r.svg, PLACEHOLDER)).toBe(2);
    const energy = calls.measured.find((m) => m.html.startsWith('Energy'))!;
    // A placeholder character stands where each box goes; the TeX is not in the HTML.
    expect(energy.html).toBe('Energy \ufdd0 and \ufdd1');
    expect(energy.boxes.map((b) => [b.width, b.height, b.baseline])).toEqual([
      [20, 12, 9],
      [20, 12, 9],
    ]);
    // The boxes follow the placeholder's rect and desc, at the places the measure gave them.
    expect(r.svg).toContain(
      '</desc><g transform="translate(10,5)"><path class="fixture-math"/></g>' +
        '<g transform="translate(40,5)"><path class="fixture-math"/></g></g>'
    );
    expect(r.warnings).toEqual([]);
    assertInert(r.svg);
  });

  it('skips a box whose room the measure did not find', async () => {
    const { env } = standIn();
    const lost: Env = {
      ...env,
      measure: (document, sanitize, label) => ({
        ...env.measure(document, sanitize, label),
        at: label.boxes.map(() => undefined),
      }),
    };
    const r = await (await api(extensionWith(lost), {}, math)).render('x', TEXT);
    expect(count(r.svg, PLACEHOLDER)).toBe(2);
    expect(r.svg).not.toContain('fixture-math');
  });

  it("shows a span as written, with core's warning, when no extension draws it", async () => {
    const { env, calls } = standIn();
    const text = 'flowchart LR\n  A["Energy $$E=mc^2$$"] --> B["fa:fa-car Car"]';
    const r = await (await api(extensionWith(env))).render('x', text);
    expect(calls.measured.map((m) => m.html)).toEqual(['Energy $$E=mc^2$$', 'fa:fa-car Car']);
    expect(calls.measured.every((m) => m.boxes.length === 0)).toBe(true);
    expect(r.warnings.map((w) => w.code).sort()).toEqual([
      'ICON_NOT_RENDERED',
      'MATH_NOT_RENDERED',
    ]);
  });

  it('boxes the spans once for a label it is asked for twice', async () => {
    const { env } = standIn();
    let boxed = 0;
    const counting: ExtensionPlugin = {
      id: 'counting-math',
      inline: [{ open: '$$', close: '$$', box: (s, q) => (boxed++, math.inline![0]!.box(s, q)) }],
    };
    await (await api(extensionWith(env), {}, counting)).render('x', TEXT);
    expect(boxed).toBe(2);
  });
});

describe('the HTML labels extension declines (D697)', () => {
  /** The svg with the extension over `env` and `config`, and the svg without any extension. */
  async function both(env: Env, config: Record<string, unknown>, text = FLOW) {
    const plain = createMermaid();
    plain.initialize(config);
    const without = await plain.render('x', text);
    const withIt = await (await api(extensionWith(env), config)).render('x', text);
    return { without, withIt };
  }

  it('without a document: the output is the one without the extension', async () => {
    const { env, calls } = standIn(false);
    const { without, withIt } = await both(env, {});
    expect(withIt.svg).toBe(without.svg);
    expect(calls.measured).toEqual([]);
  });

  it('in a deterministic render', async () => {
    const { env, calls } = standIn();
    const { without, withIt } = await both(env, { deterministic: true });
    expect(withIt.svg).toBe(without.svg);
    expect(calls.measured).toEqual([]);
  });

  it("with html.labels false, and with v12's htmlLabels keys", async () => {
    for (const config of [
      { html: { labels: false } },
      { htmlLabels: false },
      { flowchart: { htmlLabels: false } },
      { class: { htmlLabels: false } },
    ]) {
      const { env, calls } = standIn();
      const r = await (await api(extensionWith(env), config)).render('x', FLOW);
      expect(r.svg, JSON.stringify(config)).not.toContain('mermaid-html-label');
      expect(calls.measured, JSON.stringify(config)).toEqual([]);
      expect(r.warnings, JSON.stringify(config)).toEqual([]);
    }
  });

  it('lets diagram text turn it off, as in v12', async () => {
    const { env } = standIn();
    const text = `---\nconfig:\n  htmlLabels: false\n---\n${FLOW}`;
    const r = await (await api(extensionWith(env))).render('x', text);
    expect(r.svg).not.toContain('mermaid-html-label');
  });

  it('keeps diagram text from setting it once the integrator lists `html` in `secure`', async () => {
    for (const key of ['htmlLabels: false', 'html:\n    labels: false']) {
      const { env } = standIn();
      const m = await api(extensionWith(env), { secure: ['html'] });
      const r = await m.render('x', `---\nconfig:\n  ${key}\n---\n${FLOW}`);
      expect(r.svg, key).toContain('mermaid-html-label');
      expect(
        r.warnings.map((w) => w.code),
        key
      ).toEqual(['CONFIG_SECURE_KEY']);
    }
  });

  it("lets the root key win over a section's, as in v12", async () => {
    const { env } = standIn();
    const config = { htmlLabels: true, flowchart: { htmlLabels: false } };
    const r = await (await api(extensionWith(env), config)).render('x', FLOW);
    expect(r.svg).toContain('mermaid-html-label');
  });

  it('for text output', async () => {
    const { env, calls } = standIn();
    const r = await (await api(extensionWith(env))).render('x', FLOW, { format: 'ascii' });
    expect(calls.measured).toEqual([]);
    expect(r.text).toContain('Alpha');
  });

  it('does not offer bindFunctions work when no label was boxed', async () => {
    const { env, calls } = standIn(false);
    const r = await (await api(extensionWith(env))).render('x', FLOW);
    r.bindFunctions?.({} as Element);
    expect(calls.mounted).toBe(0);
  });
});
