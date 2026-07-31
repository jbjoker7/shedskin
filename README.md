# shedskin — KEEP YOUR TAIL

### ▶ [Play it in your browser](https://jbjoker7.github.io/shedskin/)

A 2D vertical platformer about a gecko escaping a lizard farm where tails are
harvested. Climb any wall. Dodge the machines. Reach the sky. **Lose your tail
and you lose the level.**

Built with Phaser 3 + Vite. Every sprite, tile, and sound is generated in code
at boot — the repo contains zero binary assets.

## Play

No install needed — **<https://jbjoker7.github.io/shedskin/>**. Every push to
`main` rebuilds and redeploys it.

To run it locally:

```bash
npm install
npm run dev        # http://localhost:5173
```

**Controls:** arrows / WASD move · SPACE, W or ↑ jump · hold toward a wall to
grab it, then W/↑ climbs up, S/↓ slides down, SPACE wall-jumps · hold ↓ while
standing to scout ahead · R restart · M mute

The gecko grips any wall as long as you keep pressing into it — let go of the
direction and it drops. Chain wall-jumps up shafts by steering into each wall.
Climbing down is faster than climbing up — use it to dodge.

- **Level 1 — The Pens**: escape your cage the night before your "trim".
- **Level 2 — The Harvest Floor**: where the tails go.
- **Level 3 — The Chimney**: the only way out is up — and the farm sends
  The Collector up after you.

## Dev URLs

- `?level=1|2|3` — jump straight to a level
- `?level=test` — greybox feel-test room
- `?debug` — arcade physics debug draw
- `?gfx` — every generated texture at 4x

All movement/feel constants live in `src/config/tuning.js` (exposed as
`window.TUNING` in dev — tweak live in the console).

## Level authoring

Levels are ASCII string arrays in `src/levels/level*.js` (30 chars wide,
row 0 = top). Legend in `src/levels/legend.js`. Validate with:

```bash
node tools/validate-level.mjs src/levels/level1.js
```

The validator checks structure, trap mounts, spawn/exit reachability, and the
fairness rules (trap density, victory-lap zone, spawn safety).
