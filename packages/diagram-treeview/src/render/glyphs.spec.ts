import { describe, expect, it } from 'vitest';
import { builtinGlyph } from './glyphs.ts';

describe('the built-in glyphs (D485)', () => {
  it("are v12's bodies at 24 px, in absolute commands", () => {
    expect(builtinGlyph('mermaid-treeview:folder', 24)).toEqual({
      d: 'M10.59,4.59A2,2 0 0,0 9.17,4L4,4A2,2 0 0,0 2,6L2,18A2,2 0 0,0 4,20L20,20A2,2 0 0,0 22,18L22,8A2,2 0 0,0 20,6L12.83,6Z',
      fill: 'currentColor',
    });
    expect(builtinGlyph('mermaid-treeview:file', 24)).toEqual({
      d: 'M6,2A2,2 0 0,0 4,4L4,20A2,2 0 0,0 6,22L18,22A2,2 0 0,0 20,20L20,8.83A2,2 0 0,0 19.41,7.41L14.59,2.59A2,2 0 0,0 13.17,2L6,2ZM13.5,3.9L18.1,8.5L14.5,8.5A1,1 0 0,1 13.5,7.5L13.5,3.9Z',
      fill: 'currentColor',
      'fill-rule': 'evenodd',
      'clip-rule': 'evenodd',
    });
  });

  it('scale into the icon square', () => {
    const d = builtinGlyph('mermaid-treeview:file', 14)!.d as string;
    const numbers = (d.match(/-?[\d.]+/g) ?? []).map(Number);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(14);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(d).toContain('A1.17,1.17 0 0,0');
  });

  it('are only file and folder of the built-in pack', () => {
    for (const name of [
      'mermaid-treeview:react',
      'fa:file',
      'file',
      'mermaid-treeview:constructor',
    ])
      expect(builtinGlyph(name, 14), name).toBeUndefined();
  });
});
