import { describe, expect, it } from 'vitest';
import { convertBody } from './body.ts';
import { markup } from './markup.fixtures.ts';

const out = (body: string) => markup(convertBody(body).nodes);

describe('convertBody: what an icon body keeps (D295)', () => {
  it('keeps a path with its data and paint as written', () => {
    expect(out('<path fill="currentColor" d="M1.5.5h3v4z"/>')).toBe(
      '<path fill="currentColor" d="M1.5.5h3v4z"/>'
    );
  });

  it('keeps the shapes and groups, with presentation attributes', () => {
    expect(
      out(
        '<g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="1" y="2" width="3" height="4" rx=".5"/><circle cx="8" cy="8" r="2"/>' +
          '<ellipse cx="1" cy="1" rx="2" ry="3"/><line x1="0" y1="0" x2="4" y2="4"/>' +
          '<polyline points="0 0 1,1 2 2"/><polygon points="0,0 4,0 4,4" opacity=".4"/></g>'
      )
    ).toBe(
      '<g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="1" y="2" width="3" height="4" rx="0.5"/><circle cx="8" cy="8" r="2"/>' +
        '<ellipse cx="1" cy="1" rx="2" ry="3"/><line x1="0" y1="0" x2="4" y2="4"/>' +
        '<polyline points="0,0 1,1 2,2"/><polygon points="0,0 4,0 4,4" opacity=".4"/></g>'
    );
  });

  it('keeps fill-rule, clip-rule and a transform', () => {
    expect(
      out(
        '<path fill-rule="evenodd" clip-rule="evenodd" transform="matrix(1 0 0 1 2 3)" d="M0 0"/>'
      )
    ).toBe(
      '<path fill-rule="evenodd" clip-rule="evenodd" transform="matrix(1 0 0 1 2 3)" d="M0 0"/>'
    );
  });

  it('keeps text with its characters, escaped by the writer', () => {
    expect(
      out('<text x="2" y="12" font-size="10" text-anchor="middle">a &amp; &lt;b&gt;</text>')
    ).toBe('<text x="2" y="12" font-size="10" text-anchor="middle">a &amp; &lt;b&gt;</text>');
  });

  it('turns style declarations into presentation attributes', () => {
    expect(
      out('<path style="fill: #087ebf; stroke-width: 0px; mix-blend-mode: multiply" d="M0 0"/>')
    ).toBe('<path d="M0 0" fill="#087ebf" stroke-width="0px"/>');
  });

  it('reports nothing simplified for a plain body', () => {
    expect(convertBody('<path d="M0 0"/><!-- c --><title>t</title>').simplified).toBe(false);
  });
});

describe('convertBody: what an icon body loses (D295)', () => {
  it.each([
    [
      'defs and gradients',
      '<defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs>',
    ],
    ['a radial gradient', '<radialGradient id="a"/>'],
    ['a mask', '<mask id="m"><rect width="4" height="4"/></mask>'],
    ['a clip path', '<clipPath id="c"><path d="M0 0"/></clipPath>'],
    ['use', '<use href="#a"/>'],
    ['style', '<style>path{fill:red}</style>'],
    ['image', '<image href="https://example.com/x.png" width="4" height="4"/>'],
    ['animation', '<animate attributeName="opacity" to="0"/><set attributeName="x" to="1"/>'],
    ['a link', '<a href="https://example.com"><path d="M0 0"/></a>'],
    ['a nested svg', '<svg><path d="M0 0"/></svg>'],
    ['foreignObject', '<foreignObject><div>x</div></foreignObject>'],
  ])('drops %s with everything inside it, and reports it', (_what, body) => {
    const converted = convertBody(`${body}<path d="M1 1"/>`);
    expect(markup(converted.nodes)).toBe('<path d="M1 1"/>');
    expect(converted.simplified).toBe(true);
  });

  it('paints url() fills and strokes in currentColor, and reports it', () => {
    const converted = convertBody('<path fill="url(#a)" stroke="url( #b ) red" d="M0 0"/>');
    expect(markup(converted.nodes)).toBe(
      '<path fill="currentColor" stroke="currentColor" d="M0 0"/>'
    );
    expect(converted.simplified).toBe(true);
  });

  it('drops references to other elements, and reports it', () => {
    const converted = convertBody('<g clip-path="url(#c)" mask="url(#m)"><path d="M0 0"/></g>');
    expect(markup(converted.nodes)).toBe('<g><path d="M0 0"/></g>');
    expect(converted.simplified).toBe(true);
  });

  it('drops ids, classes, events and unknown attributes without a report', () => {
    const converted = convertBody(
      '<path id="a" class="b" onclick="alert(1)" data-x="1" vector-effect="non-scaling-stroke" d="M0 0"/>'
    );
    expect(markup(converted.nodes)).toBe('<path d="M0 0"/>');
    expect(converted.simplified).toBe(false);
  });

  it('drops an element hidden with display none', () => {
    expect(out('<path display="none" d="M0 0"/><path style="display:none" d="M1 1"/>')).toBe('');
  });

  it('keeps tspan only inside text, and no shape inside text', () => {
    expect(out('<tspan>a</tspan><text>b<tspan x="1">c</tspan><path d="M0 0"/></text>')).toBe(
      '<text>b<tspan x="1">c</tspan></text>'
    );
  });

  it('drops values it cannot check', () => {
    expect(
      out(
        '<rect x="1em" y="calc(1px)" width="auto" stroke-linecap="inherit" transform="perspective(2)" fill="var(--x)"/>'
      )
    ).toBe('<rect/>');
  });
});

describe('convertBody: review fixes', () => {
  it('reads compact SVG number lists', () => {
    expect(out('<g transform="translate(-1-2)"/>')).toBe('<g transform="translate(-1 -2)"/>');
    expect(out('<g transform="matrix(.5.5-.5.5 0 0)"/>')).toBe(
      '<g transform="matrix(0.5 0.5 -0.5 0.5 0 0)"/>'
    );
    expect(out('<polyline points="0,0 1-1 2,2"/>')).toBe('<polyline points="0,0 1,-1 2,2"/>');
    expect(out('<g transform="translate(1,,2)"/>')).toBe('<g/>');
  });

  it.each([
    '<g transform="perspective(2)"/>',
    '<polygon points="x"/>',
    '<path d="M0 0 url(x)"/>',
    '<text x="1 2">a</text>',
    '<rect width="auto"/>',
  ])('reports a dropped value that draws: %s', (body) => {
    expect(convertBody(body).simplified).toBe(true);
  });

  it.each([
    '<path d="M0 0" fill="#f00" stroke="url(#a)',
    '<path d="M0 0"/><!-- <path d="M1 1"/>',
    '<text><![CDATA[a',
  ])('reports a body cut short: %s', (body) => {
    expect(convertBody(body).simplified).toBe(true);
  });

  it('decodes named references as label text does', () => {
    expect(out('<text>a&nbsp;b &copy; &unknown; &#169;</text>')).toBe(
      '<text>a b © &amp;unknown; ©</text>'
    );
  });
});
