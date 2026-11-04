// cspell:ignore Datasto catm ellips ullRom

import type { DivergenceKind } from '../types.ts';

/**
 * Fuzz-only divergences from mermaid@12 that are decided, not bugs (#17, GAPS "fuzz-only
 * preprocess differences"). None of them occurs in the corpus, so they are not in
 * `divergences.json` (which is keyed by corpus item). `decided.spec.ts` runs each example
 * through the oracle and v13, so a decision that stops being true fails. The nightly fuzz
 * run's oracle report groups what it finds by these families.
 */
export interface DecidedDivergence {
  id: string;
  /** What v13 does that v12 does not, per the runner's kinds. */
  kind: DivergenceKind;
  source: string;
  reason: string;
}

export const FUZZ_DECISIONS: readonly DecidedDivergence[] = [
  {
    id: 'unclosed-directive',
    kind: 'reject',
    source: 'flowchart TD\n  A --> B\n  %%{init: x\n  C --> D\n',
    reason:
      'An unclosed `%%{` is an error that ends at its line (#5). v12 directiveRegex made `}%%` optional and read on, so the directive silently swallowed text.',
  },
  {
    id: 'unclosed-directive-in-label',
    kind: 'reject',
    source: 'flowchart TD\n  A@{ shape: datastore, label: "Datasto%%{init: re" }\n',
    reason:
      'Directives are found anywhere after front matter, as in v12, labels included; an unclosed one is the same error as above.',
  },
  {
    id: 'invalid-directive-content',
    kind: 'accept',
    source: '%%{init: e x{"flowchart": {"htmlLabels": true}} }%%\nflowchart LR\n  A --> B\n',
    reason:
      'A directive whose content is not JSON is dropped with an INVALID_DIRECTIVE warning (#5); v12 failed detection with "No diagram type detected".',
  },
  {
    id: 'entity-code-starts-shape-data-text',
    kind: 'reject',
    source: 'flowchart TD\n  A@{ shape: rect, #35;l: "x" }\n',
    reason:
      'v13 hands shape data to YAML with Mermaid entity codes as v12 decodes them (`#35;` → `&#35;`), so an unquoted key or value that starts with one reads as a YAML anchor, which v13 does not support (#5). v12 parsed its internal placeholder text instead. Quote such text.',
  },
  {
    id: 'entity-code-in-unquoted-shape-data-value',
    kind: 'model',
    source: 'flowchart TD\n  A e1@--> B\n  e1@{ curve: catm&#60;ullRom }\n',
    reason:
      'v12 left its internal entity placeholder (`ﬂ°°60¶ß`) in shape-data values it does not decode (curve); v13 keeps the text as written.',
  },
  {
    id: 'placeholder-characters-in-text',
    kind: 'model',
    source: 'graph TD\nA(-this is an ellips¶ße-)-->B\n',
    reason:
      'v12 encoded entities as `ﬂ°…¶ß` placeholders and decoded them after parsing, which corrupts text that contains those characters. v13 has no placeholders.',
  },
  {
    id: 'bare-subgraph',
    kind: 'accept',
    source: 'flowchart LR\nsubgraph S\n  x\nend\nsubgraph\n  y\nend\n',
    reason:
      'A subgraph without an id gets one (`subGraph1`); v12 crashed with a TypeError (#8 decision).',
  },
];
