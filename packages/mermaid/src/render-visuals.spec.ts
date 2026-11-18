import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const svgOf = async (text: string) => (await createMermaid().render('v', text)).svg;
const rectOf = (svg: string, id: string) => {
  const g = svg.slice(svg.indexOf(`data-id="${id}"`));
  const m = /<rect [^>]*height="([\d.]+)"/.exec(g);
  return Number(m?.[1]);
};

describe('dotted edges (v12 parity)', () => {
  it('draw with butt caps, so the 2px dashes keep their gaps', async () => {
    const svg = await svgOf('flowchart LR\n  A -.-> B\n  C --> D');
    expect(svg).toMatch(/stroke-dasharray="2" stroke-linecap="butt"/);
    expect(svg.match(/stroke-linecap="butt"/g)).toHaveLength(1);
  });

  it('keep round caps when animated, as v12 did', async () => {
    const svg = await svgOf('flowchart LR\n  A e1@-.-> B\n  e1@{ animate: true }');
    expect(svg).not.toContain('stroke-linecap="butt"');
  });
});

describe('styled font sizes are measured as drawn', () => {
  it('resolves em against the theme font size', async () => {
    const plain = rectOf(await svgOf('flowchart LR\n  A'), 'A');
    const em = rectOf(await svgOf('flowchart LR\n  A\n  style A font-size:3em'), 'A');
    const px = rectOf(await svgOf('flowchart LR\n  A\n  style A font-size:42px'), 'A');
    expect(em).toBeGreaterThan(plain);
    expect(em).toBeCloseTo(px, 0);
  });

  it('measures edge labels with their linkStyle font', async () => {
    const width = (svg: string) =>
      Number(/<g class="edgeLabel"[^>]*><rect [^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
    const plain = width(await svgOf('flowchart LR\n  A -->|hello world| B'));
    const big = width(
      await svgOf('flowchart LR\n  A -->|hello world| B\n  linkStyle 0 font-size:40px')
    );
    expect(big).toBeGreaterThan(plain * 2);
  });
});

describe('linkStyle default interpolate (R-LAYOUT-4)', () => {
  it('routes edges as the same curve set in config does', async () => {
    const paths = (svg: string) =>
      [...svg.matchAll(/<path d="([^"]+)" fill="none"/g)].map((m) => m[1]);
    const body = 'flowchart TB\n  A --> B\n  A --> C\n  C --> D\n  B --> D';
    const viaLinkStyle = paths(await svgOf(`${body}\n  linkStyle default interpolate linear`));
    const viaConfig = paths(await svgOf(`%%{init: {"flowchart": {"curve": "linear"}}}%%\n${body}`));
    expect(viaLinkStyle).toEqual(viaConfig);
  });
});

describe('arrowheads', () => {
  it('fade with linkStyle opacity', async () => {
    const svg = await svgOf('flowchart LR\n  A --> B\n  linkStyle 0 stroke:red,opacity:0.2');
    expect(svg).toMatch(/class="marker"[^>]*opacity="0.2"/);
  });
});
