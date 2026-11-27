// The kanban renderer (spec #424 T4) through the plugin's own seam: parsed sources laid out and
// drawn with core's render context (`renderKanbanForTest`). Structure and classes, the column
// colours (D374) and card colours, the priority bar and its warning (D375), ticket links
// (D377), the `w.outline` hook (D379) and the root. The corpus properties are
// `conformance/src/kanban/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw } from '@mermaid-js/core/svg';
import { createTheme, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import { kanban } from '../plugin.ts';
import { renderKanbanForTest } from './harness.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => (e.class ?? '').split(' ').includes(cls));

const BOARD = `kanban
  todo[Todo]
  :::urgent
    a[Card a]
    :::m-4 p<8>
    b[Card b]@{ ticket: MC-1, assigned: knsv, priority: 'High' }
  doing
  done[Done]
    c[Card c]
`;

describe('structure (spec #424 Renderer)', () => {
  it('draws g.sections > g.cluster.section-<k>, then g.items > g.node, each with data-id and data-ast', async () => {
    const { svg, model } = await renderKanbanForTest(BOARD);
    expect(svg.indexOf('class="sections"')).toBeLessThan(svg.indexOf('class="items"'));
    const columns = byClass(svg, 'g', 'cluster');
    expect(columns.map((c) => c.class)).toEqual([
      'cluster section-1 urgent',
      'cluster section-2',
      'cluster section-3',
    ]);
    expect(columns.map((c) => c['data-ast'])).toEqual(['n:todo', 'n:doing', 'n:done']);
    const cards = byClass(svg, 'g', 'node');
    expect(cards.map((c) => c.class)).toEqual(['node m-4 p8', 'node', 'node']);
    expect(cards.map((c) => c['data-ast'])).toEqual(['n:a', 'n:b', 'n:c']);
    expect([...columns, ...cards].every((e) => e['data-id'] === e['data-ast'])).toBe(true);
    // One data-ast per item, nothing else carries one.
    expect(elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined)).toHaveLength(
      model.items.length
    );
    // v12's element ids, `undefined` class, `__APA__`, `data-look` and `xlink:href` are gone.
    expect(svg).not.toMatch(/\sid="|undefined|__APA__|data-look|xlink:/);
    expect(svg).toMatch(
      /<svg [^>]*class="mermaid mermaid-kanban"[^>]*aria-roledescription="kanban"/
    );
  });

  it('puts the column rect and title in the cluster, and the card rect, bar and labels in the node', async () => {
    const { svg } = await renderKanbanForTest(BOARD);
    const todo = /<g class="cluster section-1 urgent"[^>]*>(.*?)<\/g><g class="cluster/.exec(
      svg
    )![1]!;
    expect(todo).toMatch(
      /^<rect [^>]*\/><g class="cluster-label"[^>]*><text[^>]*>Todo<\/text><\/g>$/
    );
    const b = /<g class="node" data-id="n:b"[^>]*>(.*?)<\/g><g class="node"/.exec(svg)![1]!;
    expect([...b.matchAll(/<(rect|line|a|g)\b/g)].map((m) => m[1])).toEqual([
      'rect',
      'line',
      'g',
      'g',
      'g',
    ]);
    expect(b).toMatch(/^<rect class="basic label-container"/);
    expect([...b.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])).toEqual([
      'Card b',
      'MC-1',
      'knsv',
    ]);
  });

  it('left-aligns the title and ticket, and right-aligns the assignee at the right inset 10', async () => {
    const { svg, layout } = await renderKanbanForTest(BOARD);
    const card = layout.cards.find((c) => c.ast === 'n:b')!;
    const node = /<g class="node" data-id="n:b"[^>]*>(.*?)<\/g><g class="node"/.exec(svg)![1]!;
    const texts = elements(node, 'text');
    expect(texts.map((t) => t['text-anchor'])).toEqual(['start', 'start', 'end']);
    expect(Number(texts[0]!.x)).toBeCloseTo(card.x + 10);
    expect(Number(texts[1]!.x)).toBeCloseTo(card.x + 10);
    expect(Number(texts[2]!.x)).toBeCloseTo(card.x + card.width - 10);
  });

  it('ends every line of a wrapped assignee at the right inset', async () => {
    const { svg, layout } = await renderKanbanForTest(
      "kanban\n  a[Todo]\n    x[Card]@{ assigned: 'a very long assignee name that wraps' }"
    );
    const card = layout.cards[0]!;
    const lines = card.assignee!.text.lines.length;
    expect(lines).toBeGreaterThan(1);
    const label = /<text text-anchor="end" xml:space="preserve">(.*?)<\/text>/.exec(svg)![1]!;
    const xs = elements(label, 'tspan').map((t) => Number(t.x));
    expect(xs).toHaveLength(lines);
    for (const x of xs) expect(x).toBeCloseTo(card.x + card.width - 10);
  });

  it('draws an assignee that does not fit beside the ticket on the row below it (D647)', async () => {
    const { svg, layout } = await renderKanbanForTest(
      "kanban\n  a[Todo]\n    x[Card]@{ ticket: 'MC-12345678901234', assigned: 'Dana Whitfield-Okafor' }"
    );
    const card = layout.cards[0]!;
    const [ticket, assignee] = elements(svg, 'text').slice(-2);
    expect(assignee!['text-anchor']).toBe('end');
    expect(Number(assignee!.x)).toBeCloseTo(card.x + card.width - 10);
    // One line each: the assignee's baseline is a line under the ticket's, inside the card.
    expect(Number(assignee!.y) - Number(ticket!.y)).toBeCloseTo(card.ticket!.height);
    expect(Number(assignee!.y)).toBeLessThan(card.y + card.height);
  });

  it('draws an empty board as an empty svg with the 8 px margin box', async () => {
    const { svg } = await renderKanbanForTest('kanban\n');
    expect(svg).toMatch(/viewBox="-8 -8 16 16"/);
    expect(svg).not.toMatch(/<g /);
  });

  it('honours kanban.useMaxWidth (D378)', async () => {
    const wide = await renderKanbanForTest(BOARD);
    expect(wide.svg).toMatch(/<svg [^>]*width="100%"[^>]*style="max-width:/);
    const fixed = await renderKanbanForTest(BOARD, { config: { kanban: { useMaxWidth: false } } });
    expect(fixed.svg).toMatch(/<svg [^>]*width="\d+" height="\d+"/);
  });

  it("uses the layout's bounds as the viewBox (D224)", async () => {
    const { svg, layout } = await renderKanbanForTest(BOARD);
    const { x, y, width, height } = layout.bounds;
    expect(svg).toContain(`viewBox="${x} ${y} ${Math.ceil(width)} ${Math.ceil(height)}"`);
  });

  it('draws in the font the layout measured in (pitfall 16)', async () => {
    const { svg, layout } = await renderKanbanForTest(BOARD, {
      config: { theme: 'default', themeVariables: { fontFamily: 'Courier', fontSize: '20px' } },
    });
    expect(layout.font).toMatchObject({ family: 'Courier', size: 20 });
    expect(svg).toMatch(/<svg [^>]*font-family="var\(--_ff\)" font-size="var\(--_fs\)"/);
    expect(svg).toMatch(/--_ff:var\(--mermaid-fontFamily,Courier\)/);
    expect(svg).toMatch(/--_fs:var\(--mermaid-fontSize,20px\)/);
  });
});

describe('colours (v12 styles.ts, D374)', () => {
  /** khroma: lighten(#ff0000, 10) is hsl(0, 100%, 60%), darken(#ff0000, 10) hsl(0, 100%, 40%). */
  const RED = '#ff0000';
  const LIGHTER = '#ff3333';
  const DARKER = '#cc0000';

  const column = async (theme: ThemeName, themeVariables: Record<string, unknown> = {}) =>
    createTheme(await loadTheme(theme), { diagram: kanban.theme, themeVariables }).value(
      'kanbanColumn2'
    );

  it('lightens cScale<n> by 10 in a light theme, and darkens it under the dark trait', async () => {
    expect(await column('default', { cScale2: RED })).toBe(LIGHTER);
    expect(await column('neo', { cScale2: RED })).toBe(LIGHTER);
    expect(await column('redux', { cScale2: RED })).toBe(LIGHTER);
    expect(await column('dark', { cScale2: RED })).toBe(DARKER);
    // neo-dark, which v12 left light (D183), darkens: the trait, not the name.
    expect(await column('neo-dark', { cScale2: RED })).toBe(DARKER);
    expect(await column('default', { cScale2: RED, darkMode: true })).toBe(DARKER);
  });

  it("gives column k slot (k + 1) mod 12, so the eleventh and later columns aren't black", async () => {
    const cols = Array.from({ length: 15 }, (_, k) => `  c${k + 1}`).join('\n');
    const { svg } = await renderKanbanForTest(`kanban\n${cols}\n`, {
      config: { theme: 'default' },
    });
    expect(elements(svg, 'rect').map((r) => r.fill)).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4].map((n) => `var(--_kbc${n})`)
    );
    for (const n of [0, 1, 11])
      expect(svg).toMatch(new RegExp(`--_kbc${n}:var\\(--mermaid-kanbanColumn${n},hsl\\(from #`));
    expect(svg).not.toMatch(/#000000|black/);
  });

  it('recolours columns from a cScale override, fill and stroke alike', async () => {
    const { svg } = await renderKanbanForTest('kanban\n  todo\n', {
      config: { theme: 'default', themeVariables: { cScale2: RED } },
    });
    const rect = elements(svg, 'rect')[0]!;
    expect([rect.fill, rect.stroke]).toEqual(['var(--_kbc2)', 'var(--_kbc2)']);
    expect(svg).toContain(
      '--_kbc2:var(--mermaid-kanbanColumn2,hsl(from #ff0000 h s clamp(0, l + 10, 100)'
    );
  });

  it('paints cards in background and nodeBorder, 1 px, and every label in textColor', async () => {
    const { svg } = await renderKanbanForTest(BOARD, {
      config: {
        theme: 'default',
        themeVariables: { background: '#101010', nodeBorder: '#202020', textColor: '#303030' },
      },
    });
    const card = byClass(svg, 'rect', 'label-container')[0]!;
    expect([card.fill, card.stroke, card['stroke-width'], card.rx]).toEqual([
      'var(--_bg)',
      'var(--_nb)',
      '1',
      '5',
    ]);
    expect(svg).toContain('--_bg:var(--mermaid-background,#101010)');
    expect(svg).toContain('--_nb:var(--mermaid-nodeBorder,#202020)');
    expect(svg).toContain('--_tx:var(--mermaid-textColor,#303030)');
    const labels = [...byClass(svg, 'g', 'label'), ...byClass(svg, 'g', 'cluster-label')];
    // Three column titles, three card titles, a ticket and an assignee.
    expect(labels).toHaveLength(8);
    expect(new Set(labels.map((l) => l.fill))).toEqual(new Set(['var(--_tx)']));
  });

  it('draws no gradient and no shadow in any family (D227)', async () => {
    for (const theme of ['default', 'redux', 'neo', 'neo-dark']) {
      const { svg } = await renderKanbanForTest(BOARD, { config: { theme } });
      expect(svg, theme).not.toMatch(/gradient|filter=/);
    }
  });
});

describe('priority (D375)', () => {
  const src = (...p: string[]) =>
    `kanban\n  todo\n${p.map((v, i) => `    c${i}@{ priority: ${v} }`).join('\n')}\n`;

  it("draws v12's bar colours for the four values, matched exactly, and no bar otherwise", async () => {
    const { svg } = await renderKanbanForTest(
      src("'Very High'", 'High', 'Low', "'Very Low'", 'Medium', 'high', '1')
    );
    expect(elements(svg, 'line').map((l) => [l.stroke, l['stroke-width']])).toEqual([
      ['red', '4'],
      ['orange', '4'],
      ['blue', '4'],
      ['lightblue', '4'],
    ]);
  });

  it('warns KANBAN_PRIORITY once per render, naming each value that is none of the five', async () => {
    const { warnings } = await renderKanbanForTest(
      src('Medium', 'high', 'Urgent', 'high', '1', '[1, 2]', 'true', 'High')
    );
    const w = warnings.filter((x) => x.code === 'KANBAN_PRIORITY');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain('"high", "Urgent", "1", "[1, 2]", "true"');
    expect(w[0]!.message).not.toMatch(/"Medium"|"High"/);
    expect(w[0]!.astIds).toEqual(['n:c1', 'n:c3', 'n:c2', 'n:c4', 'n:c5', 'n:c6']);
  });

  it('says nothing when every priority is one of the five, or when it is set on a column (D376)', async () => {
    const ok = await renderKanbanForTest(src("'Very High'", 'Medium', "'Very Low'"));
    expect(ok.warnings).toEqual([]);
    const column = await renderKanbanForTest('kanban\n  todo@{ priority: urgent }\n');
    expect(column.warnings).toEqual([]);
  });

  it('never takes a non-string value for one of the four, whatever its text', async () => {
    const { svg, warnings } = await renderKanbanForTest(src('[High]'));
    expect(elements(svg, 'line')).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(['KANBAN_PRIORITY']);
  });
});

describe('label markup (D710, D712)', () => {
  /** The `<text>` of the label group of `ast`'s first `<text>` after its `data-ast`. */
  const textOf = (svg: string, ast: string): string => {
    const at = svg.indexOf(`data-ast="${ast}"`);
    return /<text[^>]*>(.*?)<\/text>/.exec(svg.slice(at))![1]!;
  };

  it('draws plain card text as written and only markdown strings as markdown (#1230)', async () => {
    const { svg } = await renderKanbanForTest(
      'kanban\n  todo[Todo]\n    a[Use `npm ci` first]\n    b[- not a list]\n    c["`**bold** card`"]\n    d[1. not a list]\n    e[**stars**]\n'
    );
    expect(textOf(svg, 'n:a')).toContain('Use `npm ci` first');
    expect(textOf(svg, 'n:b')).toContain('- not a list');
    expect(textOf(svg, 'n:c')).toMatch(/font-weight="bold"[^>]*>bold<\/tspan><tspan[^>]*> card</);
    expect(textOf(svg, 'n:d')).toContain('1. not a list');
    expect(textOf(svg, 'n:e')).toContain('**stars**');
  });

  it('draws two code spans as written: the label is not one markdown string', async () => {
    const { svg } = await renderKanbanForTest('kanban\n  todo[Todo]\n    a[`npm` or `pnpm`]\n');
    expect(textOf(svg, 'n:a')).toContain('`npm` or `pnpm`');
  });

  it('draws <br>, the tags and entities in plain labels of every kind', async () => {
    const { svg } = await renderKanbanForTest(
      "kanban\n  todo[To<br>do]\n    a[<b>bold</b> &amp; <i>it</i>]@{ ticket: '<u>T</u>', assigned: '`**md**`' }\n"
    );
    expect(textOf(svg, 'n:todo').match(/<tspan[^>]* x=/g)).toHaveLength(2);
    const card = svg.slice(svg.indexOf('data-ast="n:a"'));
    expect(card).toMatch(/font-weight="bold"[^>]*>bold<\/tspan><tspan[^>]*> &amp; <\/tspan>/);
    expect(card).toMatch(/font-style="italic"[^>]*>it</);
    expect(card).toMatch(/text-decoration="underline"[^>]*>T</);
    expect(card).toMatch(/font-weight="bold"[^>]*>md</);
    expect(card).not.toContain('**md**');
  });

  it('draws a ticket in <b> bold and an assignee in <i> italic, without their tags', async () => {
    const { svg } = await renderKanbanForTest(
      "kanban\n  todo[Todo]\n    a[Card]@{ ticket: '<b>T-1</b>', assigned: '<i>knsv</i>' }\n"
    );
    const [ticket, assignee] = svg
      .slice(svg.indexOf('data-ast="n:a"'))
      .match(/<text[^>]*>.*?<\/text>/g)!
      .slice(-2);
    expect(ticket).toMatch(/<tspan[^>]*font-weight="bold"[^>]*>T-1<\/tspan>/);
    expect(assignee).toMatch(/<tspan[^>]*font-style="italic"[^>]*>knsv<\/tspan>/);
    expect(svg).not.toMatch(/&lt;\/?[bi]&gt;/);
  });

  it('reads a column title by the same rule', async () => {
    const { svg } = await renderKanbanForTest('kanban\n  a["`**md**`"]\n  b[**plain**]\n');
    expect(textOf(svg, 'n:a')).toMatch(/font-weight="bold"[^>]*>md</);
    expect(textOf(svg, 'n:b')).toContain('**plain**');
  });
});

describe('ticket links (D377)', () => {
  const board = (base: string | undefined, ticket: string) =>
    `${base === undefined ? '' : `---\nconfig:\n  kanban:\n    ticketBaseUrl: '${base}'\n---\n`}kanban\n  todo\n    a@{ ticket: '${ticket}' }\n`;
  const links = (svg: string) => elements(svg, 'a');
  const refused = (warnings: readonly { code: string }[]) =>
    warnings.filter((w) => w.code === 'URL_REFUSED').length;

  it('links the ticket: the first #TICKET# replaced, href, target _blank, rel, underlined', async () => {
    const { svg, warnings } = await renderKanbanForTest(
      board('https://example.com/browse/#TICKET#?from=#TICKET#', 'MC-1')
    );
    expect(links(svg)).toEqual([
      {
        class: 'kanban-ticket-link',
        href: 'https://example.com/browse/MC-1?from=#TICKET#',
        target: '_blank',
        'text-decoration': 'underline',
        rel: 'noopener noreferrer',
      },
    ]);
    expect(svg).toMatch(/<a [^>]*><g class="label"[^>]*><text[^>]*>MC-1<\/text><\/g><\/a>/);
    expect(refused(warnings)).toBe(0);
  });

  it('links a ticket with drawn tags by its text without them (D712)', async () => {
    const { svg } = await renderKanbanForTest(
      board('https://example.com/browse/#TICKET#', '<b>T-1</b>')
    );
    expect(links(svg)[0]!.href).toBe('https://example.com/browse/T-1');
    const mixed = await renderKanbanForTest(
      board('https://example.com/#TICKET#', '<U>T</U>-<sub>1</sub><Strike>2</Strike>')
    );
    expect(links(mixed.svg)[0]!.href).toBe('https://example.com/T-12');
    expect(svg).toMatch(/<a [^>]*><g class="label"[^>]*><text[^>]*><tspan[^>]*font-weight="bold"/);
  });

  it('keeps $& and $` in a ticket literal (a function replacer)', async () => {
    const { svg } = await renderKanbanForTest(board('https://example.com/#TICKET#', 'a$&b$`c'));
    expect(links(svg)[0]!.href).toBe('https://example.com/a$&amp;b$`c');
  });

  it('draws the ticket as plain text with URL_REFUSED under a javascript: base URL', async () => {
    const { svg, warnings } = await renderKanbanForTest(
      board('javascript:alert(1)//#TICKET#', 'MC-1')
    );
    expect(links(svg)).toEqual([]);
    expect(svg).toMatch(/<g class="label"[^>]*><text[^>]*>MC-1<\/text><\/g>/);
    expect(refused(warnings)).toBe(1);
  });

  it('refuses a javascript: ticket under a base URL of #TICKET# alone', async () => {
    const { svg, warnings } = await renderKanbanForTest(board('#TICKET#', 'javascript:alert(1)'));
    expect(links(svg)).toEqual([]);
    expect(svg).toContain('javascript:alert(1)</text>');
    expect(refused(warnings)).toBe(1);
    // A plain ticket under `#TICKET#` alone is a relative link, as in v12.
    const plain = await renderKanbanForTest(board('#TICKET#', 'MC-1'));
    expect(links(plain.svg)[0]!.href).toBe('MC-1');
  });

  it('refuses a scheme hidden by an entity or a percent escape in the ticket', async () => {
    // v12's entity placeholders turn `#106;` into `&#106;` (a `j`).
    for (const t of ['#106;avascript:alert(1)', 'java%73cript:alert(1)']) {
      const { svg, warnings } = await renderKanbanForTest(board('#TICKET#', t));
      expect(links(svg), t).toEqual([]);
      expect(refused(warnings), t).toBe(1);
    }
  });

  it('follows securityLevel and the integrator link schemes', async () => {
    const src = board('https://example.com/#TICKET#', 'MC-1');
    const strict = await renderKanbanForTest(src, { securityLevel: 'strict' });
    expect(links(strict.svg)).toEqual([]);
    expect(refused(strict.warnings)).toBe(1);
    const jira = board('jira://browse/#TICKET#', 'MC-1');
    expect(links((await renderKanbanForTest(jira)).svg)).toEqual([]);
    const allowed = await renderKanbanForTest(jira, { linkSchemes: ['jira'] });
    expect(links(allowed.svg)[0]!.href).toBe('jira://browse/MC-1');
  });

  it('writes no link without a ticketBaseUrl, and none for a card without a ticket', async () => {
    const plain = await renderKanbanForTest(board(undefined, 'MC-1'));
    expect(links(plain.svg)).toEqual([]);
    expect(plain.svg).toContain('MC-1</text>');
    const none = await renderKanbanForTest(
      "---\nconfig:\n  kanban:\n    ticketBaseUrl: 'https://x.org/#TICKET#'\n---\nkanban\n  todo\n    a\n"
    );
    expect(links(none.svg)).toEqual([]);
    expect(none.warnings).toEqual([]);
  });
});

describe('the w.outline hook (D379)', () => {
  it('draws columns as groups and cards as nodes through it, with their paint; the bar stays', async () => {
    const calls: { role: string; tag: string; attrs: Attrs }[] = [];
    const record: OutlineDraw = (role, tag, attrs) => {
      calls.push({ role, tag, attrs });
      return false;
    };
    const plain = await renderKanbanForTest(BOARD);
    const r = await renderKanbanForTest(BOARD, { outline: record });
    // A drawer that declines leaves the output byte-identical.
    expect(r.svg).toBe(plain.svg);
    expect(calls.map((c) => `${c.role} ${c.tag}`)).toEqual([
      'group rect',
      'group rect',
      'group rect',
      'node rect',
      'node rect',
      'node rect',
    ]);
    expect(calls.every((c) => c.attrs.fill !== undefined && c.attrs.stroke !== undefined)).toBe(
      true
    );
    // A drawer that sketches every outline: the priority bar is still drawn (v12 dropped it).
    const sketch: OutlineDraw = (_role, _tag, _attrs, sink) => {
      sink.leaf('path', { class: 'sketch', d: sink.path().moveTo(0, 0).done() });
      return true;
    };
    const drawn = await renderKanbanForTest(BOARD, { outline: sketch });
    expect(byClass(drawn.svg, 'path', 'sketch')).toHaveLength(6);
    expect(elements(drawn.svg, 'rect')).toEqual([]);
    expect(elements(drawn.svg, 'line').map((l) => l.stroke)).toEqual(['orange']);
  });
});
