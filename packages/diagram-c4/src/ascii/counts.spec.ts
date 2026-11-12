import { describe, expect, it } from 'vitest';
import { BlockCounts } from './counts.ts';

describe('BlockCounts (#689)', () => {
  it('counts the marked cells of every block of its region, as a scan does', () => {
    const marked = (x: number, y: number): boolean => (x * 7 + y * 13) % 5 === 0 || x === y;
    const region = { x: 3, y: 2, width: 9, height: 6 };
    const counts = new BlockCounts(region, marked);
    for (let y = region.y; y < region.y + region.height; y++)
      for (let x = region.x; x < region.x + region.width; x++)
        for (let h = 1; y + h <= region.y + region.height; h++)
          for (let w = 1; x + w <= region.x + region.width; w++) {
            let scanned = 0;
            for (let j = y; j < y + h; j++)
              for (let i = x; i < x + w; i++) if (marked(i, j)) scanned++;
            expect(counts.count(x, y, w, h), `${w} × ${h} at (${x}, ${y})`).toBe(scanned);
          }
  });

  it('reads each cell of the region once', () => {
    let reads = 0;
    const counts = new BlockCounts({ x: 0, y: 0, width: 400, height: 3 }, () => {
      reads++;
      return true;
    });
    for (let x = 0; x < 300; x++) expect(counts.count(x, 0, 100, 3)).toBe(300);
    expect(reads).toBe(1200);
  });
});
