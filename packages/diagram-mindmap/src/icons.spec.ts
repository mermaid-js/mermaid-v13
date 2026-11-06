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
    // Any other reference is no glyph name (D297): it is shown as written, never looked up.
    for (const other of [
      'bomb',
      'fa-book',
      'mdi-fire',
      'mdi arrow-left',
      'mdi fa-book',
      'fa mdi-fire',
      'mdi\nmdi-fire',
      'mdi:',
      ':fire',
      'a:b:c',
      'mdi :fire',
    ])
      expect(mindmapIconName(other), other).toBeUndefined();
  });

  it('lists the icons of the model in source order', () => {
    const { model } = parseMindmap(
      'mindmap\n  root\n  ::icon(fa fa-book)\n    a\n    ::icon(fa-book)\n    b\n    ::icon(mdi:fire)\n'
    );
    expect(mindmapIcons(model)).toEqual(['fa:book', 'mdi:fire']);
  });
});
