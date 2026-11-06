import { describe, expect, it } from 'vitest';
import { mindmapIconName, mindmapIcons, parseMindmap } from './index.ts';

/** `DiagramPlugin.icons` (D293) in the icon forms D297 accepts. */
describe('mindmap icons', () => {
  it('names each icon as the icons plugin looks it up', () => {
    expect(mindmapIconName('mdi:fire')).toBe('mdi:fire');
    expect(mindmapIconName('fa fa-book')).toBe('fa:book');
    expect(mindmapIconName('mdi mdi-fire')).toBe('mdi:fire');
    expect(mindmapIconName(' fa  fa-book ')).toBe('fa:book');
    expect(mindmapIconName('fab fa-github')).toBe('fab:github');
    expect(mindmapIconName('fas fa-car')).toBe('fas:car');
    // Other references are kept as written: they resolve to no glyph.
    expect(mindmapIconName('bomb')).toBe('bomb');
    expect(mindmapIconName('mdi arrow-left')).toBe('mdi arrow-left');
    expect(mindmapIconName('mdi fa-book')).toBe('mdi fa-book');
    expect(mindmapIconName('fa mdi-fire')).toBe('fa mdi-fire');
    expect(mindmapIconName('mdi\nmdi-fire')).toBe('mdi\nmdi-fire');
  });

  it('lists the icons of the model in source order', () => {
    const { model } = parseMindmap(
      'mindmap\n  root\n  ::icon(fa fa-book)\n    a\n    b\n    ::icon(mdi:fire)\n'
    );
    expect(mindmapIcons(model)).toEqual(['fa:book', 'mdi:fire']);
  });
});
