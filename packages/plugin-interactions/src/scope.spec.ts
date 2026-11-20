import { describe, expect, it } from 'vitest';
import { rootsFor } from './scope.ts';
import { mounted } from './testing/fake-dom.ts';

describe('rootsFor', () => {
  it('matches a data-id holding a character the writer writes as a numeric reference', () => {
    // escAttr writes tab, LF and CR as `&#9;`, `&#10;` and `&#13;`; the DOM reads them back.
    const own = '<svg><g data-id="a&#9;b&#10;c&amp;d"></g></svg>';
    const other = '<svg><g data-id="x"></g></svg>';
    const { el, root } = mounted(own + other);
    const [first] = root.children;
    expect(rootsFor(el, own)).toEqual([first]);
  });
});
