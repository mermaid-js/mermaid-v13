/**
 * Test-only: reads back the SVG the renderer writes (the render spec, the ported v12 specs'
 * adapter). The writer's output is regular (attributes double-quoted, no comments, `<` and `&`
 * escaped in text), so a flat token scan is enough: no XML parser in the package.
 */

/** A start, end or empty tag, or character data. */
export type SvgToken =
  | {
      readonly kind: 'tag';
      readonly tag: string;
      readonly attrs: Readonly<Record<string, string>>;
      readonly closing: boolean;
      readonly empty: boolean;
    }
  | { readonly kind: 'text'; readonly text: string };

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Character data with the writer's escapes decoded. */
export const decode = (s: string): string =>
  s.replace(/&(#\d+|\w+);/g, (m, e: string) =>
    e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e] ?? m)
  );

/** The tags and character data of `svg`, in document order. */
export function* svgTokens(svg: string): Generator<SvgToken> {
  for (const [token] of svg.matchAll(/<[^>]*>|[^<]+/g)) {
    if (!token.startsWith('<')) {
      yield { kind: 'text', text: decode(token) };
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const p of token.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[p[1]!] = decode(p[2]!);
    yield {
      kind: 'tag',
      tag: /^<\/?([\w:]+)/.exec(token)![1]!,
      attrs,
      closing: token.startsWith('</'),
      empty: token.endsWith('/>'),
    };
  }
}

/** The attributes of every start or empty tag whose name matches `tag` (a regex alternation), with `tag`. */
export function elements(svg: string, tag: string): Record<string, string>[] {
  const name = new RegExp(`^(?:${tag})$`);
  const out: Record<string, string>[] = [];
  for (const t of svgTokens(svg))
    if (t.kind === 'tag' && !t.closing && name.test(t.tag)) out.push({ ...t.attrs, tag: t.tag });
  return out;
}

/** The inner markup of the first `<g class="cls" …>`. */
export function group(svg: string, cls: string): string {
  const open = new RegExp(`<g class="${cls}"[^>]*>`).exec(svg);
  if (!open) throw new Error(`no g.${cls}`);
  let depth = 1;
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = open.index + open[0].length;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return svg.slice(open.index + open[0].length, m.index);
  }
  throw new Error(`g.${cls} not closed`);
}
