// Pack-and-install check (#174): the installed adapters import in Node, and every per-type
// first-paint grammar each one maps resolves from the published files and parses.
import { LEZER_HIGHLIGHTERS } from '@mermaid-js/language-service-codemirror';
import { MONARCH_HIGHLIGHTERS } from '@mermaid-js/language-service-monaco';

const SAMPLES = {
  flowchart: 'flowchart LR\n  A[Start] --> B(End)\n',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hi\n',
  class: 'classDiagram\n  class Animal\n',
  state: 'stateDiagram-v2\n  [*] --> Idle\n',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n',
};

const lezer = {};
for (const [id, load] of Object.entries(LEZER_HIGHLIGHTERS)) {
  const parser = await load();
  const tree = parser.parse(SAMPLES[id] ?? `${id}\n`);
  let nodes = 0;
  tree.iterate({ enter: () => void nodes++ });
  if (nodes < 2) throw new Error(`Lezer ${id}: empty tree`);
  lezer[id] = nodes;
}

const monarch = {};
for (const [id, highlighter] of Object.entries(MONARCH_HIGHLIGHTERS)) {
  const def = await highlighter.load();
  const states = Object.keys(def.tokenizer ?? {}).length;
  if (states === 0) throw new Error(`Monarch ${id}: no tokenizer states`);
  monarch[id] = states;
}

process.stdout.write(JSON.stringify({ lezer, monarch }));
