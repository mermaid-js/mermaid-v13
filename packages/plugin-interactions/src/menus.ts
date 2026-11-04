/**
 * Element menus (R-PLUG-9, D105): the v12 sequence actor popup (`drawPopup`), rebuilt as DOM
 * the plugin owns. The svg never holds a menu, so core output stays inert (R-SEC-2).
 *
 * `postParse` folds every `menu` field (`AstMenu`) into one {@link MenuSpec} per target,
 * checking link URLs as flowchart links are checked (`checkUrl`, with the render's
 * `securityLevel` and `linkSchemes`). `afterMount` builds one menu per target and binds it to
 * the target's innermost `g[data-id]` groups (a sequence participant's top and bottom symbol,
 * a flowchart node): a click toggles it, and the menu opens below the first of them. With
 * `<diagram>.forceMenus` the menus are always shown and nothing is bound (v12 `forceMenus`).
 */
import type { AstMenu } from '@mermaid-js/core/parser-kit';
import { checkUrl, type UrlOptions } from '@mermaid-js/core/svg';

/** One part of a menu, in source order; `details` is read when the svg is mounted. */
type MenuPart =
  | { readonly links: readonly (readonly [string, string])[] }
  | { readonly properties: Readonly<Record<string, unknown>> }
  | { readonly details: string };

/** What `postParse` keeps of one target's menu statements. */
export interface MenuSpec {
  readonly target: string;
  readonly parts: MenuPart[];
}

/** The URL options of the render, without the warning sink (mount-time links warn nowhere). */
export type MenuUrls = Pick<UrlOptions, 'securityLevel' | 'linkSchemes'>;

function checkedLinks(links: unknown, urls: UrlOptions): [string, string][] {
  if (typeof links !== 'object' || links === null) return [];
  const out: [string, string][] = [];
  for (const [label, url] of Object.entries(links)) {
    if (typeof url !== 'string') {
      urls.warn?.({
        code: 'URL_REFUSED',
        message: `The menu link ${JSON.stringify(label.slice(0, 100))} was removed: its URL is not a string.`,
      });
      continue;
    }
    const href = checkUrl(url, urls);
    if (href !== undefined) out.push([label, href]);
  }
  return out;
}

/** Adds one `AstMenu` to the specs, by target, in source order. */
export function collectMenu(menu: AstMenu, specs: Map<string, MenuSpec>, urls: UrlOptions): void {
  let spec = specs.get(menu.target);
  if (!spec) specs.set(menu.target, (spec = { target: menu.target, parts: [] }));
  if (menu.links !== undefined) spec.parts.push({ links: checkedLinks(menu.links, urls) });
  if (menu.properties !== undefined) spec.parts.push({ properties: menu.properties });
  if (menu.details !== undefined) spec.parts.push({ details: menu.details });
}

interface Folded {
  links: Map<string, string>;
  properties: Record<string, unknown>;
}

/** v12 `insertLinks` / `insertProperties` / `addDetails`: later keys replace earlier ones. */
function fold(spec: MenuSpec, doc: Document, urls: MenuUrls): Folded {
  const out: Folded = { links: new Map(), properties: {} };
  const addLinks = (links: readonly (readonly [string, string])[]) => {
    for (const [label, href] of links) out.links.set(label, href);
  };
  for (const part of spec.parts) {
    if ('links' in part) addLinks(part.links);
    else if ('properties' in part) Object.assign(out.properties, part.properties);
    else {
      let details: { links?: unknown; properties?: unknown } | undefined;
      try {
        details = JSON.parse(doc.getElementById(part.details)?.textContent ?? '') as typeof details;
      } catch {
        continue; // v12 logged the parse error and went on
      }
      if (typeof details?.properties === 'object' && details.properties !== null)
        Object.assign(out.properties, details.properties);
      addLinks(checkedLinks(details?.links, urls));
    }
  }
  return out;
}

const RE_CLASS = /^-?[A-Za-z_][\w-]*$/;

/** `properties.class` as class names; anything that is not a plain class name is dropped. */
function extraClasses(properties: Record<string, unknown>): string[] {
  const value = properties.class;
  return typeof value === 'string' ? value.split(/\s+/).filter((c) => RE_CLASS.test(c)) : [];
}

function build(doc: Document, target: string, folded: Folded, width: number): HTMLElement {
  const menu = doc.createElement('div');
  menu.setAttribute('class', 'actorPopupMenu');
  menu.setAttribute('data-menu-for', target);
  Object.assign(menu.style, { position: 'absolute', zIndex: '1', display: 'none' });
  const panel = menu.appendChild(doc.createElement('div'));
  panel.setAttribute(
    'class',
    ['actorPopupMenuPanel', ...extraClasses(folded.properties)].join(' ')
  );
  Object.assign(panel.style, {
    minWidth: `${Math.max(0, Math.round(width))}px`,
    padding: '4px 0',
    background: 'Canvas',
    color: 'CanvasText',
    border: '1px solid GrayText',
    boxShadow: '0px 8px 16px 0px rgba(0,0,0,0.2)',
  });
  for (const [label, href] of folded.links) {
    const a = panel.appendChild(doc.createElement('a'));
    a.setAttribute('class', 'actor');
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    Object.assign(a.style, { display: 'block', padding: '6px 10px' });
    a.textContent = label;
  }
  return menu;
}

/**
 * Moves `menu` (shown) to just below `anchor`: it is measured at `0,0` first, so this holds
 * whatever its containing block is (a positioned host element, or the page).
 */
function place(menu: HTMLElement, anchor: Element): void {
  const box = anchor.getBoundingClientRect();
  menu.style.left = '0px';
  menu.style.top = '0px';
  const origin = menu.getBoundingClientRect();
  menu.style.left = `${box.left - origin.left}px`;
  menu.style.top = `${box.bottom - origin.top}px`;
}

/**
 * The groups a menu binds to: every `g[data-id=target]` with no such group inside it, or the
 * outermost `[data-id=target]` elements when the diagram draws no group for it.
 */
function anchorsOf(el: Element, targets: ReadonlySet<string>): Map<string, Element[]> {
  const found = new Map<string, Element[]>();
  for (const node of el.querySelectorAll('[data-id]')) {
    const id = node.getAttribute('data-id') ?? '';
    if (targets.has(id)) found.set(id, [...(found.get(id) ?? []), node]);
  }
  /** The members of `pool` that hold another member, up to `el`. */
  const holders = (pool: ReadonlySet<Element>) => {
    const out = new Set<Element>();
    for (const n of pool)
      for (let p = n.parentElement; p !== null && p !== el; p = p.parentElement)
        if (pool.has(p)) out.add(p);
    return out;
  };
  const inside = (n: Element, pool: ReadonlySet<Element>) => {
    for (let p = n.parentElement; p !== null && p !== el; p = p.parentElement)
      if (pool.has(p)) return true;
    return false;
  };
  const out = new Map<string, Element[]>();
  for (const [id, nodes] of found) {
    const groups = new Set(nodes.filter((n) => n.tagName.toLowerCase() === 'g'));
    if (groups.size > 0) {
      const covered = holders(groups);
      out.set(
        id,
        [...groups].filter((n) => !covered.has(n))
      );
    } else {
      const all = new Set(nodes);
      out.set(
        id,
        nodes.filter((n) => !inside(n, all))
      );
    }
  }
  return out;
}

/** Elements that already have a menu, across renders, so binding twice adds nothing. */
const bound = new WeakSet<Element>();

/** Builds and binds the menus of one render in `el` (the DOM adapter's mount element). */
export function bindMenus(
  el: Element,
  specs: readonly MenuSpec[],
  urls: MenuUrls,
  force: boolean
): void {
  const doc = el.ownerDocument;
  const anchors = anchorsOf(el, new Set(specs.map((s) => s.target)));
  for (const spec of specs) {
    const mine = (anchors.get(spec.target) ?? []).filter((a) => !bound.has(a));
    if (mine.length === 0) continue;
    const folded = fold(spec, doc, urls);
    if (folded.links.size === 0) continue; // v12 drew no popup without links
    const first = mine[0]!;
    const menu = build(doc, spec.target, folded, first.getBoundingClientRect().width);
    el.appendChild(menu);
    for (const a of mine) bound.add(a);
    if (force) {
      menu.style.display = 'block';
      place(menu, first);
      continue;
    }
    const toggle = () => {
      const show = menu.style.display === 'none';
      menu.style.display = show ? 'block' : 'none';
      if (show) place(menu, first);
    };
    for (const a of mine) {
      (a as HTMLElement).style.cursor = 'pointer';
      a.addEventListener('click', toggle, false);
    }
  }
}
