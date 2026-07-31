// Phase 0 spike: does the real game run headless, and how fast?
//
//   node --import ./research/harness/register.mjs research/harness/spike.mjs
import { bootHeadless, startLevel, step, STEP_MS } from './boot.mjs';

const STEPS = Number(process.argv[2] ?? 10000);

const t0 = Date.now();
const game = await bootHeadless();
console.log(`booted headless in ${Date.now() - t0} ms`);

const scene = await startLevel(game, 0);
console.log(`level: "${scene.levelDef.name}" — ${scene.levelDef.rows.length} rows, ${scene.trapManager?.traps?.length ?? '?'} traps`);
console.log(`player spawn: x=${Math.round(scene.player.x)} y=${Math.round(scene.player.y)} state=${scene.player.pstate}`);

let elapsed = 0;
const tStart = process.hrtime.bigint();
for (let i = 0; i < STEPS; i++) {
  elapsed += STEP_MS;
  step(game, elapsed);
}
const ns = Number(process.hrtime.bigint() - tStart);
const secs = ns / 1e9;

const p = scene.player;
console.log(`player after ${STEPS} steps: x=${Math.round(p.x)} y=${Math.round(p.y)} state=${p.pstate} sceneState=${scene.state}`);
console.log('');
console.log(`  ${STEPS} steps in ${secs.toFixed(2)} s`);
console.log(`  ${Math.round(STEPS / secs).toLocaleString()} steps/sec`);
console.log(`  ${(secs / STEPS * 1000).toFixed(3)} ms/step`);
console.log(`  simulated ${(STEPS * STEP_MS / 1000).toFixed(1)} s of game time — ${(STEPS * STEP_MS / 1000 / secs).toFixed(0)}x real time`);

game.destroy(true);
process.exit(0);
