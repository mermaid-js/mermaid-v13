import { describe, expect, it } from 'vitest';
import { mindmapIconName, mindmapIcons, parseMindmap } from './index.ts';

/** `DiagramPlugin.icons` (D293) in the icon forms D297 accepts. */
describe('mindmap icons', () => {
  it('names each icon as the icons plugin looks it up', () => {
    expect(mindmapIconName('mdi:fire')).toBe('mdi:fire');
    expect(mindmapIconName('fa fa-book')).toBe('fa:book');
    expect(mindmapIconName('mdi mdi-fire')).toBe('mdi:fire');
    expect(mindmapIconName(' fa  fa-book ')).toBe('fa:book');
    // Other references are kept as written: they resolve to no glyph.
    expect(mindmapIconName('bomb')).toBe('bomb');
  });

  it('lists the icons of the model in source order', () => {
    const { model } = parseMindmap(
      'mindmap\n  root\n  ::icon(fa fa-book)\n    a\n    b\n    ::icon(mdi:fire)\n'
    );
    expect(mindmapIcons(model)).toEqual(['fa:book', 'mdi:fire']);
  });
});
