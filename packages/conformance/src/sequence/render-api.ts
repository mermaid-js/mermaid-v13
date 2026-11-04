// cspell:words zequence
import type { DiagramParseContext } from '@mermaid-js/core';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import { sequence } from '@mermaid-js/diagram-sequence';
import { createMermaid, type Mermaid } from 'mermaid';

/**
 * A `mermaid` API that renders sequence diagrams before the plugin is in the generated registry
 * (#145). The first-party `sequence` row detects `sequenceDiagram` and has no loader, so the
 * plugin is registered as an external diagram under a header no first-party row claims, of the
 * same length, and `parse` puts the real header back: every range is still a range into the
 * source the caller passed through {@link asTest}.
 */
const HEADER = 'sequenceDiagram';
const TEST_HEADER = 'zequenceDiagram';

/** `src` with its diagram header renamed for the test registration. */
export function asTest(src: string): string {
  const at = diagramStart(src, preprocess(src));
  return src.startsWith(HEADER, at)
    ? src.slice(0, at) + TEST_HEADER + src.slice(at + HEADER.length)
    : src;
}

function restore(src: string): string {
  const at = diagramStart(src, preprocess(src));
  return src.startsWith(TEST_HEADER, at)
    ? src.slice(0, at) + HEADER + src.slice(at + TEST_HEADER.length)
    : src;
}

export const sequenceTest = {
  ...sequence,
  id: 'sequence-test',
  detector: (text: string): boolean => /^\s*zequenceDiagram/.test(text),
  parse: (text: string, ctx: DiagramParseContext): ReturnType<typeof sequence.parse> => {
    const real = restore(text);
    return sequence.parse(real, { ...ctx, preprocessed: preprocess(real) });
  },
};

/** A fresh API object with the sequence plugin registered (`deterministic: true`). */
export async function sequenceApi(): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([sequenceTest]);
  return m;
}
