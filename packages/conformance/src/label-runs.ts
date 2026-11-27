/**
 * The labels an SVG draws, each `<text>` as one string, for the label-syntax specs (#1368): its
 * runs in order, a run written `[b:…]`, `[i:…]`, `[m:…]` or `[s:…]` (or several letters) when
 * bold, italic, monospace or smaller (a subscript or superscript), and ` / ` where a new line
 * starts.
 */
export function drawnLabels(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(([, inner = '']) => {
    if (!inner.includes('<tspan')) return inner;
    let out = '';
    let first = true;
    for (const [, attrs = '', text = ''] of inner.matchAll(/<tspan([^>]*)>(.*?)<\/tspan>/g)) {
      const marks = [
        attrs.includes('font-weight') ? 'b' : '',
        attrs.includes('font-style="italic"') ? 'i' : '',
        attrs.includes('font-family') ? 'm' : '',
        attrs.includes('font-size') ? 's' : '',
      ].join('');
      if (!first && /\bx=/.test(attrs)) out += ' / ';
      first = false;
      out += marks ? `[${marks}:${text}]` : text;
    }
    return out;
  });
}

/** The {@link drawnLabels} whose text starts with `kind`, after a mark or a backtick. */
export function labelsOf(svg: string, kind: string): string[] {
  return drawnLabels(svg).filter((l) =>
    l
      .replace(/^\[[a-z]+:/, '')
      .replace(/^`/, '')
      .startsWith(kind)
  );
}
