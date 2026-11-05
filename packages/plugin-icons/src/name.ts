// cspell:ignore Vjacheslav Trushkin
/**
 * Icon names as written (`fa:bell`, `mdi-fire`, `@provider:fa:bell`) split into a pack and an
 * icon, as v12 split them for shapes (`getIconSVG` with a `fallbackPrefix`).
 *
 * Ported from Iconify's utilities (https://github.com/iconify/iconify, `@iconify/utils` 3.1.7,
 * MIT License, Copyright (c) 2021-PRESENT Vjacheslav Trushkin): `stringToIcon` with validation
 * (`lib/icon/name.js`). The provider is dropped, as v12 never read it.
 */

/** A name split into its pack and its icon. */
export interface IconName {
  readonly prefix: string;
  readonly name: string;
}

/**
 * `value` as `prefix:name` (or `@provider:prefix:name`), else `prefix-name`; a name with neither
 * takes `fallbackPrefix` when one is given (v12: `stringToIcon(value, true, fallback given)`, then
 * `prefix || fallbackPrefix`). Undefined when no non-empty prefix and name come out of it.
 */
export function iconName(value: string, fallbackPrefix?: string): IconName | undefined {
  const parts = value.split(':');
  // `@provider:…`: v12 dropped the provider, but a simple name needs it empty (`@:bell`).
  let provider = '';
  if (value.startsWith('@')) {
    if (parts.length < 2 || parts.length > 3) return undefined;
    provider = parts.shift()!.slice(1);
  }
  if (parts.length > 3) return undefined;
  let prefix: string;
  let name: string;
  if (parts.length > 1) {
    name = parts.pop()!;
    prefix = parts.pop()!;
  } else {
    const only = parts[0]!;
    const dash = only.indexOf('-');
    if (dash >= 0) {
      prefix = only.slice(0, dash);
      name = only.slice(dash + 1);
    } else {
      // A simple name: only with a fallback, and never after a non-empty `@provider`.
      if (fallbackPrefix === undefined || provider !== '' || only === '') return undefined;
      return fallbackPrefix === '' ? undefined : { prefix: fallbackPrefix, name: only };
    }
  }
  return prefix !== '' && name !== '' ? { prefix, name } : undefined;
}
