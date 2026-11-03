import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from './index.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('render ids and links', () => {
  it('renders theme: auto with any render id, React useId() included', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'auto' });
    const { svg } = await m.render('mermaid-svg-:r1:', 'flowchart LR\n  A --> B');
    const scope = /data-p="([^"]+)"/.exec(svg)?.[1];
    expect(scope).toMatch(/^p-[0-9a-z]+$/);
    expect(svg).toContain(`svg[data-p=${scope}]{`);
    assertInert(svg, { themeStyle: true });
  });

  it('gives edge labels the edge’s AST id (R-PARSE-8)', async () => {
    const { svg } = await createMermaid().render('e', 'flowchart LR\n  A -->|go| B');
    expect(svg).toMatch(/<g class="edgeLabel" data-id="L_A_B_0" data-ast="e:A&gt;B">/);
  });

  it('draws raster data-URL images and refuses mailto as an image source (R-SEC-2)', async () => {
    const m = createMermaid();
    const data = await m.render('i', `flowchart LR\n  A@{ img: "${PNG}" }`);
    expect(data.svg).toContain(`<image href="${PNG}"`);
    expect(data.warnings.map((w) => w.code)).not.toContain('URL_REFUSED');
    assertInert(data.svg);
    const mail = await m.render('j', 'flowchart LR\n  A@{ img: "mailto:a@b.c" }');
    expect(mail.svg).not.toContain('<image');
    expect(mail.warnings.find((w) => w.code === 'URL_REFUSED')?.message).toMatch(/^The image/);
  });

  it('says an icon without a form is left out, not that its frame is drawn', async () => {
    const { warnings } = await createMermaid().render('k', 'flowchart LR\n  A@{ icon: "fa:user" }');
    expect(warnings.find((w) => w.code === 'ICON_UNAVAILABLE')?.message).toMatch(/it is left out/);
  });
});
