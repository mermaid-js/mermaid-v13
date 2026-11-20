import { describe, expect, it } from 'vitest';
import { Heap, type HeapTies } from './index.ts';

/** Pushes each [key, item] in turn, then pops every item. */
function drain(entries: readonly [number, number][], ties?: HeapTies): number[] {
  const heap = new Heap(ties);
  for (const [key, item] of entries) heap.push(key, item);
  const out: number[] = [];
  while (heap.size > 0) out.push(heap.pop());
  return out;
}

describe('Heap (D674)', () => {
  it('pops the items by key, the least first', () => {
    const keys = [5, 3, 9, 1, 7, 2, 8, 0, 6, 4];
    expect(drain(keys.map((k) => [k, k * 10]))).toEqual(
      [...keys].sort((a, b) => a - b).map((k) => k * 10)
    );
  });

  it('pops items of equal key in the order they were pushed, by default', () => {
    expect(
      drain([
        [1, 30],
        [0, 99],
        [1, 10],
        [1, 20],
      ])
    ).toEqual([99, 30, 10, 20]);
  });

  it('pops items of equal key by item, with ties "item"', () => {
    expect(
      drain(
        [
          [1, 30],
          [0, 99],
          [1, 10],
          [1, 20],
        ],
        'item'
      )
    ).toEqual([99, 10, 20, 30]);
  });

  it('leaves items of equal key as the heap holds them, with ties "none"', () => {
    expect(
      drain(
        [
          [1, 1],
          [1, 2],
          [1, 3],
        ],
        'none'
      )
    ).toEqual([1, 3, 2]);
  });

  it('takes pushes between pops', () => {
    const heap = new Heap();
    heap.push(4, 4);
    heap.push(2, 2);
    expect(heap.pop()).toBe(2);
    heap.push(1, 1);
    heap.push(3, 3);
    expect([heap.pop(), heap.pop(), heap.pop()]).toEqual([1, 3, 4]);
    expect(heap.size).toBe(0);
  });
});
