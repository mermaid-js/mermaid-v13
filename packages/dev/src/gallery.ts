/**
 * The theme gallery (R-TEST-6): every baseline fixture in every M1 theme on one static page.
 * Fixtures that pick their own theme are shown once. Diagrams are rendered in Node through the
 * same adapter the Playwright pages use, so the page needs no script and can be published as is.
 */
import { createTheme, isThemeName, loadTheme } from '@mermaid-js/core/theme';
import { renderDiagram } from './adapter.ts';
import { asHostText } from './host-text.ts';
import { M1_THEMES, setsTheme, type Fixture } from './fixtures.ts';

export interface GalleryOptions {
  /** Shown in the title; the alpha the gallery is published for. */
  readonly version: string;
  /**
   * The theme columns, in order. Default: every theme. A fixture that picks its own theme is
   * shown only when that theme is one of them.
   */
  readonly themes?: readonly string[];
}

export interface Gallery {
  readonly html: string;
  /** Diagrams on the page. */
  readonly count: number;
  /** Fixture paths that failed to render (shown on the page as errors). */
  readonly failures: string[];
}

/**
 * A figure's ground: the theme's own `background`, and `dark` (light caption) when the spec is a
 * dark theme, so a dark theme's light text is not shown on white (#236).
 */
async function ground(theme: string): Promise<string> {
  if (!isThemeName(theme)) return '';
  const spec = await loadTheme(theme);
  const background = createTheme(spec, { cssVariables: false }).color('background');
  return `${spec.dark ? ' class="dark"' : ''} style="background:${esc(background)}"`;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE = `
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafafa;color:#222}
header{padding:16px 24px;background:#fff;border-bottom:1px solid #ddd;position:sticky;top:0;z-index:1}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:32px 24px 8px}
nav a{margin-right:12px}
.row{margin:0 24px 16px;background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 12px}
.row h3{font:600 13px ui-monospace,monospace;margin:0 0 8px}
.cells{display:flex;flex-wrap:wrap;gap:8px}
figure{margin:0;border:1px solid #eee;border-radius:4px;padding:8px;background:#fff;max-width:100%}
figure.dark{background:#1e1e1e;color:#ddd}
figcaption{font-size:12px;color:#888;margin-bottom:4px}
figure svg{max-width:420px;height:auto}
.error{color:#b00}
pre{font-size:12px;overflow:auto}
`;

/** The theme a fixture picks in its front matter (`own` when it can't be read). */
const ownTheme = (source: string): string => /^\s*theme:\s*([\w-]+)/m.exec(source)?.[1] ?? 'own';

export async function buildGallery(
  fixtures: readonly Fixture[],
  options: GalleryOptions
): Promise<Gallery> {
  const columns = options.themes ?? M1_THEMES;
  const failures: string[] = [];
  const groups = new Map<string, string[]>();
  let count = 0;

  for (const fixture of fixtures) {
    const own = setsTheme(fixture.source);
    if (own && options.themes && !options.themes.includes(ownTheme(fixture.source))) continue;
    const themes: (string | undefined)[] = own ? [undefined] : [...columns];
    const cells: string[] = [];
    let failed = false;
    for (const theme of themes) {
      const idPrefix = `g${count + cells.length}`;
      try {
        const { svg } = await renderDiagram(asHostText(fixture.source), {
          config: theme ? { theme } : undefined,
          idPrefix,
        });
        const shown = theme ?? ownTheme(fixture.source);
        cells.push(
          `<figure data-theme="${esc(shown)}"${await ground(shown)}><figcaption>${esc(shown)}</figcaption>${svg}</figure>`
        );
      } catch (error) {
        failed = true;
        cells.push(
          `<figure class="error">${esc(error instanceof Error ? error.message : String(error))}</figure>`
        );
      }
    }
    if (failed) failures.push(fixture.path);
    count += cells.length;
    // The fixture's folder: `flowchart/shapes`, `er-diagram`.
    const group = fixture.path.includes('/')
      ? fixture.path.slice(0, fixture.path.lastIndexOf('/'))
      : 'other';
    const row =
      `<section class="row" id="${esc(fixture.path)}"><h3>${esc(fixture.path)}</h3>` +
      `<div class="cells">${cells.join('')}</div>` +
      `<details><summary>source</summary><pre>${esc(fixture.source)}</pre></details></section>`;
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }

  const shownFixtures = [...groups.values()].reduce((n, rows) => n + rows.length, 0);
  const nav = [...groups.keys()].map((g) => `<a href="#group-${esc(g)}">${esc(g)}</a>`).join('');
  const body = [...groups]
    .map(([g, rows]) => `<h2 id="group-${esc(g)}">${esc(g)}</h2>${rows.join('')}`)
    .join('');
  const title = `Mermaid ${esc(options.version)} theme gallery`;
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<style>${STYLE}</style></head><body><header><h1>${title}</h1>` +
    `<p>${shownFixtures} fixtures × themes ${columns.map(esc).join(', ')} = ${count} diagrams.</p>` +
    `<nav>${nav}</nav></header>${body}</body></html>\n`;
  return { html, count, failures };
}
