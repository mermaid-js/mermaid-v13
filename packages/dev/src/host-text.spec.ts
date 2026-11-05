import { describe, expect, it } from 'vitest';
import { asHostText } from './host-text.ts';

describe('asHostText', () => {
  it("decodes HTML entities as v12's e2e page did, and leaves the rest as written", () => {
    expect(asHostText('  &lt;&lt;interface&gt;&gt; A')).toBe('  <<interface>> A');
    expect(asHostText('a &amp;&quot;&#65;&#x42;')).toBe('a &"AB');
    expect(asHostText('A -- x:#y; --> B &unknown; &#0;')).toBe('A -- x:#y; --> B &unknown; &#0;');
  });
});
