// Module resolution hook: rewrite the bare `phaser` specifier to the Node
// stand-in. This runs off the main thread and only rewrites strings.
//
// Doing it here rather than editing src/ is deliberate: every file under src/
// keeps its plain `import Phaser from 'phaser'`, so the code the harness
// analyses is character-for-character the code that ships to the browser.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIM = pathToFileURL(resolvePath(HERE, 'phaser-node.mjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') return { url: SHIM, shortCircuit: true };
  return nextResolve(specifier, context);
}
