/**
 * A binary min-heap of numeric items by numeric key, the open list of the grid searches that route
 * lines (core's route repair, and the diagrams' own routers). Exported from `@mermaid-js/core/ascii`
 * (D674).
 */

/**
 * Which of two items of equal key comes out first: `'pushed'` the one pushed first, `'item'` the
 * smaller item, `'none'` either, as the heap's layout leaves them (still the same for the same
 * pushes and pops, so a search stays deterministic).
 */
export type HeapTies = 'pushed' | 'item' | 'none';

/**
 * A binary min-heap of items by key, ties as `ties` says (by default the order pushed). Each entry
 * holds a second key that settles ties: its push number, the item, or 0 for all.
 */
export class Heap {
  private readonly keys: number[] = [];
  private readonly order: number[] = [];
  private readonly items: number[] = [];
  private count = 0;

  constructor(private readonly ties: HeapTies = 'pushed') {}

  get size(): number {
    return this.items.length;
  }

  push(key: number, item: number): void {
    const ties = this.ties;
    const second = ties === 'item' ? item : 0;
    this.keys.push(key);
    this.order.push(ties === 'pushed' ? this.count++ : second);
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Takes the item of the least key out. The heap must not be empty. */
  pop(): number {
    const top = this.items[0]!;
    const last = this.items.length - 1;
    this.swap(0, last);
    this.keys.pop();
    this.order.pop();
    this.items.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.items.length && this.less(l, m)) m = l;
      if (r < this.items.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a]!;
    const kb = this.keys[b]!;
    return ka < kb || (ka === kb && this.order[a]! < this.order[b]!);
  }

  private swap(a: number, b: number): void {
    const { keys, order, items } = this;
    const k = keys[a]!;
    keys[a] = keys[b]!;
    keys[b] = k;
    const o = order[a]!;
    order[a] = order[b]!;
    order[b] = o;
    const t = items[a]!;
    items[a] = items[b]!;
    items[b] = t;
  }
}
