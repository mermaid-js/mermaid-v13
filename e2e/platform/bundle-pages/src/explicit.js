// The explicit-registration page (spec #867, D585, D586): the app imports the fixture diagram
// package's main export, a lazy descriptor, and registers it with `registerExternalDiagrams`.
// There is no bundler plugin: the detector sits in this page's scripts, the entry in its own
// chunk that loads on the first `fixturebox` render. `window.draw(id, text)` renders one diagram
// into `#<id>`.
import { registerExternalDiagrams, render } from 'mermaid';
import box from 'mermaid-fixture-diagram';

async function main() {
  await registerExternalDiagrams([box]);
  document.getElementById('status').textContent = 'ready';
}

window.draw = async (id, text) => {
  try {
    const result = await render(`d-${id}`, text);
    const holder = document.createElement('div');
    holder.id = id;
    holder.innerHTML = result.svg;
    document.getElementById('diagrams').append(holder);
    return { type: result.diagramType, warnings: result.warnings.map((w) => w.code) };
  } catch (error) {
    return { error: error?.code ?? String(error) };
  }
};

main().catch((error) => {
  document.getElementById('status').textContent = `failed: ${String(error)}`;
});
