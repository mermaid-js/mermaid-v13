import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Scratch from './scratch.ts';

// A fresh module each time, so that every case starts with an empty buffer.
let S: typeof Scratch;
beforeEach(async () => {
  vi.resetModules();
  S = await import('./scratch.ts');
});

// Runs one frame that takes `bytes`, so that the next frames have a buffer to take from.
function warm(bytes: number): void {
  S.scratch(() => S.u8(bytes));
}

const shared = (a: ArrayBufferView, b: ArrayBufferView): boolean =>
  a.buffer === b.buffer &&
  a.byteOffset < b.byteOffset + b.byteLength &&
  b.byteOffset < a.byteOffset + a.byteLength;

describe('layout scratch arrays', () => {
  it('makes new arrays outside a frame, and takes nothing from the buffer', () => {
    warm(4096);
    const a = S.i32(8);
    expect(a.buffer.byteLength).toBe(32);
    expect(S.scratchState().top).toBe(0);
  });

  it('grows the buffer after a frame that needed more, and takes from it after that', () => {
    S.scratch(() => {
      // Nothing to take from yet: a new array, of the length asked for.
      const a = S.f64(100);
      expect(a.length).toBe(100);
      expect(a.buffer.byteLength).toBe(800);
    });
    expect(S.scratchState().size).toBeGreaterThanOrEqual(800);
    S.scratch(() => {
      const a = S.f64(100);
      expect(a.length).toBe(100);
      expect(a.buffer.byteLength).toBe(S.scratchState().size);
    });
  });

  it('gives each array its exact length and an 8-byte start', () => {
    warm(4096);
    S.scratch(() => {
      const a = S.u8(3);
      const b = S.f64(5);
      const c = S.i32(7);
      const d = S.f64(1);
      expect([a.length, b.length, c.length, d.length]).toEqual([3, 5, 7, 1]);
      for (const x of [a, b, c, d]) expect(x.byteOffset % 8).toBe(0);
      const all = [a, b, c, d];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect(shared(all[i]!, all[j]!)).toBe(false);
    });
  });

  it('keeps the arrays of nested frames apart, and of frames that follow each other', () => {
    warm(4096);
    S.scratch(() => {
      const outer = S.i32(16).fill(7);
      let inner: Int32Array | undefined;
      S.scratch(() => {
        inner = S.i32(16).fill(9);
        expect(shared(outer, inner)).toBe(false);
        S.scratch(() => {
          const deepest = S.i32(16).fill(11);
          expect(shared(deepest, inner!)).toBe(false);
          expect(shared(deepest, outer)).toBe(false);
        });
        // The innermost frame is over: what it had is free again, the rest is kept.
        const next = S.i32(16);
        expect(shared(next, inner)).toBe(false);
        expect([...next]).toEqual(new Array(16).fill(0));
        expect([...inner]).toEqual(new Array(16).fill(9));
      });
      expect([...outer]).toEqual(new Array(16).fill(7));
      // After the inner frame ends, its room is used again, zeroed.
      const again = S.i32(16);
      expect(shared(again, inner!)).toBe(true);
      expect([...again]).toEqual(new Array(16).fill(0));
    });
    expect(S.scratchState()).toMatchObject({ top: 0, depth: 0 });
  });

  it('hands out zeros, whatever an earlier frame left there', () => {
    warm(4096);
    S.scratch(() => {
      S.f64(64).fill(Math.PI);
      S.i32(64).fill(-1);
      S.u8(64).fill(255);
    });
    S.scratch(() => {
      for (const a of [S.u8(200), S.i32(200), S.f64(200)])
        expect([...a].every((v) => v === 0)).toBe(true);
    });
  });

  it('gives everything back when a frame throws, so the next frame starts clean', () => {
    warm(4096);
    expect(() =>
      S.scratch(() => {
        S.i32(32).fill(5);
        S.scratch(() => {
          S.f64(32).fill(6);
          throw new Error('mid-way');
        });
      })
    ).toThrow('mid-way');
    expect(S.scratchState()).toMatchObject({ top: 0, depth: 0 });
    S.scratch(() => {
      const a = S.i32(32);
      const b = S.f64(32);
      expect(a.byteOffset).toBe(0);
      expect([...a].every((v) => v === 0)).toBe(true);
      expect([...b].every((v) => v === 0)).toBe(true);
    });
  });

  it('keeps at most CAP bytes, and makes new arrays for what does not fit', () => {
    S.scratch(() => S.f64(S.CAP)); // 8 × CAP bytes, far past the cap
    expect(S.scratchState().size).toBe(S.CAP);
    S.scratch(() => {
      const fits = S.u8(S.CAP / 2);
      const past = S.f64(S.CAP / 8);
      expect(fits.buffer.byteLength).toBe(S.CAP);
      expect(past.buffer).not.toBe(fits.buffer);
      expect(past.length).toBe(S.CAP / 8);
      // Once past the end, small arrays are new ones too, until the frame ends.
      expect(S.i32(4).buffer).not.toBe(fits.buffer);
    });
    S.scratch(() => expect(S.i32(4).buffer.byteLength).toBe(S.CAP));
  });

  it('copies the first entries of an array', () => {
    warm(4096);
    S.scratch(() => {
      const from = Int32Array.of(1, 2, 3, 4);
      expect([...S.copy(from, 4)]).toEqual([1, 2, 3, 4]);
      expect([...S.copy(from, 2)]).toEqual([1, 2]);
    });
  });
});
