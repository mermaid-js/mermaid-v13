import { describe, expect, it } from 'vitest';
import { tidyAttributes, type LinkRules } from './sanitize.ts';

// The unit suite has no DOM (R-ARCH-1), so these stand-ins carry only what `tidyAttributes`
// reads. The browser specs in e2e/dom/html-labels.spec.ts run it inside DOMPurify.
function styleOf(declarations: Record<string, string>) {
  const props = new Map(Object.entries(declarations));
  return {
    get length() {
      return props.size;
    },
    [Symbol.iterator]: () => [...props.keys()][Symbol.iterator](),
    getPropertyValue: (name: string) => props.get(name) ?? '',
    removeProperty: (name: string) => void props.delete(name),
    remaining: () => Object.fromEntries(props),
  };
}

function element(attributes: Record<string, string>, style?: Record<string, string>) {
  const attrs = new Map(Object.entries(attributes));
  const node = {
    style: style && styleOf(style),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    hasAttribute: (name: string) => attrs.has(name),
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
    attrs: () => Object.fromEntries(attrs),
  };
  return node;
}

function tidy(node: ReturnType<typeof element>, links: LinkRules = {}): void {
  tidyAttributes(node as unknown as Element, links);
}

describe('tidyAttributes', () => {
  it('keeps the links the render allows and drops the rest', () => {
    const a = element({ href: 'https://example.com/', src: 'javascript:alert(1)' });
    tidy(a);
    expect(a.attrs()).toEqual({ href: 'https://example.com/' });
  });

  it('follows the render: strict drops every link, linkSchemes adds a scheme', () => {
    const strict = element({ href: 'https://example.com/' });
    tidy(strict, { securityLevel: 'strict' });
    expect(strict.attrs()).toEqual({});

    const listed = element({ href: 'myapp://open' });
    tidy(listed, { linkSchemes: ['myapp'] });
    expect(listed.attrs()).toEqual({ href: 'myapp://open' });
  });

  it('drops the declarations that position the element or load something', () => {
    const span = element(
      { style: 'x' },
      { color: 'red', position: 'fixed', 'z-index': '9', background: 'url(https://x/)' }
    );
    tidy(span);
    expect(span.style?.remaining()).toEqual({ color: 'red' });
    expect(span.attrs()).toEqual({ style: 'x' });
  });

  it('drops the style attribute when nothing is left in it', () => {
    const span = element({ style: 'x' }, { top: '0', 'background-image': 'image-set("a.png" 1x)' });
    tidy(span);
    expect(span.attrs()).toEqual({});
  });

  it('drops the style attribute of an element that has no style object', () => {
    const node = element({ style: 'position:fixed' });
    tidy(node);
    expect(node.attrs()).toEqual({});
  });

  it('cuts a new browsing context off from the page', () => {
    const a = element({ href: 'https://example.com/', target: '_blank' });
    tidy(a);
    expect(a.attrs()).toEqual({
      href: 'https://example.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('leaves an element without links, style or target as it is', () => {
    const b = element({ class: 'x' });
    tidy(b);
    expect(b.attrs()).toEqual({ class: 'x' });
  });
});
