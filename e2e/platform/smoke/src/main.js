// Renders from the installed tarballs: a flowchart through `mermaid`, and the fixture
// diagram and extension registered by their package.json manifests, as an integrator would.
import { createMermaid } from 'mermaid';
import diagramPackage from 'mermaid-fixture-diagram/package.json' with { type: 'json' };
import { detector } from 'mermaid-fixture-diagram/detector';
import extensionPackage from 'mermaid-fixture-extension/package.json' with { type: 'json' };

const status = document.getElementById('status');

async function main() {
  const mermaid = createMermaid();
  await mermaid.registerExternalDiagrams([
    {
      manifest: diagramPackage.mermaid,
      detector,
      load: () => import('mermaid-fixture-diagram/entry'),
    },
    { manifest: extensionPackage.mermaid, load: () => import('mermaid-fixture-extension') },
  ]);
  const flow = await mermaid.render(
    'flow',
    'flowchart LR\n  A[Start] --> B{Choice}\n  B --> C[Done]\n'
  );
  document.getElementById('flowchart').innerHTML = flow.svg;
  const box = await mermaid.render('box', 'fixturebox packed');
  document.getElementById('fixture').innerHTML = box.svg;
  status.textContent = `rendered ${flow.diagramType} ${box.diagramType}`;
}

main().catch((error) => {
  status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
});
