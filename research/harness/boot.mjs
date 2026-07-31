// Boot the real game headless and hand back a stepped, deterministic instance.
//
// `Phaser.HEADLESS` keeps every system the simulation depends on — arcade
// physics, tilemaps, scenes, tweens, the texture and animation managers — and
// drops only the renderer. So this is not a model of the game, it IS the game
// with the drawing switched off.
//
// Requires `node --import ./research/harness/register.mjs`.
import Phaser from 'phaser';
import { BootScene } from '../../src/scenes/BootScene.js';
import { GameScene } from '../../src/scenes/GameScene.js';
import { UIScene } from '../../src/scenes/UIScene.js';
import { GAME_W, GAME_H } from '../../src/constants.js';
import { TUNING as T } from '../../src/config/tuning.js';

/** Fixed simulation step. Everything downstream depends on this never varying:
 *  trap timers and the cling rise-drag both integrate against `delta`, so a
 *  variable step makes runs unreproducible and the solver unsound. */
export const STEP_MS = 1000 / 60;

/** A synthetic `Date.now()` for the simulation.
 *
 *  Phaser's TweenManager does not use the game loop's delta at all: its
 *  getDelta() reads `Date.now() - prevTime`, by design, so tweens keep
 *  real-world pace whatever the frame rate. Under a stepped simulation that is
 *  wrong twice over — it is non-deterministic (it measures how long the process
 *  took) and it is unfaithful (a tight loop advances tweens by microseconds, so
 *  they effectively freeze).
 *
 *  That is not cosmetic here. `Player.squash()` scales the sprite, and an Arcade
 *  body scales with its game object, so a stalled squash leaves the collider
 *  12.8px tall instead of 16 — collision itself then differs from the browser.
 *
 *  Advancing a fake clock in lockstep lets the real tween code run untouched,
 *  at exactly one fixed step per call. */
const SIM_EPOCH = 1_700_000_000_000;
let simNowMs = SIM_EPOCH;
const SIM_DATE_NOW = () => simNowMs;

/** Stands in for the absent HEADLESS renderer. `gl: null` is the load-bearing
 *  field — Phaser branches on its truthiness before doing anything GPU-side. */
const NULL_RENDERER = {
  gl: null,
  type: 0,
  width: GAME_W,
  height: GAME_H,
  createCanvasTexture: () => null,
  deleteTexture: () => {},
  canvasToTexture: () => null,
  updateCanvasTexture: () => {},
  resize: () => {},
  // Game.step drives the render pipeline every tick regardless of renderer
  // type; these are the entry points it calls. Doing nothing is exactly right.
  preRender: () => {},
  render: () => {},
  postRender: () => {},
  resetTextures: () => {},
  snapshot: () => {},
  destroy: () => {},
  on: () => {},
  once: () => {},
  off: () => {},
  emit: () => {},
};

function waitFor(predicate, { timeoutMs = 15000, label = 'condition' } = {}) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      if (predicate()) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error(`timed out waiting for ${label}`));
      setTimeout(tick, 4);
    };
    tick();
  });
}

/**
 * Start a headless game and run its Boot scene to completion.
 * The returned handle owns the Phaser instance; call `destroy()` when done.
 */
export async function bootHeadless() {
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: GAME_W,
    height: GAME_H,
    banner: false,
    audio: { noAudio: true },
    // Nothing is displayed, so there is nothing to fit to. NONE keeps the
    // ScaleManager from measuring a canvas that has no page to sit in.
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    // Belt and braces: nothing should consult the TimeStep once the harness
    // drives Game.step directly, but if anything does, it must not smooth.
    fps: { target: 60, forceSetTimeOut: true, smoothStep: false },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: T.GRAVITY_Y }, debug: false },
    },
    // Boot generates the art; Game is started explicitly per level. UI is
    // registered because GameScene launches it and drives it through the
    // win/fail flow — leaving it out would change the code path under test.
    // Title is deliberately absent; nothing in a simulated run needs it.
    scene: [BootScene, GameScene, UIScene],
    callbacks: {
      preBoot: (g) => {
        // HEADLESS leaves game.renderer null, but Phaser's own
        // CanvasTexture.refresh -> TextureSource.update reads `renderer.gl`
        // without a guard, so generating a texture throws. Every code path
        // that follows only asks whether `gl` is truthy, so a null-object
        // renderer satisfies them all.
        //
        // The alternative — booting the CANVAS renderer — would work too, but
        // then every simulated step also rasterises a 960x540 frame nobody
        // looks at, and throughput is the whole point of running headless.
        let assigned = null;
        Object.defineProperty(g, 'renderer', {
          configurable: true,
          get: () => assigned ?? NULL_RENDERER,
          set: (v) => { assigned = v; },
        });
      },
    },
  });

  // Wait for `isRunning`, not `isBooted`. `isBooted` flips partway through boot,
  // before Game.start() spins up the TimeStep — stop the loop on that signal and
  // you stop something that has not started, and it comes up regardless.
  await waitFor(() => game.isRunning, { label: 'game start' });

  // BootScene generates every texture and animation procedurally, then starts
  // Title. We only need it to have finished creating.
  await waitFor(() => game.scene.getScene('Boot')?.sys?.settings?.status >= 5, { label: 'Boot create' });

  // Take the loop off requestAnimationFrame, so the harness owns time outright.
  //
  // Leaving it running is not a cosmetic bug. requestAnimationFrame would keep
  // stepping the game on wall-clock time alongside the harness's own fixed
  // steps, so a run would advance by an amount depending on how busy the process
  // happened to be. That is exactly why the first determinism check came back NO.
  game.loop.stop();
  // Boot hands off to Title, which is not registered here; stop whatever it
  // started so only Game is ever stepped.
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key !== 'Game') s.scene.stop();
  });

  if (game.loop.running) throw new Error('game loop still running: the simulation would not be reproducible');

  resetClock(game);
  return game;
}

/**
 * Put the clock back to zero.
 *
 * Phaser's Clock and TweenManager stamp everything they create against
 * `loop.time`, which after boot still holds a wall-clock reading. Start
 * stepping from ~16ms and every timer scheduled during `create()` is suddenly
 * due at a step decided by how long boot happened to take — so a delayed call
 * fires on step 83 of one run and never in the next. Zeroing before the scene
 * is built makes those schedules a function of the step count instead.
 */
function resetClock(game) {
  const loop = game.loop;
  loop.time = 0;
  loop.now = 0;
  loop.lastTime = 0;
  loop.delta = 0;
  loop.rawDelta = 0;
  loop.frame = 0;
  loop.startTime = 0;
}

/** Start (or restart) the Game scene on a level and settle it to `create` done. */
export async function startLevel(game, levelIndex = 0) {
  game.scene.stop('Game');
  game.scene.stop('UI');
  resetClock(game);
  game.scene.start('Game', { level: levelIndex });
  await waitFor(() => {
    const s = game.scene.getScene('Game');
    return s?.player && s?.sys?.settings?.status >= 5;
  }, { label: 'Game create' });

  // create() may have advanced the clock; re-zero so step 1 is genuinely t=0
  // and every scheduled callback is measured from the same origin.
  resetClock(game);
  const scene = game.scene.getScene('Game');
  scene.time.now = 0;

  // Re-base every tween manager onto the synthetic clock, matching how
  // TweenManager.boot() seeds itself (startTime = now, prevTime = startTime,
  // nextTime = gap). Without this the first getDelta() sees the gap between the
  // real epoch and ours and skips the tween system forward by decades.
  simNowMs = SIM_EPOCH;
  for (const s2 of game.scene.getScenes(true)) {
    const tm = s2.tweens;
    if (!tm) continue;
    tm.startTime = simNowMs;
    tm.prevTime = simNowMs;
    tm.time = 0;
    tm.nextTime = tm.gap;
  }
  return scene;
}

/**
 * Advance the simulation exactly one fixed step.
 *
 * This drives `Game.step(time, delta)` directly rather than `loop.step(time)`,
 * and the distinction is the difference between reproducible and not. Phaser's
 * TimeStep derives its delta from the wall clock and then *smooths* it across
 * recent frames, so the value a scene receives depends both on when the process
 * happened to call in and on the frames before it. Physics integrates against
 * that delta, so two identical runs drift apart — by ~0.2px of fall in the
 * first hundred steps, which is small until a jump clears a ledge in one run
 * and clips it in the other.
 *
 * Handing the delta in ourselves makes each step a pure function of the step
 * count. `loop.*` is kept in sync because Phaser systems read those fields.
 */
export function step(game, elapsedMs, deltaMs = STEP_MS) {
  const loop = game.loop;
  loop.time = elapsedMs;
  loop.now = elapsedMs;
  loop.delta = deltaMs;
  loop.rawDelta = deltaMs;
  loop.lastTime = elapsedMs;
  loop.frame += 1;

  simNowMs += deltaMs;
  const realDateNow = Date.now;
  Date.now = SIM_DATE_NOW;
  try {
    game.step(elapsedMs, deltaMs);
  } finally {
    Date.now = realDateNow;
  }
}
