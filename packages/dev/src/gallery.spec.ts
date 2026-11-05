import { describe, expect, it } from 'vitest';
import { buildGallery } from './gallery.ts';

const fixtures = [
  { path: 'shapes/rect.mmd', source: 'flowchart LR\n  accTitle: T\n  A[Rect] --> B' },
  { path: 'themes/forest.mmd', source: '---\nconfig:\n  theme: forest\n---\nflowchart LR\n  A' },
];

describe('buildGallery (R-TEST-6)', () => {
  it('shows a fixture without its own theme once per M1 theme', async () => {
    const { html, count } = await buildGallery(fixtures.slice(0, 1), { version: '13.0.0-test' });
    expect(count).toBe(11);
    for (const theme of [
      'redux-color',
      'redux',
      'redux-dark',
      'redux-dark-color',
      'default',
      'dark',
      'forest',
      'neutral',
      'base',
      'neo',
      'neo-dark',
    ])
      expect(html).toContain(`data-theme="${theme}"`);
    expect(html.match(/<svg /g)).toHaveLength(11);
  });

  it("puts every dark theme on a dark ground, in the theme's own background (#236)", async () => {
    const { html } = await buildGallery(fixtures.slice(0, 1), { version: '1' });
    const figure = (theme: string): string =>
      new RegExp(`<figure data-theme="${theme}"[^>]*>`).exec(html)?.[0] ?? '';
    for (const theme of ['dark', 'redux-dark', 'redux-dark-color', 'neo-dark'])
      expect(figure(theme)).toContain('class="dark"');
    for (const theme of ['redux-color', 'default', 'neo'])
      expect(figure(theme)).not.toContain('dark');
    expect(figure('neo-dark')).toContain('style="background:#333333"');
    expect(figure('neo')).toContain('style="background:#ffffff"');
  });

  it('shows only the chosen themes, and a fixture with its own theme only if it is one', async () => {
    const { html, count } = await buildGallery(fixtures, {
      version: '1',
      themes: ['neo', 'neo-dark'],
    });
    expect(count).toBe(2);
    expect([...html.matchAll(/data-theme="([\w-]+)"/g)].map((m) => m[1])).toEqual([
      'neo',
      'neo-dark',
    ]);
    expect(html).toContain('themes neo, neo-dark');
  });

  it('shows a fixture that picks its theme once, in that theme', async () => {
    const { html, count } = await buildGallery(fixtures.slice(1), { version: '13.0.0-test' });
    expect(count).toBe(1);
    expect(html).toContain('data-theme="forest"');
  });

  it('gives every diagram its own id prefix and names the version', async () => {
    const { html } = await buildGallery(fixtures, { version: '13.0.0-test' });
    const ids = [...html.matchAll(/data-p="([^"]+)"|(?<![\w-])id="([^"]+)"/g)].map(
      (m) => m[1] ?? m[2]
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('13.0.0-test');
    expect(html).toContain('shapes/rect.mmd');
  });

  it('escapes fixture paths and lists render failures instead of stopping', async () => {
    const { html, failures } = await buildGallery(
      [{ path: 'x/<bad>.mmd', source: 'flowchart LR\n  A -->' }],
      { version: '1' }
    );
    expect(html).not.toContain('<bad>');
    expect(failures).toEqual(['x/<bad>.mmd']);
  });
});
