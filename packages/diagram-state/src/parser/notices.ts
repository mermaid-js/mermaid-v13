// Warnings for statements that parse but draw nothing (pitfall 22). The parser reports them;
// none changes what is accepted or rejected (v12 parity).
import type { Range } from '@mermaid-js/core/parser-kit';
import type { StateModel } from './model.ts';
import type { Scope } from './names.ts';

/** Where the warnings go: the parse's diagnostics. */
interface Sink {
  warning(code: string, message: string, range: Range): unknown;
}

/** `classDef`, `class`, `style` and `click` inside a composite: v12 reads them at the top only. */
export function ignoredInComposite(
  sink: Sink,
  keyword: string,
  scope: Scope | undefined,
  at: Range
): void {
  if (!scope) return;
  sink.warning(
    'IGNORED_IN_COMPOSITE',
    `\`${keyword}\` inside composite state \`${scope.name}\` does nothing (v12 ignores it too): move it to the top level.`,
    at
  );
}

/** In a composite v12's lexer has no `click` keyword: the line reads as state names. */
export function clickInComposite(
  sink: Sink,
  scope: Scope | undefined,
  id: string,
  at: Range
): void {
  if (!scope || id.trim() !== 'click') return;
  sink.warning(
    'IGNORED_IN_COMPOSITE',
    `\`click\` inside composite state \`${scope.name}\` is no link: v12 reads the line as state names, and so does v13. Move it to the top level.`,
    at
  );
}

export function scaleIgnored(sink: Sink, at: Range): void {
  sink.warning(
    'SCALE_IGNORED',
    '`scale … width` does nothing (v12 ignores it too): set the width with `state.useMaxWidth` or the container instead.',
    at
  );
}

/**
 * Once the model is built: `state X` lines that draw nothing (`STATE_NOT_DRAWN`) and top-level
 * `click` links on a composite or an undrawn state (`LINK_NOT_DRAWN`; the renderer links
 * simple states only).
 */
export function undrawnNotices(
  sink: Sink,
  model: StateModel,
  declared: readonly (readonly [string, Range])[],
  clicks: readonly (readonly [string, Range])[]
): void {
  const drawn = new Set(model.states.map((s) => s.id));
  for (const [name, range] of declared) {
    if (drawn.has(name)) continue;
    sink.warning(
      'STATE_NOT_DRAWN',
      `\`state ${name}\` on its own declares nothing, so \`${name}\` is not drawn: mention it in a transition or give it a description, e.g. \`${name} : text\`.`,
      range
    );
  }
  const composites = new Set(model.states.filter((s) => s.kind === 'composite').map((s) => s.id));
  for (const [name, range] of clicks) {
    if (composites.has(name)) {
      sink.warning(
        'LINK_NOT_DRAWN',
        `\`${name}\` is a composite state, and only simple states take a \`click\` link: this one is not drawn.`,
        range
      );
    } else if (!drawn.has(name)) {
      sink.warning(
        'LINK_NOT_DRAWN',
        `\`${name}\` is not drawn, so its \`click\` link is not either: mention it in a transition or give it a description.`,
        range
      );
    }
  }
}
