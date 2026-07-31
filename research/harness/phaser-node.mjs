// Node-side stand-in for the bare `phaser` specifier.
//
// Two mismatches to paper over, neither of which the browser build has:
//
//   1. Phaser's package `main` points at ./src/phaser.js, whose WebGL renderer
//      requires phaser3spectorjs — a debug dependency that is not installed and
//      is never used at runtime. Node follows `main`; Vite follows `module` and
//      gets the prebuilt bundle. We point at the same prebuilt bundle Vite uses,
//      so the harness and the game run identical engine code.
//   2. dist/phaser.esm.js has only named exports, and every file in src/ does
//      `import Phaser from 'phaser'`. Vite's interop invents the default; Node
//      does not, so we provide it.
import * as Phaser from 'phaser/dist/phaser.esm.js';

export * from 'phaser/dist/phaser.esm.js';
export default Phaser;
