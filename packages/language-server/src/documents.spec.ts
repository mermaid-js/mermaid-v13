/**
 * The parts of a held document in process (D581): `analyse` splits a Markdown document into
 * its fence bodies, and `partAt` maps a document offset to a part and the offset inside it.
 * The scripted client covers the same mapping end to end in `markdown.spec.ts`.
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyse, forget, partAt } from './documents.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

const BODY = 'flowchart LR\n  A --> B\n';
const CLOSED = ['# Title', '', '```mermaid', BODY + '```', 'prose'].join('\n');
const UNCLOSED = ['```mermaid', BODY].join('\n');

describe('partAt', () => {
  it('maps a whole Mermaid document to its one part, the end included', () => {
    const open = analyse(service, 'file:///a.mmd', BODY, 1, false);
    expect(open.parts.map((p) => p.key)).toEqual(['file:///a.mmd']);
    expect(partAt(open, 0)).toMatchObject({ offset: 0 });
    expect(partAt(open, BODY.length)).toMatchObject({ offset: BODY.length });
    expect(partAt(open, BODY.length + 1)).toBeUndefined();
  });

  it('maps a fence body and leaves the prose and the closing fence outside', () => {
    const open = analyse(service, 'file:///a.md', CLOSED, 1, true);
    const start = CLOSED.indexOf('flowchart');
    expect(open.parts.map((p) => [p.key, p.start, p.line])).toEqual([
      ['file:///a.md#mermaid-fence-0', start, 3],
    ]);
    expect(partAt(open, 0)).toBeUndefined();
    expect(partAt(open, start)).toMatchObject({ offset: 0 });
    expect(partAt(open, start + BODY.length - 1)).toMatchObject({ offset: BODY.length - 1 });
    // The closing fence's line starts where the body ends.
    expect(partAt(open, start + BODY.length)).toBeUndefined();
    expect(partAt(open, CLOSED.length)).toBeUndefined();
  });

  it('holds the end of the text in a fence that is never closed', () => {
    const open = analyse(service, 'file:///b.md', UNCLOSED, 1, true);
    expect(partAt(open, UNCLOSED.length)).toMatchObject({
      offset: UNCLOSED.length - open.parts[0]!.start,
    });
  });

  it('closes the parts of fences that are gone', () => {
    const before = analyse(service, 'file:///c.md', CLOSED, 1, true);
    const after = analyse(service, 'file:///c.md', '# no fence\n', 2, true, before);
    expect(after.parts).toEqual([]);
    forget(service, after);
    expect(partAt(after, 0)).toBeUndefined();
  });
});
