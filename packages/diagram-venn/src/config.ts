/**
 * The `venn` options the layout reads. The config resolver does not check value types (a
 * directive can set `"width": "wide"`), and venn has no warning code for config (D417 lists
 * none), so a value the layout cannot use falls back to its default without a warning: a length
 * is a number, or a numeric string as its number, inside the schema's range; a flag is a
 * boolean.
 *
 * `padding` is the one solve's margin (D412): an author's value as written, else 15, the padding
 * v12 drew its circles with. The resolved config cannot tell a default from an author's value,
 * so the plugin's section defaults leave `padding` out ({@link vennPluginDefaults}): a padding
 * the layout sees is always an author's. The schema's default is 15 too, so its documentation
 * says what is drawn.
 */

/** The `venn` options the layout reads, every one set. */
export interface VennLayoutConfig {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly useDebugLayout: boolean;
}

/**
 * The `VennDiagramConfig` defaults (`packages/core/schema/config.schema.yaml`), which the layout
 * falls back to until #501 generates them into the plugin's `configDefaults`.
 */
export const VENN_CONFIG_DEFAULTS: VennLayoutConfig = {
  width: 800,
  height: 450,
  padding: 15,
  useDebugLayout: false,
};

/**
 * The section defaults the plugin hands core (#501 passes the generated `vennConfigDefaults`
 * through this): every one but `padding`, so no default, whatever the schema says, reaches the
 * layout as if an author had set it.
 */
export function vennPluginDefaults<T extends Readonly<Record<string, unknown>>>(
  defaults: T
): Omit<T, 'padding'> {
  const { padding: _padding, ...rest } = defaults;
  return rest;
}

/** The least value of each length (the schema's `minimum`). */
const MINIMUM: Readonly<Record<'width' | 'height' | 'padding', number>> = {
  width: 1,
  height: 1,
  padding: 0,
};

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** The layout's options from the resolved `venn` section. */
export function vennLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): VennLayoutConfig {
  const given = section ?? {};
  const length = (key: keyof typeof MINIMUM): number => {
    const n = configNumber(given[key]);
    return n !== undefined && n >= MINIMUM[key] ? n : VENN_CONFIG_DEFAULTS[key];
  };
  const debug = given.useDebugLayout;
  return {
    width: length('width'),
    height: length('height'),
    padding: length('padding'),
    useDebugLayout: typeof debug === 'boolean' ? debug : VENN_CONFIG_DEFAULTS.useDebugLayout,
  };
}
