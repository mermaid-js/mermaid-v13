// cspell:ignore Vjacheslav Trushkin
/**
 * Icon lookup in an Iconify JSON pack (D290, D295): icons, alias chains, pack and icon
 * dimensions, and the rotation and flips folded into one transform.
 *
 * Ported from Iconify's utilities (https://github.com/iconify/iconify, `@iconify/utils` 3.1.7,
 * MIT License, Copyright (c) 2021-PRESENT Vjacheslav Trushkin): `getIconData`, `getIconsTree`,
 * `mergeIconData` and `mergeIconTransformations` (`lib/icon-set/`, `lib/icon/`), and the box and
 * transform part of `iconToSVG` (`lib/svg/build.js`). Unlike the original, names are looked up
 * as own properties only, so `__proto__` or `constructor` in diagram text is never an icon.
 */

/** Dimensions an icon, an alias or a whole pack may set. */
export interface IconifyDimensions {
  readonly left?: number;
  readonly top?: number;
  readonly width?: number;
  readonly height?: number;
}

/** Rotation (quarter turns) and flips an icon or alias may set. */
export interface IconifyTransformations {
  readonly rotate?: number;
  readonly hFlip?: boolean;
  readonly vFlip?: boolean;
}

/** One icon in a pack: its SVG body and optional box and transformations. */
export interface IconifyIcon extends IconifyDimensions, IconifyTransformations {
  readonly body: string;
}

/** An alias: another icon of the pack, with dimensions and transformations on top. */
export interface IconifyAlias extends IconifyDimensions, IconifyTransformations {
  readonly parent: string;
}

/** The part of Iconify's JSON pack format (`@iconify/types` `IconifyJSON`) the lookup reads. */
export interface IconifyJSON extends IconifyDimensions {
  readonly prefix: string;
  readonly icons: Readonly<Record<string, IconifyIcon>>;
  readonly aliases?: Readonly<Record<string, IconifyAlias>>;
}

/** A resolved icon: every dimension and transformation filled in. */
export interface IconData {
  readonly body: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Quarter turns clockwise, 0–3. */
  readonly rotate: number;
  readonly hFlip: boolean;
  readonly vFlip: boolean;
}

/** The SVG box an icon draws in, and the transform its body takes inside it. */
export interface IconBox {
  readonly viewBox: readonly [number, number, number, number];
  /** One `<g transform>` value for the rotation and flips; undefined when there are none. */
  readonly transform: string | undefined;
}

const DEFAULT_SIZE = 16;
/** Longer alias chains than this are treated as broken (Iconify has no limit; packs use 1–2). */
const MAX_CHAIN = 64;

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null;

/** An own entry of a pack record that has the string field `key`: packs are untrusted data. */
function entry(
  record: unknown,
  name: string,
  key: 'body' | 'parent'
): Readonly<Record<string, unknown>> | undefined {
  if (!isObject(record) || !Object.hasOwn(record, name)) return undefined;
  const v = record[name];
  return isObject(v) && typeof v[key] === 'string' ? v : undefined;
}
const iconOf = (pack: IconifyJSON, name: string) =>
  entry(pack.icons, name, 'body') as IconifyIcon | undefined;
const aliasOf = (pack: IconifyJSON, name: string) =>
  entry(pack.aliases, name, 'parent') as IconifyAlias | undefined;

/** A box offset (any finite number) or size (a positive one); anything else counts as unset. */
const offset = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const size = (v: unknown): number | undefined => {
  const n = offset(v);
  return n !== undefined && n > 0 ? n : undefined;
};
const quarterTurns = (v: unknown): number => (Number.isInteger(v) ? (v as number) : 0);

/** The names from `name` up to the icon it resolves to, or undefined for a loop or a gap. */
function chain(pack: IconifyJSON, name: string): string[] | undefined {
  const names = [name];
  for (let current = name; iconOf(pack, current) === undefined; ) {
    const parent = aliasOf(pack, current)?.parent;
    if (parent === undefined || parent === '' || names.includes(parent) || names.length > MAX_CHAIN)
      return undefined;
    names.push(parent);
    current = parent;
  }
  return names;
}

/**
 * The icon `name` of `pack`, aliases followed, with Iconify's defaults (a 16 × 16 box at 0, 0)
 * where neither the icon, its aliases nor the pack set a value. Undefined when the pack has no
 * such icon or its alias chain is broken. Matches `@iconify/utils` `getIconData`.
 */
export function getIcon(pack: IconifyJSON, name: string): IconData | undefined {
  const names = chain(pack, name);
  if (names === undefined) return undefined;
  const icon = iconOf(pack, names[names.length - 1] as string) as IconifyIcon;
  let rotate = 0;
  let hFlip = false;
  let vFlip = false;
  const dims: { left?: number; top?: number; width?: number; height?: number } = {};
  for (const n of names) {
    const props: IconifyDimensions & IconifyTransformations =
      iconOf(pack, n) ?? (aliasOf(pack, n) as IconifyAlias);
    rotate = (rotate + quarterTurns(props.rotate)) % 4;
    hFlip = hFlip !== Boolean(props.hFlip);
    vFlip = vFlip !== Boolean(props.vFlip);
    dims.left ??= offset(props.left);
    dims.top ??= offset(props.top);
    dims.width ??= size(props.width);
    dims.height ??= size(props.height);
  }
  return {
    body: icon.body,
    left: dims.left ?? offset(pack.left) ?? 0,
    top: dims.top ?? offset(pack.top) ?? 0,
    width: dims.width ?? size(pack.width) ?? DEFAULT_SIZE,
    height: dims.height ?? size(pack.height) ?? DEFAULT_SIZE,
    rotate,
    hFlip,
    vFlip,
  };
}

/**
 * The view box an icon draws in and the transform for its rotation and flips, as
 * `@iconify/utils` `iconToSVG` computes them: a flip is mirrored about the box (both flips are a
 * half turn), a rotation turns about the box centre, and a quarter turn swaps the box's sides.
 */
export function iconBox(icon: IconData): IconBox {
  let { left, top, width, height } = icon;
  let rotation = icon.rotate;
  const transforms: string[] = [];
  if (icon.hFlip && icon.vFlip) rotation += 2;
  else if (icon.hFlip || icon.vFlip) {
    transforms.push(
      icon.hFlip
        ? `translate(${String(width + left)} ${String(0 - top)})`
        : `translate(${String(0 - left)} ${String(height + top)})`,
      icon.hFlip ? 'scale(-1 1)' : 'scale(1 -1)'
    );
    left = top = 0;
  }
  rotation = (((rotation % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  if (rotation === 1) {
    const c = String(height / 2 + top);
    transforms.unshift(`rotate(90 ${c} ${c})`);
  } else if (rotation === 2) {
    transforms.unshift(`rotate(180 ${String(width / 2 + left)} ${String(height / 2 + top)})`);
  } else if (rotation === 3) {
    const c = String(width / 2 + left);
    transforms.unshift(`rotate(-90 ${c} ${c})`);
  }
  if (rotation % 2 === 1) [left, top, width, height] = [top, left, height, width];
  return {
    viewBox: [left, top, width, height],
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
  };
}
