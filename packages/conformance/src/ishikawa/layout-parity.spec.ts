import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutIshikawa, type IshikawaLayout } from '@mermaid-js/diagram-ishikawa';
import {
  ishikawaTestConfig,
  ishikawaTestContext,
  ishikawaTestTheme,
  layoutIshikawaUnfixed,
  parsedIshikawa,
} from '@mermaid-js/diagram-ishikawa/testing';
import type { CorpusItem } from '../types.ts';
import { ishikawaGateCorpus } from './corpus.ts';
import { CHAR_EM, closeV12, LINE, v12Drawn, type V12Drawn } from './v12-render.ts';

/**
 * Layout parity with v12 (spec #519, pitfall 29): the spine, head, bones, label boxes and
 * sub-cause text points equal what mermaid\@12.2.0's own renderer drew, within 1e-6, at v12's
 * sizes (`v12-render.ts`: v12 run under jsdom, its `getBBox` a fixed measure, and v13 measuring
 * the same), in the classic theme (v12 laid out at the config `fontSize`, 16).
 *
 * - With both overlap fixes off (`layoutIshikawaUnfixed`), every compared source equals v12.
 * - With them on (`layoutIshikawa`), exactly the sources where v12 drew a cause's label box over
 *   the head or across the spine differ (GAPS #582).
 *
 * Left out, each a decided or listed change: labels with markup or entities, v12's `#35;` form
 * too (core's label layout, D495: v12 counted `<br>` and `&amp;` as characters when wrapping),
 * `handDrawn` (v12's rough lines are not `line` elements), and a `fontSize` or theme set in the
 * source (D493).
 */
const measurer: Measurer = {
  id: 'ishikawa-v12-sizes',
  width: (text, font) => [...text].length * CHAR_EM * font.size,
  metrics: () => ({ ascent: LINE * 0.8, descent: LINE * 0.2, lineHeight: LINE }),
};

let classic: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  classic = await ishikawaTestTheme(ishikawaTestConfig(undefined, { theme: 'default' }));
  corpus = await ishikawaGateCorpus();
});
afterAll(closeV12);

const EPS = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a));

/** v13's drawing in v12's terms: the same parts in v12's document order. */
function asV12(layout: IshikawaLayout): V12Drawn {
  const parts: V12Drawn['parts'][number][] = [];
  const subText: { x: number; y: number }[] = [];
  for (const pair of layout.pairs) {
    for (const c of pair.causes) {
      parts.push({ kind: 'branch', ...c.bone }, { kind: 'box', ...c.box });
      for (const s of c.subCauses) {
        parts.push({ kind: 'sub-branch', ...s.bone });
        // v12's sub-cause text is at the slot, its lines centred on it whatever its baseline.
        subText.push({ x: s.label.anchor.x, y: s.label.anchor.y });
      }
    }
  }
  return {
    ...(layout.spine ? { spine: { kind: 'spine', ...layout.spine } } : {}),
    ...(layout.head
      ? { head: { height: layout.head.height, control: layout.head.control.x } }
      : {}),
    parts,
    subText,
  };
}

/** The first difference between the two drawings, or undefined. */
function difference(v12: V12Drawn, v13: V12Drawn): string | undefined {
  const same = (a: object | undefined, b: object | undefined, keys: string[]): boolean =>
    a === undefined || b === undefined
      ? a === b
      : keys.every((k) => {
          const x = (a as Record<string, unknown>)[k];
          const y = (b as Record<string, unknown>)[k];
          return typeof x === 'number' ? near(x, y as number) : x === y;
        });
  const LINE_KEYS = ['kind', 'x1', 'y1', 'x2', 'y2'];
  if (!same(v12.spine, v13.spine, LINE_KEYS)) return 'spine';
  if (!same(v12.head, v13.head, ['height', 'control'])) return 'head';
  if (v12.parts.length !== v13.parts.length)
    return `${v12.parts.length} parts, v13 ${v13.parts.length}`;
  for (let i = 0; i < v12.parts.length; i++) {
    const p = v12.parts[i]!;
    const keys = p.kind === 'box' ? ['kind', 'x', 'y', 'width', 'height'] : LINE_KEYS;
    if (!same(p, v13.parts[i], keys)) return `part ${i} (${p.kind})`;
  }
  for (let i = 0; i < v12.subText.length; i++) {
    if (!same(v12.subText[i], v13.subText[i], ['x', 'y'])) return `sub-cause text ${i}`;
  }
  return undefined;
}

/** v12 drew a label box over the head (`x > 0` on its rows) or across the spine. */
function v12Overlapped(v12: V12Drawn): boolean {
  const spineY = v12.spine?.y1 ?? 0;
  const half = (v12.head?.height ?? 0) / 2;
  return v12.parts.some(
    (p) =>
      p.kind === 'box' &&
      ((p.x + p.width > 0 && p.y < spineY + half && p.y + p.height > spineY - half) ||
        (p.y < spineY && p.y + p.height > spineY))
  );
}

/** Sources outside the comparison (see the spec's comment). */
const LEFT_OUT = /[<&]|#\w+;|handDrawn|fontSize|theme:|"theme"/;

describe('ishikawa layout parity with v12', () => {
  it("equals v12's drawing with the overlap fixes off, and differs with them only where v12 overlapped", async ({
    annotate,
  }) => {
    const failures: string[] = [];
    const overlapped: string[] = [];
    const moved: string[] = [];
    let compared = 0;
    for (const item of corpus) {
      if (LEFT_OUT.test(item.source)) continue;
      const { model, diagnostics } = parsedIshikawa(item.source);
      if (diagnostics.some((d) => d.severity === 'error') || !model.effect) continue;
      const v12 = await v12Drawn(item.source);
      if (v12 === undefined) {
        failures.push(`${item.id}: v12 rejects what v13 accepts`);
        continue;
      }
      compared++;
      const ctx = ishikawaTestContext(classic, {}, [], measurer);
      const unfixed = difference(v12, asV12(layoutIshikawaUnfixed(model, ctx)));
      if (unfixed !== undefined) failures.push(`${item.id}: ${unfixed}`);
      if (v12Overlapped(v12)) overlapped.push(item.id);
      if (difference(v12, asV12(layoutIshikawa(model, ctx))) !== undefined) moved.push(item.id);
    }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(moved).toEqual(overlapped);
    // 481 compared and 66 moved when written.
    expect(compared).toBeGreaterThan(400);
    expect(moved.length).toBeGreaterThan(0);
    await annotate(`${compared} sources equal to v12 unfixed; ${moved.length} moved by the fixes`);
  }, 300_000);
});
