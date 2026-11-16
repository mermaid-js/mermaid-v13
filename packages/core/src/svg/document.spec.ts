import { describe, expect, it } from 'vitest';
import { openSvgRoot, textElement } from './document.ts';
import type { StyleText } from './types.ts';
import { streamWriter } from './writer.ts';
import type { RootContext } from './document.ts';

const ctx = (idPrefix?: () => string): RootContext => ({
  theme: { rootStyleText: () => '' as StyleText, autoDeclarations: () => undefined },
  get idPrefix() {
    return idPrefix?.();
  },
  version: '13.0.0',
});

describe('openSvgRoot', () => {
  it('writes the root at full width, named by its title and description', () => {
    const w = streamWriter();
    openSvgRoot(
      w,
      ctx(() => 'm1'),
      {
        name: 'er erDiagram',
        viewBox: [0, 0, 10, 20],
        maxWidth: true,
        title: 'T',
        desc: 'D',
      }
    );
    w.close();
    expect(w.finish()).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" class="mermaid mermaid-er erDiagram" ' +
        'viewBox="0 0 10 20" width="100%" role="img" aria-roledescription="er" ' +
        'aria-labelledby="m1-title" aria-describedby="m1-desc" data-mermaid-version="13.0.0" ' +
        'style="max-width:10px"><title id="m1-title">T</title><desc id="m1-desc">D</desc></svg>'
    );
  });

  it('writes a fixed size without reading the id prefix', () => {
    const w = streamWriter();
    const prefix = (): string => {
      throw new Error('read');
    };
    openSvgRoot(w, ctx(prefix), {
      name: 'class',
      roleDescription: 'classDiagram',
      viewBox: [1, 2, 10, 20],
      maxWidth: false,
      attrs: { 'font-size': 16 },
    });
    w.close();
    expect(w.finish()).toContain(
      'viewBox="1 2 10 20" width="10" height="20" role="img" aria-roledescription="classDiagram" ' +
        'data-mermaid-version="13.0.0" style="" font-size="16"/>'
    );
  });
});

describe('textElement', () => {
  it('writes a title with an id, or a desc without one', () => {
    const w = streamWriter();
    w.open('g');
    textElement(w, 'title', 'a < b', 'x-title');
    textElement(w, 'desc', 'D');
    w.close();
    expect(w.finish()).toBe('<g><title id="x-title">a &lt; b</title><desc>D</desc></g>');
  });
});
