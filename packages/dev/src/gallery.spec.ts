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
