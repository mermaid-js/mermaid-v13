// Node SSR app (spec #218, T4; R-PLUG-5, D165): an HTTP server that renders diagrams to SVG
// on the server. It never registers a plugin: `mermaid`'s Node entry discovers the fixture
// diagram and extension in this app's node_modules. DISCOVERY=off sets `discovery: false`.
// Prints `listening <origin>` once it accepts requests (PORT, default a free port).
import { createServer } from 'node:http';
import mermaid from 'mermaid';

mermaid.initialize({
  deterministic: true,
  ...(process.env.DISCOVERY === 'off' ? { discovery: false } : {}),
});

const DIAGRAMS = { fixture: 'fixturebox from the server', flowchart: 'flowchart LR\n  A --> B\n' };

const escape = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function section(name, text) {
  try {
    const { svg, warnings } = await mermaid.render(`ssr-${name}`, text);
    const codes = warnings.map((w) => w.code).join(' ');
    return `<section id="${name}" data-warnings="${escape(codes)}">${svg}</section>`;
  } catch (error) {
    const code = escape(String(error?.code ?? 'ERROR'));
    return `<section id="${name}"><pre class="error" data-code="${code}">${escape(String(error?.message))}</pre></section>`;
  }
}

const server = createServer(async (req, res) => {
  if (req.url !== '/') {
    res.writeHead(404).end();
    return;
  }
  // One at a time, in a fixed order: the first render gets discovery's warnings.
  const parts = [];
  for (const [name, text] of Object.entries(DIAGRAMS)) parts.push(await section(name, text));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>SSR</title><body>${parts.join('')}</body>`);
});

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`listening http://127.0.0.1:${port}`);
});
