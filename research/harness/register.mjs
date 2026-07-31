// Bootstrap, loaded with `node --import ./research/harness/register.mjs <script>`.
//
// Order matters and is the reason this is a separate file: `--import` modules
// are fully evaluated before the main module is even resolved, so the DOM
// exists by the time anything pulls in phaser. Doing this from inside the main
// script is too late — phaser reads `window` while its module body evaluates.
import { register } from 'node:module';
import { installDom } from './dom.mjs';

installDom();
register('./hooks.mjs', import.meta.url);
