// Every feel constant lives here. Exposed as window.TUNING in dev so values
// can be tweaked live from the console (takes effect next frame).
export const TUNING = {
  GRAVITY_Y: 950,

  RUN_SPEED: 140,
  RUN_ACCEL: 1600,
  RUN_DRAG: 1800,
  AIR_ACCEL: 1100,
  MAX_FALL: 480,

  JUMP_VEL: 280,
  JUMP_CUT: 0.45,          // vy *= this on Space release while rising
  JUMP_CUT_MIN_VY: -80,    // only cut when rising faster than this

  CLIMB_UP: 90,
  CLIMB_DOWN: 135,
  CLING_PUSH: 25,          // constant micro-push into wall keeps blocked.* true
  // How fast a caught wall kills leftover upward speed. Deliberately equal to
  // GRAVITY_Y: a jump made against a wall then rises exactly as far as one made
  // in the open, and she holds at the top instead of falling back. Raise it and
  // hugging a wall quietly costs you height, which reads as the jump misfiring.
  CLING_RISE_DRAG: 950,

  WALLJUMP_VX: 240,
  WALLJUMP_VY: 300,
  WALLJUMP_HLOCK_MS: 110,  // ignore L/R accel after wall-jump
  RESTICK_LOCK_MS: 140,    // same-side wall re-cling lockout

  COYOTE_MS: 100,          // ground AND wall
  BUFFER_MS: 120,          // jump buffer

  MANTLE_VY: -190,
  MANTLE_VX: 90,

  PEEK_HOLD_MS: 300,
  PEEK_OFFSET: 80,

  // fail sequence
  HITSTOP_MS: 90,
  SLOWMO_SCALE: 0.4,
  SLOWMO_END_MS: 500,
  FADE_START_MS: 800,
  RESTART_MS: 1200,

  // kindness valve: after 3 consecutive fails, telegraphs get +25% longer
  KINDNESS_FAILS: 3,
  KINDNESS_MULT: 1.25,
};

// `?.` because this module is also imported outside the bundler (the headless
// research harness), where import.meta.env does not exist.
if (import.meta.env?.DEV) window.TUNING = TUNING;
