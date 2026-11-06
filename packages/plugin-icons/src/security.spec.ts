/**
 * The XSS corpus as icon bodies (R-SEC-2, D295): whatever a pack holds, the converted body is
 * inside the allow-list. Each payload is tried as a whole body and in every position a body
 * can carry text: element names, attribute values of every kind, text content.
 */
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS, V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import type { SvgFragment } from '@mermaid-js/core/text';
import { describe, expect, it } from 'vitest';
import { convertBody } from './body.ts';
import { markup } from './markup.fixtures.ts';

/* cspell:disable */
/** Attacks aimed at SVG bodies in particular. */
const SVG_ATTACKS: readonly string[] = [
  '<path d="M0 0" onload="alert(1)"/>',
  '<g onmouseover="alert(1)"><path d="M0 0"/></g>',
  '<use href="data:image/svg+xml;base64,PHN2Zy8+#x"/>',
  '<use xlink:href="https://evil.example/s.svg#a"/>',
  '<image href="javascript:alert(1)"/>',
  '<a xlink:href="javascript:alert(1)"><path d="M0 0"/></a>',
  '<animate attributeName="href" values="javascript:alert(1)"/>',
  '<set attributeName="onmouseover" to="alert(1)"/>',
  '<script>alert(1)</script><path d="M0 0"/>',
  '<script><![CDATA[alert(1)]]></script>',
  '<style>@import url(//evil.example/x.css);</style>',
  '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject>',
  '<path fill="url(javascript:alert(1))" d="M0 0"/>',
  '<path style="fill:url(//evil.example/x)" d="M0 0"/>',
  '<path style="behavior:url(x.htc);-moz-binding:url(x)" d="M0 0"/>',
  '<path filter="url(https://evil.example/f.svg#x)" d="M0 0"/>',
  '<path d="M0 0&quot; onload=&quot;alert(1)"/>',
  '<path d="M0 0" fill="red&quot; onload=&quot;alert(1)"/>',
  '<text>&lt;script&gt;alert(1)&lt;/script&gt;</text>',
  '<text><![CDATA[</text><script>alert(1)</script>]]></text>',
  '<text>&#0;&#xd800;&#x110000;&#65534;</text>',
  '<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><text>&x;</text>',
  '<?xml-stylesheet href="//evil.example/x.css"?><path d="M0 0"/>',
  '<path d="M0 0"',
  '<g><g><path d="M0 0"></g>',
  '</g></svg><script>alert(1)</script>',
  '<svg:script>alert(1)</svg:script>',
  '<PATH D="M0 0" ONLOAD="alert(1)"/>',
  '<path d=M0,0 onload=alert(1) />',
  "<path d='M0 0' fill='red' onload='alert(1)'/>",
  '<path transform="translate(1) url(x)" d="M0 0"/>',
  '<path transform="rotate(1,2,3)expression(alert(1))" d="M0 0"/>',
  '<rect x="1)expression(alert(1)" width="1e999" height="NaN"/>',
  '<polygon points="0,0 1,1 javascript:alert(1)"/>',
  '<text font-family="x&quot;;}body{background:url(//evil)}" font-size="url(x)">a</text>',
  `${'<g>'.repeat(10_000)}<path d="M0 0"/>`,
];
/* cspell:enable */

const POSITIONS: readonly ((p: string) => string)[] = [
  (p) => p,
  (p) => `<${p}/>`,
  (p) => `<path d="${p}"/>`,
  (p) => `<path fill="${p}" stroke="${p}" color="${p}"/>`,
  (p) => `<path style="${p}"/>`,
  (p) => `<path style="fill:${p}"/>`,
  (p) => `<g transform="${p}"/>`,
  (p) => `<rect x="${p}" width="${p}" stroke-width="${p}" opacity="${p}"/>`,
  (p) => `<polyline points="${p}" stroke-dasharray="${p}"/>`,
  (p) => `<text font-family="${p}" text-anchor="${p}" fill-rule="${p}">${p}</text>`,
  (p) => `<text><![CDATA[${p}]]></text>`,
  (p) => `<path d='${p}' fill=${p}/>`,
];

const V12_STRINGS = V12_XSS_CASES.flatMap((c) => [
  ...(c.source === undefined ? [] : [c.source]),
  ...(c.text ?? []),
  ...(c.urls ?? []),
  ...(c.styles ?? []),
  ...(c.values ?? []),
]);

const KEPT = new Set([
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
]);

function tags(nodes: readonly (SvgFragment | string)[], into: Set<string>): Set<string> {
  for (const n of nodes)
    if (typeof n !== 'string') {
      into.add(n.tag);
      tags(n.children ?? [], into);
    }
  return into;
}

describe('icon bodies stay inside the allow-list (R-SEC-2)', () => {
  const corpus = [...PAYLOADS, ...V12_STRINGS, ...SVG_ATTACKS];

  it.each(POSITIONS.map((at, i) => [i, at] as const))(
    'every payload in position %i converts to inert markup of kept elements only',
    (_i, at) => {
      for (const payload of corpus) {
        const { nodes } = convertBody(at(payload));
        const svg = markup(nodes, [0, 0, 16, 16]);
        expect(() => assertInert(svg, { gradient: false }), payload).not.toThrow();
        for (const tag of tags(nodes, new Set())) expect(KEPT, payload).toContain(tag);
      }
    }
  );

  it('keeps the drawing an attack wraps, without the attack', () => {
    expect(markup(convertBody('<path d="M0 0" onload="alert(1)"/>').nodes)).toBe(
      '<path d="M0 0"/>'
    );
    expect(markup(convertBody('<PATH D="M0 0" ONLOAD="alert(1)"/>').nodes)).toBe('');
    expect(markup(convertBody('<path d="M0 0" constructor="x" __proto__="y"/>').nodes)).toBe(
      '<path d="M0 0"/>'
    );
  });
});
