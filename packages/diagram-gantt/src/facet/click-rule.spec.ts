import { describe, expect, it } from 'vitest';
import type { HoverTarget } from '@mermaid-js/core/parser-kit';
import { ganttLanguage } from '../language.ts';

/**
 * One click rule (final review, #379): a `click` names the latest task with each id written
 * before it (v12's parse-time `setClass`/`setLink`); naming none, it does nothing. The facet's
 * symbols, hover and completion follow it; `after`/`until` keep the schedule's last-wins.
 */
const CURSOR = '¦';
const split = (marked: string): [string, number] => {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
};

function symbols(text: string): string[] {
  return ganttLanguage
    .parse(text, { keepTokens: true })
    .symbols.map((s) => `${s.role} ${s.name} ${text.slice(0, s.range.start).split('\n').length}`);
}

function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = ganttLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const t = result.tokens!;
  // As the service picks it: the token containing the offset, else one ending at it.
  let token: HoverTarget['token'];
  for (let i = 0; i < t.length; i++) {
    const [start, end] = [t.start[i]!, t.end[i]!];
    if (end === start || start > at || at > end) continue;
    if (!token || at < end) token = { kind: t.kind[i]!, range: { start, end } };
  }
  const target: HoverTarget = {
    offset: at,
    ...(token ? { token } : {}),
    ...(symbol ? { symbol } : {}),
  };
  return ganttLanguage.hover(target, { text, result })?.contents;
}

function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = ganttLanguage.parse(text, { keepTokens: true, probe: at });
  return ganttLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

const SRC =
  'gantt\nclick a href "u"\na :a, 2024-01-01, 3d\nb one :b, 2024-01-02, 3d\nclick b href "u"\n' +
  'b two :b, 2024-01-05, 3d\n';

describe('the click rule in the facet', () => {
  it('records no reference for a click whose id no earlier task has', () => {
    // Line 2's `a` names no task before it; line 5's `b` does.
    expect(symbols(SRC)).toEqual(['def a 3', 'ref b 4', 'ref b 5', 'def b 6']);
  });

  it('hovers a click id with the task it names: the latest one before the click', () => {
    expect(hover(SRC.replace('click b', 'click ¦b'))).toContain('Task: `b one`');
    expect(hover(SRC.replace('click a', 'click ¦a'))).toContain(
      'No task with this id is written before'
    );
  });

  it('completes a click with the ids written before it only', () => {
    expect(complete('gantt\na :a1, 2024-01-01, 1d\nclick ¦\nb :b1, 2024-01-01, 1d\n')).toEqual([
      'a1',
    ]);
  });
});
