/**
 * The text rewrites the jison-port lexers share: `lexerText` for a `crlf: 'keep'` lexer's
 * `prepare`, and `entityPlaceholders`, its entity step alone.
 */
import { describe, expect, it } from 'vitest';
import { entityPlaceholders, lexerText } from './state-lexer.ts';

describe('entityPlaceholders', () => {
  it('writes each `#name;` as `ﬂ`, the name and `¶`, of the same length', () => {
    expect(entityPlaceholders('a #quot;b#quot; #35; c')).toBe('a ﬂquot¶bﬂquot¶ ﬂ35¶ c');
  });

  it('leaves a `#` that starts no entity, and line breaks, as they are', () => {
    expect(entityPlaceholders('fill:#f00; # x;\r\n#;')).toBe('fill:ﬂf00¶ # x;\r\n#;');
    expect(entityPlaceholders('#a b; #a\n;')).toBe('#a b; #a\n;');
  });
});

describe('lexerText', () => {
  it('turns each CR into an LF, one for one: a CRLF is two LFs, a lone CR one', () => {
    expect(lexerText('a\r\nb\rc\nd\r')).toBe('a\n\nb\nc\nd\n');
    expect(lexerText('\r\r\n\n\r')).toBe('\n\n\n\n\n');
  });

  it('writes the entity placeholders too', () => {
    expect(lexerText('A: #lt;b#gt;\r\nB: #9829;')).toBe('A: ﬂlt¶bﬂgt¶\n\nB: ﬂ9829¶');
  });

  it('keeps the length, and text with nothing to rewrite', () => {
    for (const text of ['', 'sequenceDiagram\nA->>B: hi', 'a\r\n#amp;\r#;']) {
      expect(lexerText(text)).toHaveLength(text.length);
    }
    expect(lexerText('sequenceDiagram\nA->>B: hi')).toBe('sequenceDiagram\nA->>B: hi');
  });
});
