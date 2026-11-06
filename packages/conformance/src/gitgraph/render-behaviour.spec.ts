import { beforeAll, describe, expect, it } from 'vitest';
import type { Mermaid, MermaidConfig } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { gitApi } from './render-api.ts';

/**
 * What the gitGraph renderer draws (spec #292 T4), through `render()` and the generated
 * registry (`render-api.ts`, #374). Expected colours and sizes are v12 12.2.0's
 * (`gitGraphRenderer.ts` and `styles.js` at fa796a943, `01-v12-gitgraph.md` §3–4). Colours are
 * checked as literals (`cssVariables: false`) against the author's base colours, so each part
 * is seen to take the variable v12's style sheet gave it.
 */
let api: Mermaid;
beforeAll(async () => {
  api = await gitApi();
});

/** Node colours an author sets, so the literal output shows which one a part took. */
const NODE = {
  nodeBorder: '#010101',
  mainBkg: '#020202',
  primaryColor: '#030303',
  lineColor: '#040404',
  textColor: '#050505',
  commitLabelColor: '#060606',
  commitLabelBackground: '#070707',
  tagLabelColor: '#080808',
  tagLabelBackground: '#090909',
  tagLabelBorder: '#0a0a0a',
} as const;
const GIT = {
  git0: '#100000',
  git1: '#110000',
  gitInv0: '#200000',
  gitInv1: '#210000',
  gitBranchLabel0: '#300000',
  gitBranchLabel1: '#310000',
} as const;

const draw = async (src: string, m: Mermaid = api): Promise<SvgView> =>
  parseSvg((await m.render('g', src)).svg);
const literal = (theme: string, extra: Record<string, unknown> = {}): Promise<Mermaid> =>
  gitApi({
    theme,
    output: { cssVariables: false },
    themeVariables: { ...NODE, ...GIT, ...extra },
  } as MermaidConfig);
const cls = (tree: SvgView, n: SvgElement): string[] => (tree.getAttr(n, 'class') ?? '').split(' ');
const byClass = (tree: SvgView, c: string): SvgElement[] =>
  tree.find((n, t) => cls(t, n).includes(c));
const one = (tree: SvgView, c: string): SvgElement => {
  const found = byClass(tree, c);
  expect(found, c).toHaveLength(1);
  return found[0]!;
};
const attrs = (tree: SvgView, n: SvgElement, ...names: string[]) =>
  Object.fromEntries(names.map((k) => [k, tree.getAttr(n, k)]));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
/** The bullet group of commit `id` and its parts. */
const bullet = (tree: SvgView, id: string): SvgElement[] => {
  const g = byClass(tree, 'commit-bullet').find((n) => tree.getAttr(n, 'data-id') === id)!;
  return tree.children(g);
};

/** A graph with every bullet symbol on main and a second branch. */
const EVERY = `gitGraph
  commit id:"n"
  commit id:"r" type:REVERSE
  commit id:"h" type:HIGHLIGHT tag:"v1"
  branch dev
  commit id:"d"
  checkout main
  merge dev id:"m"
  cherry-pick id:"d"`;

describe('gitGraph render: structure and ids', () => {
  it('draws each commit as a bullet group carrying its id as data-id and its statement as data-ast', async () => {
    const tree = await draw('gitGraph\ncommit id:"A"\ncommit');
    const bullets = byClass(tree, 'commit-bullet');
    expect(bullets.map((b) => tree.getAttr(b, 'data-ast'))).toEqual(['c:A', 'c#1']);
    expect(bullets.map((b) => tree.getAttr(b, 'data-id'))).toEqual(['A', '1-3c6ef36']);
    // R-SVG-2: the id is no longer a class.
    for (const n of tree.find(() => true)) expect(cls(tree, n)).not.toContain('A');
  });

  it('gives each lane a group with the branch name, and data-ast for a branch statement', async () => {
    const tree = await draw('gitGraph\ncommit\nbranch "feat/x"\ncommit');
    const lanes = byClass(tree, 'branch-lane');
    expect(lanes.map((n) => attrs(tree, n, 'data-id', 'data-ast'))).toEqual([
      { 'data-id': 'main', 'data-ast': undefined },
      { 'data-id': 'feat/x', 'data-ast': 'b:feat/x' },
    ]);
    expect(tree.children(lanes[1]!).map((n) => tree.tag(n))).toEqual(['line', 'rect', 'g']);
  });

  it('keeps an empty lane group without showBranches', async () => {
    const src =
      '---\nconfig:\n  gitGraph:\n    showBranches: false\n---\ngitGraph\ncommit\nbranch b';
    const tree = await draw(src);
    const lanes = byClass(tree, 'branch-lane');
    expect(lanes.map((n) => tree.children(n).length)).toEqual([0, 0]);
    expect(tree.getAttr(lanes[1]!, 'data-ast')).toBe('b:b');
  });

  it('marks each arrow parent>child and draws none for a self-parent (D264)', async () => {
    const tree = await draw('gitGraph\ncommit id:"A"\ncommit id:"B"\ncommit id:"B"');
    const arrows = byClass(tree, 'arrow');
    // The second B replaced the first and lists itself as parent: only A>… stays, and none
    // since B (seq 2) has parent B. A has no parent.
    expect(arrows.map((n) => tree.getAttr(n, 'data-id'))).toEqual([]);
    const two = await draw('gitGraph\ncommit id:"A"\ncommit id:"B"\nbranch x\ncommit id:"C"');
    expect(byClass(two, 'arrow').map((n) => two.getAttr(n, 'data-id'))).toEqual(['A>B', 'B>C']);
  });

  it('stacks lanes, arrows, bullets, labels and the title in v12 order', async () => {
    const tree = await draw('gitGraph\ntitle T\ncommit tag:"t"\ncommit');
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(tree.children(root).map((n) => tree.getAttr(n, 'class'))).toEqual([
      'branches',
      'commit-arrows',
      'commit-bullets',
      'commit-labels',
      'gitTitleText',
    ]);
  });

  it('draws v12 symbols: circle, cross, squares, inner circle, cherry-pick dots and stems', async () => {
    const tree = await draw(EVERY);
    const tags = (id: string) => bullet(tree, id).map((n) => tree.tag(n));
    expect(tags('n')).toEqual(['circle']);
    expect(tags('r')).toEqual(['circle', 'path']);
    expect(tags('h')).toEqual(['rect', 'rect']);
    expect(tags('m')).toEqual(['circle', 'circle']);
    const cp = byClass(tree, 'commit-cherry-pick').find((n) => tree.tag(n) === 'g')!;
    expect(tree.children(cp).map((n) => tree.tag(n))).toEqual([
      'circle',
      'circle',
      'circle',
      'line',
      'line',
    ]);
    expect(cls(tree, bullet(tree, 'h')[0]!)).toEqual([
      'commit',
      'commit-highlight0',
      'commit-highlight-outer',
    ]);
    expect(cls(tree, bullet(tree, 'm')[1]!)).toEqual(['commit', 'commit-merge', 'commit0']);
  });
});

describe('gitGraph render: classic themes (v12 normalTheme)', () => {
  it('paints each branch from git, gitInv and gitBranchLabel, one slot for all its parts (D267)', async () => {
    const tree = await draw(EVERY, await literal('default'));
    const [circle] = bullet(tree, 'd');
    expect(attrs(tree, circle!, 'class', 'fill', 'stroke')).toEqual({
      class: 'commit commit1',
      fill: GIT.git1,
      stroke: GIT.git1,
    });
    const [outer, inner] = bullet(tree, 'h');
    expect(attrs(tree, outer!, 'fill', 'stroke', 'width')).toEqual({
      fill: GIT.gitInv0,
      stroke: GIT.gitInv0,
      width: '20',
    });
    expect(attrs(tree, inner!, 'fill', 'width')).toEqual({ fill: NODE.primaryColor, width: '12' });
    const boxes = byClass(tree, 'branchLabelBkg');
    expect(boxes.map((n) => attrs(tree, n, 'class', 'fill', 'stroke', 'rx', 'filter'))).toEqual([
      {
        class: 'branchLabelBkg label0',
        fill: GIT.git0,
        stroke: undefined,
        rx: '4',
        filter: undefined,
      },
      {
        class: 'branchLabelBkg label1',
        fill: GIT.git1,
        stroke: undefined,
        rx: '4',
        filter: undefined,
      },
    ]);
    expect(byClass(tree, 'branch-label1').map((n) => tree.getAttr(n, 'fill'))).toEqual([
      GIT.gitBranchLabel1,
    ]);
    // An arrow takes its commit's lane; a merge's second parent the merged branch's (v12).
    const arrows = byClass(tree, 'arrow').map((n) => [
      tree.getAttr(n, 'data-id')!.replace(/>\d+-\w+$/, '>cp'),
      tree.getAttr(n, 'stroke'),
    ]);
    expect(arrows).toEqual([
      ['n>r', GIT.git0],
      ['r>h', GIT.git0],
      ['h>d', GIT.git1],
      ['h>m', GIT.git0],
      ['d>m', GIT.git1],
      ['m>cp', GIT.git0],
      ['d>cp', GIT.git0],
    ]);
  });

  it('draws v12 classic geometry and label paints', async () => {
    const tree = await draw(EVERY, await literal('default'));
    expect(tree.getAttr(bullet(tree, 'n')[0]!, 'r')).toBe('10');
    expect(attrs(tree, bullet(tree, 'm')[1]!, 'r', 'fill')).toEqual({
      r: '6',
      fill: NODE.primaryColor,
    });
    const cross = bullet(tree, 'r')[1]!;
    expect(attrs(tree, cross, 'stroke', 'stroke-width')).toEqual({
      stroke: NODE.primaryColor,
      'stroke-width': '3',
    });
    expect(tree.getAttr(cross, 'd')).toMatch(/^M\S+L\S+M\S+L\S+$/);
    const line = byClass(tree, 'branch')[0]!;
    expect(attrs(tree, line, 'stroke', 'stroke-dasharray')).toEqual({
      stroke: NODE.lineColor,
      'stroke-dasharray': '2',
    });
    const label = byClass(tree, 'commit-label-bkg')[0]!;
    expect(attrs(tree, label, 'fill', 'opacity')).toEqual({
      fill: NODE.commitLabelBackground,
      opacity: '0.5',
    });
    expect(tree.getAttr(byClass(tree, 'commit-label')[0]!, 'fill')).toBe(NODE.commitLabelColor);
    expect(attrs(tree, byClass(tree, 'tag-label-bkg')[0]!, 'fill', 'stroke', 'filter')).toEqual({
      fill: NODE.tagLabelBackground,
      stroke: NODE.tagLabelBorder,
      filter: undefined,
    });
    expect(tree.getAttr(byClass(tree, 'tag-label')[0]!, 'fill')).toBe(NODE.tagLabelColor);
    expect(tree.getAttr(byClass(tree, 'tag-hole')[0]!, 'fill')).toBe(NODE.textColor);
    expect(byClass(tree, 'arrow').map((n) => tree.getAttr(n, 'stroke-width'))).toContain('8');
  });

  it('leaves a cherry-pick body unpainted (black, as v12) with white marks, black on a dark theme', async () => {
    const light = await draw(EVERY, await literal('default'));
    const cp = (tree: SvgView) =>
      tree.children(byClass(tree, 'commit-cherry-pick').find((n) => tree.tag(n) === 'g')!);
    const [body, dot, , stem] = cp(light);
    expect(attr(light, body!, 'fill')).toBeUndefined();
    expect([attr(light, dot!, 'fill'), attr(light, stem!, 'stroke')]).toEqual([
      '#ffffff',
      '#ffffff',
    ]);
    expect(attr(light, dot!, 'r')).toBe('2.75');
    const dark = await draw(EVERY, await literal('dark'));
    expect(attr(dark, cp(dark)[1]!, 'fill')).toBe('#000000');
  });

  it('cycles nine branches round eight slots (D267)', async () => {
    const src = [
      'gitGraph',
      'commit',
      ...Array.from({ length: 8 }, (_, i) => `branch b${i}\ncommit`),
    ];
    const tree = await draw(src.join('\n'), await literal('default'));
    const slots = byClass(tree, 'branchLabelBkg').map((n) => cls(tree, n)[1]);
    expect(slots).toEqual([...Array.from({ length: 8 }, (_, i) => `label${i}`), 'label0']);
    const last = byClass(tree, 'commit-bullet').at(-1)!;
    expect(cls(tree, tree.children(last)[0]!)).toContain('commit0');
  });
});

/** `tree.getAttr`, short. */
function attr(t: SvgView, n: SvgElement, name: string): string | undefined {
  return t.getAttr(n, name);
}

describe('gitGraph render: neo themes (v12 genColor, NEO_THEMES)', () => {
  it('draws the first branch in nodeBorder and the others from the git palettes, classic geometry (D266)', async () => {
    const t = await draw(EVERY, await literal('neo'));
    expect(attrs(t, bullet(t, 'n')[0]!, 'fill', 'stroke', 'r')).toEqual({
      fill: NODE.nodeBorder,
      stroke: NODE.nodeBorder,
      r: '10',
    });
    expect(attrs(t, bullet(t, 'd')[0]!, 'fill')).toEqual({ fill: GIT.git1 });
    expect(attrs(t, bullet(t, 'h')[0]!, 'fill', 'width')).toEqual({
      fill: NODE.nodeBorder,
      width: '20',
    });
    expect(byClass(t, 'branch-label0').map((n) => attr(t, n, 'fill'))).toEqual([NODE.nodeBorder]);
    expect(byClass(t, 'branch-label1').map((n) => attr(t, n, 'fill'))).toEqual([
      GIT.gitBranchLabel1,
    ]);
    expect(attr(t, byClass(t, 'arrow')[0]!, 'stroke-width')).toBe('8');
  });

  it('boxes branch names in mainBkg with the gradient outline and the shadow (D182)', async () => {
    const t = await draw(EVERY, await literal('neo'));
    for (const box of byClass(t, 'branchLabelBkg')) {
      expect(attr(t, box, 'fill')).toBe(NODE.mainBkg);
      expect(attr(t, box, 'stroke')).toBe('url(#g-gradient)');
      expect(attr(t, box, 'filter')).toMatch(/^drop-shadow/);
    }
    expect(t.find({ tag: 'linearGradient' })).toHaveLength(1);
  });

  it('takes the node colours for labels, tags and bullet insides, and a 4 2 dash', async () => {
    const t = await draw(EVERY, await literal('neo'));
    expect(attr(t, byClass(t, 'commit-label')[0]!, 'fill')).toBe(NODE.nodeBorder);
    expect(attrs(t, byClass(t, 'commit-label-bkg')[0]!, 'fill', 'opacity')).toEqual({
      fill: 'none',
      opacity: undefined,
    });
    const tag = byClass(t, 'tag-label-bkg')[0]!;
    expect(attrs(t, tag, 'fill', 'stroke')).toEqual({
      fill: NODE.mainBkg,
      stroke: NODE.nodeBorder,
    });
    expect(attr(t, tag, 'filter')).toMatch(/^drop-shadow/);
    expect(attr(t, bullet(t, 'm')[1]!, 'fill')).toBe(NODE.mainBkg);
    expect(attr(t, byClass(t, 'branch')[0]!, 'stroke-dasharray')).toBe('4 2');
  });
});

describe('gitGraph render: redux themes (v12 REDUX_GEOMETRY_THEMES)', () => {
  it('draws every branch in nodeBorder, with redux geometry', async () => {
    const t = await draw(EVERY, await literal('redux'));
    for (const id of ['n', 'd'])
      expect(attrs(t, bullet(t, id)[0]!, 'fill', 'stroke', 'r')).toEqual({
        fill: NODE.nodeBorder,
        stroke: NODE.nodeBorder,
        r: '7',
      });
    const [outer, inner] = bullet(t, 'h');
    expect(attrs(t, outer!, 'width', 'fill')).toEqual({ width: '14', fill: NODE.nodeBorder });
    expect(attrs(t, inner!, 'width', 'fill')).toEqual({ width: '8', fill: NODE.mainBkg });
    expect(attr(t, bullet(t, 'm')[1]!, 'r')).toBe('5');
    const cross = bullet(t, 'r')[1]!;
    expect(attr(t, cross, 'stroke-width')).toBe('2');
    const cp = t.children(byClass(t, 'commit-cherry-pick').find((n) => t.tag(n) === 'g')!);
    expect(attrs(t, cp[0]!, 'fill', 'r')).toEqual({ fill: NODE.nodeBorder, r: '7' });
    expect(attr(t, cp[1]!, 'r')).toBe('2.5');
    for (const a of byClass(t, 'arrow'))
      expect(attrs(t, a, 'stroke', 'stroke-width')).toEqual({
        stroke: NODE.nodeBorder,
        'stroke-width': '2',
      });
    for (const n of byClass(t, 'branchLabel').flatMap((g) => t.children(g)))
      expect(attrs(t, n, 'fill', 'font-weight')).toEqual({
        fill: NODE.nodeBorder,
        'font-weight': '600',
      });
    for (const box of byClass(t, 'branchLabelBkg'))
      expect(attrs(t, box, 'fill', 'stroke', 'rx')).toEqual({
        fill: NODE.mainBkg,
        stroke: NODE.nodeBorder,
        rx: undefined,
      });
  });

  it('draws branch lines in the redux commitLineColor of v12, #BDBCCC', async () => {
    const t = await draw(EVERY, await literal('redux'));
    expect(attrs(t, byClass(t, 'branch')[0]!, 'stroke', 'stroke-dasharray')).toEqual({
      stroke: '#BDBCCC',
      'stroke-dasharray': '4 2',
    });
  });

  it('colours branches from borderColorArray: slot 0 plain, then 1–7 round (redux-color)', async () => {
    const border = [
      '#a00000',
      '#a10000',
      '#a20000',
      '#a30000',
      '#a40000',
      '#a50000',
      '#a60000',
      '#a70000',
    ];
    const src = [
      'gitGraph',
      'commit',
      ...Array.from({ length: 8 }, (_, i) => `branch b${i}\ncommit`),
    ];
    const t = await draw(
      src.join('\n'),
      await literal('redux-color', { borderColorArray: border })
    );
    const fills = byClass(t, 'commit-bullet').map((g) => attr(t, t.children(g)[0]!, 'fill'));
    expect(fills).toEqual([NODE.nodeBorder, ...border.slice(1), border[1]]);
    const boxes = byClass(t, 'branchLabelBkg');
    expect(attrs(t, boxes[0]!, 'fill', 'stroke')).toEqual({
      fill: NODE.mainBkg,
      stroke: NODE.nodeBorder,
    });
    expect(attrs(t, boxes[2]!, 'class', 'fill', 'stroke')).toEqual({
      class: 'branchLabelBkg label2',
      fill: border[2],
      stroke: border[2],
    });
    expect(byClass(t, 'branch-label2').map((n) => attr(t, n, 'fill'))).toEqual([NODE.nodeBorder]);
    const dark = await draw(
      src.join('\n'),
      await literal('redux-dark-color', { borderColorArray: border })
    );
    expect(attrs(dark, byClass(dark, 'branchLabelBkg')[2]!, 'fill', 'stroke')).toEqual({
      fill: NODE.mainBkg,
      stroke: border[2],
    });
  });
});

describe('gitGraph render: text', () => {
  it('writes ids, tags and names as written, escaped by the writer (D263, D268)', async () => {
    const src = 'gitGraph\ncommit id:"a<b>&c=d" tag:"$$x^2$$"\nbranch "fa:fa-bell"\ncommit id:"e"';
    const { svg } = await api.render('g', src);
    expect(svg).toContain('>a&lt;b&gt;&amp;c=d<');
    expect(svg).toContain('>$$x^2$$<');
    expect(svg).toContain('>fa:fa-bell<');
    expect(svg).not.toContain('&amp;lt;');
  });

  it('breaks a branch name only on a newline (D263)', async () => {
    const t = await draw('gitGraph\ncommit\nbranch "a\\nb<br>c"\ncommit');
    const name = byClass(t, 'branch-label1')[0]!;
    expect(
      t
        .find((n) => n.parent === name || n.parent?.parent === name)
        .filter((n) => t.tag(n) === 'tspan')
        .map((n) => textOf(t, n))
    ).toEqual(['a', 'b<br>c']);
  });

  it('draws an in-text and a front-matter title (D265), 18 px in textColor', async () => {
    for (const src of [
      'gitGraph\ntitle In text\ncommit',
      '---\ntitle: Front\n---\ngitGraph\ncommit',
    ]) {
      const t = await draw(src, await literal('default'));
      const title = one(t, 'gitTitleText');
      expect(textOf(t, title)).toMatch(/In text|Front/);
      expect(attrs(t, title, 'fill', 'font-size')).toEqual({
        fill: NODE.textColor,
        'font-size': '18',
      });
    }
  });

  it('labels the root by accTitle and accDescr, sized as v12 with and without useMaxWidth', async () => {
    const t = await draw('gitGraph\naccTitle: T\naccDescr: D\ncommit');
    const root = t.find({ tag: 'svg' })[0]!;
    expect(
      attrs(t, root, 'aria-roledescription', 'aria-labelledby', 'aria-describedby', 'width')
    ).toEqual({
      'aria-roledescription': 'gitGraph',
      'aria-labelledby': 'g-title',
      'aria-describedby': 'g-desc',
      width: '100%',
    });
    const src = '---\nconfig:\n  gitGraph:\n    useMaxWidth: false\n---\ngitGraph\ncommit';
    const fixed = await draw(src);
    const r = fixed.find({ tag: 'svg' })[0]!;
    const [, , w, h] = fixed.getAttr(r, 'viewBox')!.split(' ').map(Number);
    expect([fixed.getAttr(r, 'width'), fixed.getAttr(r, 'height')]).toEqual([String(w), String(h)]);
  });

  it('seeds the main branch from mainBranchName', async () => {
    const src = '---\nconfig:\n  gitGraph:\n    mainBranchName: trunk\n---\ngitGraph\ncommit';
    const t = await draw(src);
    expect(byClass(t, 'branch-lane').map((n) => t.getAttr(n, 'data-id'))).toEqual(['trunk']);
  });
});
