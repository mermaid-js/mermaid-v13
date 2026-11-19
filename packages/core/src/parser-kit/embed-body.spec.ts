import { describe, expect, it } from 'vitest';
import { blockBody } from './embed-body.ts';

describe('blockBody (D633)', () => {
  it('removes the indentation common to the lines after the first', () => {
    const written = '\n    eventmodeling\n    data D\n    {\n      a: 1\n    }\n  ';
    const { text } = blockBody(written);
    expect(text).toBe('\neventmodeling\ndata D\n{\n  a: 1\n}\n');
  });

  it('maps every offset back to the body as written', () => {
    const written = '\n    sequenceDiagram\n      A->>B: hi\n  ';
    const body = blockBody(written);
    for (let at = 0; at < body.text.length; at++) {
      const ch = body.text[at];
      expect(written[body.outer(at)], `offset ${at}`).toBe(ch);
    }
    expect(body.outer(body.text.length)).toBe(written.length);
  });

  it('ignores blank lines for the indentation and keeps a body with none as written', () => {
    const written = '\n    flowchart LR\n\n  \n    A --> B';
    expect(blockBody(written).text).toBe('\nflowchart LR\n\n\nA --> B');
    const flat = '\nflowchart LR\nA --> B';
    const body = blockBody(flat);
    expect(body.text).toBe(flat);
    expect(body.outer(5)).toBe(5);
  });

  it('counts the first line, the line after the opener, like the others', () => {
    const written = '    %% c\n    pie\n      "a" : 1\n  ';
    const body = blockBody(written);
    expect(body.text).toBe('%% c\npie\n  "a" : 1\n');
    expect(written[body.outer(0)]).toBe('%');
  });

  it('counts tabs as indentation and handles CRLF', () => {
    expect(blockBody('\r\n\tpie\r\n\t"a" : 1\r\n').text).toBe('\r\npie\r\n"a" : 1\r\n');
  });
});
