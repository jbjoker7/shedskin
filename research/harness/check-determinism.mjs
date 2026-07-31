// Is the headless simulation reproducible? Everything downstream — search,
// snapshot/restore, difficulty scoring — is worthless if it is not.
//
//   node --import ./research/harness/register.mjs research/harness/determinism-probe.mjs
import { bootHeadless, startLevel, step, STEP_MS } from './boot.mjs';

const STEPS = 1200;

function fingerprint(scene) {
  const p = scene.player;
  const parts = [
    p.x, p.y, p.body.velocity.x, p.body.velocity.y, p.pstate, p.clingSide ?? '-',
    scene.state,
  ];
  for (const t of scene.trapManager?.traps ?? []) {
    parts.push(t.constructor.name, t.timer ?? '-', t.x ?? '-', t.y ?? '-', t.state ?? '-');
  }
  for (const s of scene.tail?.segments ?? []) parts.push(s.x, s.y);
  return parts.join('|');
}

async function run(levelIndex) {
  const game = await bootHeadless();
  const scene = await startLevel(game, levelIndex);
  const trace = [];
  let elapsed = 0;
  for (let i = 0; i < STEPS; i++) {
    elapsed += STEP_MS;
    step(game, elapsed);
    if (i % 100 === 0) trace.push(fingerprint(scene));
  }
  const final = fingerprint(scene);
  game.destroy(true);
  return { trace, final };
}

const a = await run(0);
const b = await run(0);

const traceSame = a.trace.every((v, i) => v === b.trace[i]);
console.log(`sampled fingerprints identical : ${traceSame ? 'YES' : 'NO'}  (${a.trace.length} samples)`);
console.log(`final state identical          : ${a.final === b.final ? 'YES' : 'NO'}`);
if (!traceSame) {
  const i = a.trace.findIndex((v, j) => v !== b.trace[j]);
  console.log(`  first divergence at sample ${i}:`);
  console.log(`    run A: ${a.trace[i]}`);
  console.log(`    run B: ${b.trace[i]}`);
}
console.log(`final: ${a.final}`);
process.exit(traceSame && a.final === b.final ? 0 : 1);
