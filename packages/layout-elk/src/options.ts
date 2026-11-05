/**
 * The `elk.*` config keys (the package's config fragment, D153) as ELK layout options, and the
 * presets, as v12 develop maps them (`rendering-util/layout-algorithms/elk/render.ts`:
 * `createRootElkGraph`, `buildSubgraphLayoutOptions`, `ELK_PRESETS`, `resolveElkPreset`).
 *
 * v12's experiment blocks (`elkOptionCatalogue.ts`) are all commented out on develop, so they
 * contribute nothing and are not ported.
 */
import type { LayoutOptions } from 'elkjs/lib/elk-api.js';

/** The `elk` config section (`schema/config.fragment.yaml`). Every key is optional. */
export interface ElkConfig {
  mergeEdges?: boolean;
  nodePlacementStrategy?: 'SIMPLE' | 'NETWORK_SIMPLEX' | 'LINEAR_SEGMENTS' | 'BRANDES_KOEPF';
  nodePlacementAlignment?: 'NONE' | 'LEFTUP' | 'LEFTDOWN' | 'RIGHTUP' | 'RIGHTDOWN' | 'BALANCED';
  preset?: string;
  straightenEdges?: boolean;
  lineHops?: boolean | 'arc' | 'gap';
  layeringStrategy?: string;
  layeringLayerBound?: number;
  cycleBreakingStrategy?: string;
  forceNodeModelOrder?: boolean;
  considerModelOrder?: string;
  keepEntryNodeOnTop?: boolean;
  orientFeedbackEdges?: boolean;
}

/** A preset: the layout choices it supplies when the author leaves them unset. */
export interface ElkPreset {
  readonly layering: string;
  /** Node placement at the top level. */
  readonly placement: string;
  /** Node placement inside groups, resolved apart from the top level. */
  readonly containerPlacement: string;
  /** Brandes-Koepf alignment, at the top level and in groups. */
  readonly alignment: string;
  readonly cycleBreaking: string;
}

/** v12 develop's presets (`ELK_PRESETS`). */
const ELK_PRESETS: Readonly<Record<string, ElkPreset>> = {
  // Balanced Brandes-Koepf centres simple branches and composite-state entries.
  default: {
    layering: 'NETWORK_SIMPLEX',
    placement: 'BRANDES_KOEPF',
    containerPlacement: 'BRANDES_KOEPF',
    alignment: 'BALANCED',
    cycleBreaking: 'DEPTH_FIRST',
  },
  // The layout before presets, with ELK's own greedy cycle breaking.
  legacy: {
    layering: 'NETWORK_SIMPLEX',
    placement: 'BRANDES_KOEPF',
    containerPlacement: 'BRANDES_KOEPF',
    alignment: 'NONE',
    cycleBreaking: 'GREEDY',
  },
  modelOrder: {
    layering: 'NETWORK_SIMPLEX',
    placement: 'NETWORK_SIMPLEX',
    containerPlacement: 'BRANDES_KOEPF',
    alignment: 'NONE',
    cycleBreaking: 'GREEDY_MODEL_ORDER',
  },
  // The previous default, for callers that name it.
  depthFirst: {
    layering: 'NETWORK_SIMPLEX',
    placement: 'NETWORK_SIMPLEX',
    containerPlacement: 'BRANDES_KOEPF',
    alignment: 'NONE',
    cycleBreaking: 'DEPTH_FIRST',
  },
};

/**
 * The preset `name` names, else `default`. `Object.hasOwn`, not an index: a directive can put
 * anything here, and `ELK_PRESETS['__proto__']` would be `Object.prototype`.
 */
export function resolveElkPreset(name: string | undefined): ElkPreset {
  return name !== undefined && Object.hasOwn(ELK_PRESETS, name)
    ? ELK_PRESETS[name]!
    : ELK_PRESETS.default!;
}

/** The section from a resolved config: `ctx.config.elk`, or nothing. */
export function elkConfigOf(config: unknown): ElkConfig {
  const elk = (config as { elk?: unknown } | undefined)?.elk;
  return typeof elk === 'object' && elk !== null ? (elk as ElkConfig) : {};
}

/** Options with every unset (undefined) value left out, the rest as ELK's strings. */
function defined(options: Record<string, string | number | boolean | undefined>): LayoutOptions {
  const out: LayoutOptions = {};
  for (const [key, value] of Object.entries(options))
    if (value !== undefined) out[key] = String(value);
  return out;
}

/**
 * The root's `elk.*` options (v12 `createRootElkGraph`). Set for every algorithm, as v12 does:
 * they are `layered` options, which the others ignore.
 */
export function rootOptions(elk: ElkConfig): LayoutOptions {
  const preset = resolveElkPreset(elk.preset);
  return defined({
    'elk.layered.nodePlacement.strategy': elk.nodePlacementStrategy ?? preset.placement,
    'elk.layered.nodePlacement.bk.fixedAlignment': elk.nodePlacementAlignment ?? preset.alignment,
    'elk.layered.mergeEdges': elk.mergeEdges,
    'elk.layered.crossingMinimization.forceNodeModelOrder': elk.forceNodeModelOrder,
    'elk.layered.considerModelOrder.strategy': elk.considerModelOrder,
    'elk.layered.cycleBreaking.strategy': elk.cycleBreakingStrategy ?? preset.cycleBreaking,
    'elk.layered.layering.strategy': elk.layeringStrategy ?? preset.layering,
    // Only COFFMAN_GRAHAM reads this; the other strategies ignore it.
    'elk.layered.layering.coffmanGraham.layerBound': elk.layeringLayerBound,
  });
}

/**
 * A group's `elk.*` options (v12 `buildSubgraphLayoutOptions`). Placement is resolved apart from
 * the root's (`containerPlacement`), and cycle breaking again, because a group laid out on its
 * own never sees the root's value and would fall back to ELK's GREEDY.
 *
 * One deviation from v12: `MODEL_ORDER` cycle breaking is left off a group that ELK lays out
 * with its parent (`separate` false). elkjs 0.12 throws ("Cannot read properties of undefined")
 * for a compound node with it under `INCLUDE_CHILDREN`, so v12 develop fails such a render; the
 * root's value applies to that group anyway.
 */
export function groupOptions(elk: ElkConfig, separate = true): LayoutOptions {
  const preset = resolveElkPreset(elk.preset);
  const cycleBreaking = elk.cycleBreakingStrategy ?? preset.cycleBreaking;
  return defined({
    'elk.layered.mergeEdges': elk.mergeEdges,
    'elk.layered.nodePlacement.bk.fixedAlignment': elk.nodePlacementAlignment ?? preset.alignment,
    'elk.layered.nodePlacement.strategy': elk.nodePlacementStrategy ?? preset.containerPlacement,
    'elk.layered.cycleBreaking.strategy':
      cycleBreaking === 'MODEL_ORDER' && !separate ? undefined : cycleBreaking,
  });
}
