/**
 * The hand-drawn extension through `createMermaid().render()` (H2, #342): its config fragment and
 * aliases (D303), the outline drawer (D302) and text output (D305).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMermaid, type ExtensionPlugin, type Warning } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { configFragment } from './generated/config-fragment.ts';
import { handDrawn } from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';
const front = (config: string, body = FLOW) => `---\nconfig:\n${config}\n---\n${body}`;
const codes = (ws: readonly Warning[]) => ws.map((w) => w.code);

async function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams(extensions);
  return m;
}

/** A sketched node: a `<g>` with the leaf's shadow, holding roughjs's `<path>`s. */
const sketched = (svg: string) => svg.includes('<g filter="var(--_ds)"><path d="M');

describe('activation (D303)', () => {
  it('sketches `look: handDrawn` with no warning', async () => {
    const m = await api(handDrawn);
    const r = await m.render('a', front('  look: handDrawn'));
    expect(codes(r.warnings)).toEqual([]);
    expect(sketched(r.svg)).toBe(true);
    expect((await m.render('a', FLOW)).svg).toMatch(/<rect /);
    expect(r.svg).not.toMatch(/<rect /);
  });

  it('draws the plain diagram with one LOOK_REMOVED naming the plugin when it is not registered', async () => {
    const plain = await api();
    const r = await plain.render('a', front('  look: handDrawn'));
    expect(codes(r.warnings)).toEqual(['LOOK_REMOVED']);
    expect(r.warnings[0]!.message).toContain('@mermaid-js/plugin-hand-drawn');
    expect(r.svg).toBe((await plain.render('a', FLOW)).svg);
  });
});

describe('the config fragment (D303)', () => {
  it('knows handDrawn and handDrawnSeed only while registered', async () => {
    const text = front('  handDrawn: true\n  handDrawnSeed: 3');
    const bare = await (await api()).render('a', text);
    expect(bare.warnings.map((w) => [w.code, w.path])).toEqual([
      ['CONFIG_UNKNOWN_KEY', 'handDrawn'],
      ['CONFIG_UNKNOWN_KEY', 'handDrawnSeed'],
    ]);
    const r = await (await api(handDrawn)).render('a', text);
    expect(codes(r.warnings)).toEqual([]);
    expect(sketched(r.svg)).toBe(true);
  });

  it('changes nothing by default: handDrawn is false', async () => {
    const plain = await (await api()).render('a', FLOW);
    expect((await (await api(handDrawn)).render('a', FLOW)).svg).toBe(plain.svg);
    const off = await (await api(handDrawn)).render('a', front('  handDrawn: false'));
    expect(off.svg).toBe(plain.svg);
  });

  it("aliases a diagram section's look, and initialize()", async () => {
    const m = await api(handDrawn);
    const section = await m.render('a', front('  flowchart:\n    look: handDrawn'));
    expect(codes(section.warnings)).toEqual([]);
    expect(sketched(section.svg)).toBe(true);
    m.initialize({ deterministic: true, look: 'handDrawn' } as never);
    const site = await m.render('a', FLOW);
    expect(codes(site.warnings)).toEqual([]);
    expect(sketched(site.svg)).toBe(true);
  });

  it('still warns LOOK_REMOVED for the other looks, and draws them plain', async () => {
    const m = await api(handDrawn);
    for (const config of ['  look: neo', '  flowchart:\n    look: classic']) {
      const r = await m.render('a', front(config));
      expect(codes(r.warnings)).toEqual(['LOOK_REMOVED']);
      // The plugin is registered: no hint to register it.
      expect(r.warnings[0]!.message).not.toContain('@mermaid-js/plugin-hand-drawn');
      expect(sketched(r.svg)).toBe(false);
    }
  });

  it("aliases every section of core's schema that has a look", () => {
    // The sections of core's key tree, and those that declare `look` (all of them, today).
    const keys = readFileSync(
      fileURLToPath(new URL('../../core/src/config/generated/keys.ts', import.meta.url)),
      'utf8'
    );
    const defs = new Map(
      [...keys.matchAll(/^const (D_\w+): KeyTree = (.*);$/gm)].map((m) => [m[1]!, m[2]!])
    );
    const hasLook = (def: string): boolean =>
      (defs.get(def) ?? '').includes('"look": 0') ||
      /\.\.\.(D_\w+)/.exec(defs.get(def) ?? '')?.[1] === 'D_BaseDiagramConfig';
    const tree = /^export const KEY_TREE: KeyTree = (.*);$/m.exec(keys)![1]!;
    const sections = [...tree.matchAll(/"([\w-]+)": (D_\w+)/g)]
      .filter((m) => hasLook(m[2]!))
      .map((m) => `${m[1]}.look`);
    expect(sections.length).toBeGreaterThan(20);
    const aliased = (configFragment.aliases ?? []).map((a) => a.from);
    expect(aliased).toEqual(['look', ...sections]);
    for (const a of configFragment.aliases ?? [])
      expect(a).toEqual({ from: a.from, when: 'handDrawn', to: 'handDrawn', value: true });
  });
});

describe('seeds (D304)', () => {
  const seeded = async (seed: number) =>
    (await (await api(handDrawn)).render('a', front(`  handDrawn: true\n  handDrawnSeed: ${seed}`)))
      .svg;

  it('gives the same sketch every time for a seed, 0 included, and another for another seed', async () => {
    expect(await seeded(0)).toBe(await seeded(0));
    expect(await seeded(1)).toBe(await seeded(1));
    expect(await seeded(1)).not.toBe(await seeded(0));
    expect(await seeded(2)).not.toBe(await seeded(1));
    // 0 is roughjs's 2147483647, a fixed seed (D300).
    expect(await seeded(0)).toBe(await seeded(2147483647));
  });
});

describe('the layout (D300)', () => {
  it('is the same with and without the plugin', async () => {
    const layouts: string[] = [];
    const recording: ExtensionPlugin = {
      id: 'layout-recorder',
      postLayout(laidOut) {
        layouts.push(JSON.stringify(laidOut));
        return laidOut;
      },
    };
    const sources = [
      FLOW,
      'classDiagram\n  namespace N {\n    class A\n  }\n  A <|-- B : is\n',
      'stateDiagram-v2\n  [*] --> S\n  state S {\n    a --> b\n  }\n  S --> [*]\n',
      'erDiagram\n  A ||--o{ B : has\n  A {\n    string id PK\n  }\n',
    ];
    for (const source of sources) {
      const text = `---\nconfig:\n  look: handDrawn\n---\n${source}`;
      layouts.length = 0;
      await (await api(recording)).render('a', text);
      await (await api(handDrawn, recording)).render('a', text);
      expect(layouts).toHaveLength(2);
      expect(layouts[1]).toBe(layouts[0]);
    }
  });
});

describe('what is sketched (D302, #340)', () => {
  const hd = (body: string) => front('  look: handDrawn', body);

  it('keeps an edge one <path> that still takes its stroke from the edgePaths group', async () => {
    const m = await api(handDrawn);
    const plain = (await (await api()).render('a', FLOW)).svg;
    const svg = (await m.render('a', hd(FLOW))).svg;
    const edge = (s: string) => /<g class="edge [^"]*"[^>]*>(<path [^>]*\/>)/.exec(s)![1]!;
    const [before, after] = [edge(plain), edge(svg)];
    // Same attributes but `d`, and no stroke of its own: the group's paints it.
    expect(after.replace(/ d="[^"]*"/, '')).toBe(before.replace(/ d="[^"]*"/, ''));
    expect(after).not.toMatch(/ stroke=/);
    expect(after).not.toBe(before);
    // roughjs's double stroke: two moves.
    expect(/ d="([^"]*)"/.exec(after)![1]!.match(/M/g)).toHaveLength(2);
    expect(svg).toContain('<g class="edgePaths" fill="none" stroke="var(--_l)"');
  });

  it("keeps an author's linkStyle on the sketched edge", async () => {
    const text = hd(`${FLOW}  linkStyle 0 stroke:#ff0000,stroke-width:4px,stroke-dasharray:5 5\n`);
    const svg = (await (await api(handDrawn)).render('a', text)).svg;
    expect(svg).toMatch(
      /<path d="M[^"]*"[^>]*stroke="#ff0000"[^>]*\/>|<path [^>]*stroke="#ff0000"[^>]*d="M/
    );
    expect(svg).toMatch(/stroke-dasharray="5 5"/);
  });

  it('writes invisible outlines plain: hit boxes and region frames', async () => {
    const m = await api(handDrawn);
    const text = await m.render('a', hd('flowchart LR\n  A@{ shape: text, label: "words" }\n'));
    expect(text.svg).toMatch(/<rect [^>]*fill="none" stroke="none"/);
    const regions = await m.render(
      'a',
      hd('stateDiagram-v2\n  state P {\n    a --> b\n    --\n    c --> d\n  }\n')
    );
    expect(regions.svg).toMatch(/<rect class="region"[^>]*fill="none" stroke="none"\/>/);
  });

  it("puts the leaf's class, shadow and opacity on the sketch's <g>, fill path then stroke path", async () => {
    const svg = (
      await (
        await api(handDrawn)
      ).render('a', hd('stateDiagram-v2\n  [*] --> a\n  state c <<choice>>\n  a --> c\n'))
    ).svg;
    const at = svg.indexOf('<g class="state-start"');
    expect(at).toBeGreaterThan(0);
    const group = svg.slice(at, svg.indexOf('</g>', at));
    expect(group).not.toMatch(/<circle\b/);
    const paths = group.match(/<path [^>]*\/>/g)!;
    expect(paths.length).toBeGreaterThan(1);
    // Hachure fill drawn as strokes in the fill colour, then the outline.
    expect(paths.at(-1)).toMatch(/fill="none"/);
    expect(paths[0]).toMatch(/fill="none" stroke="[^"n][^"]*" stroke-width="1.5"/);
  });

  it('draws a type with no outlines as before, with no warning', async () => {
    const seq = 'sequenceDiagram\n  A->>B: hi\n';
    const plain = (await (await api()).render('a', seq)).svg;
    const r = await (await api(handDrawn)).render('a', hd(seq));
    expect(codes(r.warnings)).toEqual([]);
    expect(r.svg).toBe(plain);
  });
});

describe('text output (D305)', () => {
  it('draws as before with one ASCII_DROPPED for handDrawn', async () => {
    const m = await api(handDrawn);
    await m.prepare(FLOW, { format: 'ascii' } as never);
    const plain = m.renderSync(FLOW, { format: 'ascii' });
    const r = m.renderSync(front('  look: handDrawn'), { format: 'ascii' });
    expect(r.text).toBe(plain.text);
    expect(r.warnings.map((w) => [w.code, w.feature])).toEqual([['ASCII_DROPPED', 'handDrawn']]);
    expect(plain.warnings).toEqual([]);
  });
});
