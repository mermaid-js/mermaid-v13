/**
 * Test-only adapter for the ported v12 cynefin specs (R-TEST-3), backed by the v13 cynefin
 * parse. The specs' expectations are kept as v12 wrote them; this file only translates names
 * and shapes:
 *
 * - `parser.parse` and `db` stand for v12's `cynefinParser` and `cynefinDb`: `parse` rejects
 *   with the first error's message and loads the model; the getters read it (domains as a
 *   `Map` in the model's order, transitions with `label: undefined` for none, as v12 kept them);
 * - `db.setDomains(blocks)` and `db.setTransitions(transitions)` take v12's Langium AST shapes
 *   (`{ domain, items: [{ label }] }`, `{ from, to, label }`): the adapter writes them out as
 *   cynefin text and parses it, so the DB cases run through the v13 parser too. Blocks add up
 *   over calls and transitions are replaced, as in v12's DB; `null` is ignored;
 * - `seededRandom`, `hashString` and `resolveSeed` stand for v12's `cynefinBoundaries.ts`: the
 *   layout's (T3, #467) PRNG and seed;
 * - the `generate…Path` functions stand for v12's path generators through the render seam (T4,
 *   #468): they lay out and render a diagram of that canvas, seed and amplitude, and return the
 *   `d` the renderer wrote on the fold, the horizon, the cliff or the ellipse. The horizon is
 *   drawn with `seed + 100` (v12 `cynefinRenderer.ts:146`), so it renders `seed - 100`; the
 *   ellipse's centre and radii are v12's arguments, set on the laid-out ellipse.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { treeWriter, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, DEFAULT_THEME, loadTheme } from '@mermaid-js/core/theme';
import {
  hashString,
  layoutCynefin,
  resolveSeed as resolve,
  seededRandom,
  type CynefinLayout,
} from '../layout/index.ts';
import type { CynefinModel } from '../model.ts';
import { parseCynefin } from '../parser/index.ts';
import { cynefin } from '../plugin.ts';
import { renderCynefin } from '../render/index.ts';

export { hashString, seededRandom };

/** v12's `resolveSeed(seed | undefined, id)`: no seed counts as 0. */
export const resolveSeed = (seed: number | undefined, id: string): number => resolve(seed ?? 0, id);

/** v12's amplitude fallback when none is passed (`cynefinBoundaries.ts:59`, `:101`). */
const FALLBACK_AMPLITUDE = 0.015;
/** v12's renderer seeds the horizon with `seed + 100` (`cynefinRenderer.ts:146`). */
const HORIZON_SEED_OFFSET = 100;

// v13's default theme, unnamed: the specs read only path data, which no theme changes.
const THEME = createTheme(await loadTheme(DEFAULT_THEME), { diagram: cynefin.theme });
const EMPTY = parseCynefin('cynefin-beta').model;

/**
 * The `d` of the `nth` element of class `cls` in a render of an empty diagram with the `cynefin`
 * config `options`; `patch` changes the layout before it is drawn.
 */
function drawnPath(
  options: Readonly<Record<string, unknown>>,
  cls: string,
  nth = 0,
  patch: (l: CynefinLayout) => CynefinLayout = (l) => l
): string {
  const ctx = {
    config: { cynefin: options } as unknown as ResolvedConfig,
    theme: THEME,
    measurer: tableMeasurer,
    warn: () => undefined,
    idPrefix: 'v12-spec',
    version: '13',
  };
  const w = treeWriter();
  renderCynefin(EMPTY, patch(layoutCynefin(EMPTY, ctx)), ctx, w);
  w.finish();
  const { tree } = w;
  const hits = tree.find((n: SvgNode, t: SvgTree) =>
    (t.getAttr(n, 'class') ?? '').split(' ').includes(cls)
  );
  return tree.getAttr(hits[nth]!, 'd')!;
}

export const generateFoldPath = (w: number, h: number, seed: number, amplitude?: number): string =>
  drawnPath(
    { width: w, height: h, seed, boundaryAmplitude: amplitude ?? w * FALLBACK_AMPLITUDE },
    'cynefinBoundary'
  );

export const generateHorizontalBoundary = (
  w: number,
  h: number,
  seed: number,
  amplitude?: number
): string =>
  drawnPath(
    {
      width: w,
      height: h,
      seed: seed - HORIZON_SEED_OFFSET,
      boundaryAmplitude: amplitude ?? h * FALLBACK_AMPLITUDE,
    },
    'cynefinBoundary',
    1
  );

export const generateCliffPath = (w: number, h: number): string =>
  drawnPath({ width: w, height: h }, 'cynefinCliff');

export const generateConfusionPath = (cx: number, cy: number, rx: number, ry: number): string =>
  drawnPath({}, 'cynefinConfusion', 0, (l) => ({
    ...l,
    confusion: { ...l.confusion, center: { x: cx, y: cy }, rx, ry },
  }));

interface Block {
  domain: string;
  items?: { label: string }[];
}

interface Transition {
  from: string;
  to: string;
  label?: string;
}

/** A label as a cynefin string: `"…"`, with `\` and `"` escaped (Langium unescapes them). */
const quote = (label: string) => `"${label.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

class CynefinDB {
  private model: CynefinModel | undefined;
  private blocks: Block[] = [];
  private transitions: Transition[] = [];

  clear(): void {
    this.model = undefined;
    this.blocks = [];
    this.transitions = [];
  }

  load(model: CynefinModel): void {
    this.model = model;
  }

  setDomains(blocks: Block[] | null): void {
    if (!blocks) return;
    this.blocks.push(...blocks);
    this.rebuild();
  }

  setTransitions(transitions: Transition[] | null): void {
    if (!transitions) return;
    this.transitions = [...transitions];
    this.rebuild();
  }

  /** The blocks and transitions set so far, written out as text and parsed. */
  private rebuild(): void {
    const lines = ['cynefin-beta'];
    for (const b of this.blocks) {
      lines.push(b.domain, ...(b.items ?? []).map((i) => `  ${quote(i.label)}`));
    }
    for (const t of this.transitions) {
      lines.push(`${t.from} --> ${t.to}${t.label === undefined ? '' : ` : ${quote(t.label)}`}`);
    }
    const result = parseCynefin(lines.join('\n'));
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    this.model = result.model;
  }

  getDomains(): Map<string, { name: string; items: { label: string }[] }> {
    return new Map(
      (this.model?.domains ?? []).map((d) => [
        d.name,
        { name: d.name, items: d.items.map((i) => ({ label: i.label })) },
      ])
    );
  }

  getTransitions(): { from: string; to: string; label: string | undefined }[] {
    return (this.model?.transitions ?? []).map((t) => ({ from: t.from, to: t.to, label: t.label }));
  }

  getDiagramTitle(): string {
    return this.model?.title ?? '';
  }

  getAccTitle(): string {
    return this.model?.accTitle ?? '';
  }

  getAccDescription(): string {
    return this.model?.accDescr ?? '';
  }
}

export const db = new CynefinDB();

export const parser = {
  parse(text: string): Promise<void> {
    const result = parseCynefin(text);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    if (error) return Promise.reject(new Error(error.message));
    db.load(result.model);
    return Promise.resolve();
  },
};
