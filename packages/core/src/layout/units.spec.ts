import { describe, expect, it } from 'vitest';
import { TURN_BREAKPOINT, V12_SPACING } from './layered/index.ts';
import { cellProfile, fromPx, pxProfile, type LayoutMetrics } from './units.ts';

describe('pxProfile (D77)', () => {
  // Equality with the engine's module-private constants is checked in conformance
  // (unit-profile.spec.ts), which reads them from source.
  it('turns across drawings at the engine breakpoint', () => {
    expect(pxProfile.engine.turnBreakpoint).toBe(TURN_BREAKPOINT);
  });

  it('has builder spacing equal to the v12 defaults', () => {
    expect(pxProfile.builder.spacing).toEqual({
      node: V12_SPACING.nodeSpacing,
      rank: V12_SPACING.rankSpacing,
      edge: V12_SPACING.edgeSpacing,
    });
    expect(pxProfile.builder.diagramPadding).toBe(V12_SPACING.diagramPadding);
  });

  it('is px, 1 × 1, without a grid', () => {
    expect(pxProfile.id).toBe('px');
    expect(pxProfile.pxPerUnit).toEqual({ x: 1, y: 1 });
    expect(pxProfile.grid).toBeUndefined();
  });

  it('leaves 8 px each side of an edge label and 4 px above and below (D622)', () => {
    expect(pxProfile.builder.labelPatch).toEqual({ x: 16, y: 8 });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(pxProfile)).toBe(true);
    expect(Object.isFrozen(pxProfile.engine)).toBe(true);
    expect(Object.isFrozen(pxProfile.builder.nodePad)).toBe(true);
  });
});

// The least cell value of each metric: more than nothing, except an end label's room along its
// segment, which may start in the row or column just off its node's side (D102).
const MIN_CELL: Partial<Record<keyof LayoutMetrics, number>> = { endLabelAlong: 0 };

describe('cellProfile (D77, D140)', () => {
  it('is compact by default', () => {
    expect(cellProfile()).toBe(cellProfile('compact'));
  });

  it('lays out on a grid of 1 at 8 × 16 px per cell', () => {
    for (const p of [cellProfile('compact'), cellProfile('roomy')]) {
      expect(p.id).toBe('cell');
      expect(p.grid).toBe(1);
      expect(p.pxPerUnit).toEqual({ x: 8, y: 16 });
    }
  });

  it('has the compact values of DESIGN §6.3', () => {
    const b = cellProfile('compact').builder;
    // label + 2·x + 2 wide, lines + 2·y + 2 high: label + 4 × lines + 2.
    expect(2 * b.nodePad.x + 2).toBe(4);
    expect(2 * b.nodePad.y + 2).toBe(2);
    expect(b.spacing).toEqual({ node: 2, rank: 4, edge: 1 });
    expect(b.labelPatch).toEqual({ x: 2, y: 0 });
    expect(b.groupPad).toBe(1);
    expect(b.titlePad).toBe(0);
    expect(b.headRoom).toBe(1);
    expect(b.minSpacing.node).toBe(2);
    expect(b.minSpacing.rank).toBe(3);
  });

  it('pads boxes by 1 each way and keeps gaps of 5 when roomy', () => {
    const b = cellProfile('roomy').builder;
    expect(b.nodePad).toEqual({ x: 1, y: 1 });
    expect(b.spacing.node).toBe(5);
    expect(b.spacing.rank).toBe(5);
  });

  it('puts edge ends 2 cells apart, with 1 as the least (D140)', () => {
    expect(cellProfile().engine.portPitch).toBe(2);
    expect(cellProfile().engine.minPitch).toBe(1);
  });

  it('turns across drawings under the px breakpoint in cells', () => {
    expect(cellProfile().engine.turnBreakpoint).toBe(TURN_BREAKPOINT / 8);
  });

  it('has a cell value for every px metric', () => {
    const keys = Object.keys(pxProfile.engine).sort();
    expect(Object.keys(cellProfile().engine).sort()).toEqual(keys);
    for (const k of keys) {
      const v = cellProfile().engine[k as keyof LayoutMetrics];
      expect(v, k).toBeGreaterThanOrEqual(MIN_CELL[k as keyof LayoutMetrics] ?? 1e-9);
      expect(v, k).toBeLessThanOrEqual(pxProfile.engine[k as keyof LayoutMetrics]);
    }
  });
});

describe('fromPx', () => {
  it('keeps px values as they are', () => {
    expect(fromPx(pxProfile, 50.5, 'x')).toBe(50.5);
  });

  it('converts to whole cells per axis', () => {
    expect(fromPx(cellProfile(), 200, 'x')).toBe(25);
    expect(fromPx(cellProfile(), 50, 'y')).toBe(3);
  });

  it('clamps to the minimum', () => {
    const min = cellProfile().builder.minSpacing;
    expect(fromPx(cellProfile(), 8, 'x', min.node)).toBe(2);
    expect(fromPx(cellProfile(), 16, 'y', min.rank)).toBe(3);
  });
});
