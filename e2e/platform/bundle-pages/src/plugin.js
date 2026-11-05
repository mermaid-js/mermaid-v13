// The bundler-plugin page (spec #218, T5; D164): no registration code. With `mermaid()` in the
// bundler config, the installed fixture diagram, fixture extension and plugin-interactions are
// discovered at build time. `window.draw(id, text)` renders one diagram into `#<id>` and binds
// its callbacks; `click … callback` calls `window.callback`, which records into `window.calls`.
import { render } from 'mermaid';

window.calls = [];
window.callback = (...args) => window.calls.push(args);
window.draw = async (id, text) => {
  try {
    const result = await render(`d-${id}`, text);
    const holder = document.createElement('div');
    holder.id = id;
    holder.innerHTML = result.svg;
    document.getElementById('diagrams').append(holder);
    result.bindFunctions?.(holder);
    return { type: result.diagramType, warnings: result.warnings.map((w) => w.code) };
  } catch (error) {
    return { error: error?.code ?? String(error) };
  }
};
document.getElementById('status').textContent = 'ready';
