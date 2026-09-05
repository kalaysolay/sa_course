import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const viewerRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(viewerRoot, '..');
const vendorRoot = path.join(viewerRoot, 'public', 'vendor');

await fs.mkdir(vendorRoot, { recursive: true });

await fs.copyFile(
  path.join(projectRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  path.join(vendorRoot, 'mermaid.min.js')
);

await fs.copyFile(
  path.join(projectRoot, 'node_modules', '@plantuml', 'core', 'viz-global.js'),
  path.join(vendorRoot, 'viz-global.js')
);

const plantUmlModule = await fs.readFile(
  path.join(projectRoot, 'node_modules', '@plantuml', 'core', 'plantuml.js'),
  'utf8'
);
const plantUmlBrowser = plantUmlModule.replace(
  /export\{C as render,D as renderToString\};\s*$/,
  'globalThis.PlantUMLCore={render:C,renderToString:D};'
);

if (plantUmlBrowser === plantUmlModule) {
  throw new Error('PlantUML browser export signature has changed.');
}

await fs.writeFile(path.join(vendorRoot, 'plantuml.js'), plantUmlBrowser, 'utf8');
console.log(`Viewer libraries prepared in ${vendorRoot}`);
