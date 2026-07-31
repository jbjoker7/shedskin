// The gecko. State machine: GROUNDED / AIRBORNE / CLING_LEFT / CLING_RIGHT /
// TAIL_LOST. Hold-to-cling: the gecko grabs a wall only while the player holds
// the direction INTO it; releasing that hold lets go. While clinging, Up/W
// climbs (not jumps), Down climbs down fast, Space wall-jumps.
// Everywhere else Space, Up, and W all jump.
//
// Arcade cling trick: while clinging, gravity is off and a constant micro-push
// into the wall keeps body.blocked.<side> true so the state doesn't flicker.
import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning.js';
import { TILE } from '../constants.js';
import { DEPTH } from '../constants.js';
import { sfx } from '../audio/sfx.js';

export const PSTATE = {
  GROUNDED: 'grounded',
  AIRBORNE: 'airborne',
  CLING_LEFT: 'cling_left',
  CLING_RIGHT: 'cling_right',
  TAIL_LOST: 'tail_lost',
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, layer) {
    super(scene, x, y, 'gecko', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.layer = layer;
    this.setDepth(DEPTH.PLAYER);
    this.body.setSize(10, 16).setOffset(3, 8);
    this.body.setMaxVelocity(300, T.MAX_FALL);
    this.setCollideWorldBounds(true);

    this.pstate = PSTATE.AIRBORNE;
    this.facing = 1; // 1 right, -1 left (horizontal poses face right)
    this.clingSide = null;

    const now = -Infinity;
    this.coyoteUntil = now;        // ground coyote
    this.wallCoyoteUntil = now;    // wall coyote
    this.wallCoyoteSide = null;
    this.bufferUntil = now;        // jump buffer
    this.hlockUntil = now;         // horizontal input lock after wall-jump
    this.restickUntil = now;       // same-side re-stick lockout
    this.restickSide = null;
    this.jumpCutArmed = false;     // variable-height cut only applies to real jumps
    this.bufferFromSpace = false;  // was the buffered jump a Space press?

    this.peekHeld = 0;             // ms Down held while standing (camera scout peek)

    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = scene.input.keyboard;
    this.keys = {
      left: [kb.addKey(K.LEFT), kb.addKey(K.A)],
      right: [kb.addKey(K.RIGHT), kb.addKey(K.D)],
      up: [kb.addKey(K.UP), kb.addKey(K.W)],      // climb up on walls, jump elsewhere
      down: [kb.addKey(K.DOWN), kb.addKey(K.S)],
      space: [kb.addKey(K.SPACE)],                 // jump / wall-jump always
    };

    this.frameIndex = scene.registry.get('sheets').gecko.frameIndex;
    this.setFrame(this.frameIndex.fall[0]);
  }

  // --- input helpers (map-then-some so every key's JustDown flag is consumed) ---
  held(name) { return this.keys[name].some((k) => k.isDown); }
  pressed(name) { return this.keys[name].map((k) => Phaser.Input.Keyboard.JustDown(k)).some(Boolean); }
  released(name) { return this.keys[name].map((k) => Phaser.Input.Keyboard.JustUp(k)).some(Boolean); }

  // Tail anchor point (world coords) — where the follower tail attaches.
  tailAnchor() {
    if (this.pstate === PSTATE.CLING_LEFT) return { x: this.x - 1, y: this.y + 9 };
    if (this.pstate === PSTATE.CLING_RIGHT) return { x: this.x + 1, y: this.y + 9 };
    return { x: this.x - this.facing * 7, y: this.y + 7 };
  }

  // Unit vector the tail hangs along when the player isn't moving: straight
  // down on a wall, trailing behind (and slightly down) on the ground/in air.
  tailRestDir() {
    if (this.pstate === PSTATE.CLING_LEFT || this.pstate === PSTATE.CLING_RIGHT) {
      return { x: 0, y: 1 };
    }
    const len = Math.hypot(1, 0.35);
    return { x: -this.facing / len, y: 0.35 / len };
  }

  // The tile beside the body on `side`, or null (world edge / open air).
  wallTile(side) {
    const px = side === 'left' ? this.body.left - 2 : this.body.right + 2;
    return this.layer.getTileAtWorldXY(px, this.body.center.y);
  }

  // Barbed wall — grabbing it is refused and an existing grip lets go.
  // Deliberately separate from "no tile here": a missing tile while climbing
  // means the wall ENDED, which is a mantle, not a detach.
  wallBarbed(side) {
    return !!this.wallTile(side)?.properties?.noCling;
  }

  canCling(side, now) {
    if (!this.held(side)) return false; // must be pressing INTO the wall
    if (this.restickSide === side && now < this.restickUntil) return false;
    const t = this.wallTile(side);
    if (!t || !t.collides) return false; // world bounds are not climbable
    return !t.properties.noCling;
  }

  enterCling(side, now) {
    this.pstate = side === 'left' ? PSTATE.CLING_LEFT : PSTATE.CLING_RIGHT;
    this.clingSide = side;
    this.jumpCutArmed = false;
    this.body.setAllowGravity(false);
    this.body.setAcceleration(0, 0);
    this.body.setDrag(0, 0);
    this.body.setVelocity(0, 0);
    this.setFlipX(side === 'right'); // cling art is drawn wall-left
    this.scene.events.emit('player-cling', this);
    sfx.play('cling');
    this.squash(0.85, 1.1);
    // A buffered SPACE converts to an instant wall-jump on contact (that's the
    // chain-climbing tech). A buffered W/Up must not: pressing up while
    // steering into a wall is climb intent, so it just starts the climb.
    if (now < this.bufferUntil && this.bufferFromSpace) {
      this.bufferUntil = -Infinity;
      this.wallJump(now);
    } else {
      this.bufferUntil = -Infinity;
    }
  }

  exitClingToAir(now, { coyote = true } = {}) {
    if (coyote) {
      this.wallCoyoteUntil = now + T.COYOTE_MS;
      this.wallCoyoteSide = this.clingSide;
    }
    this.pstate = PSTATE.AIRBORNE;
    this.clingSide = null;
    this.body.setAllowGravity(true);
  }

  groundJump() {
    this.body.setVelocityY(-T.JUMP_VEL);
    this.pstate = PSTATE.AIRBORNE;
    this.coyoteUntil = -Infinity;
    this.jumpCutArmed = true;
    this.squash(0.85, 1.15);
    sfx.play('jump');
    this.scene.events.emit('player-jump', this);
  }

  wallJump(now, sideOverride = null) {
    const side = sideOverride ?? this.clingSide ?? this.wallCoyoteSide;
    if (!side) return;
    this.body.setAllowGravity(true);
    this.body.setVelocity(side === 'left' ? T.WALLJUMP_VX : -T.WALLJUMP_VX, -T.WALLJUMP_VY);
    this.facing = side === 'left' ? 1 : -1;
    this.hlockUntil = now + T.WALLJUMP_HLOCK_MS;
    this.restickSide = side;
    this.restickUntil = now + T.RESTICK_LOCK_MS;
    this.wallCoyoteUntil = -Infinity;
    this.pstate = PSTATE.AIRBORNE;
    this.clingSide = null;
    this.jumpCutArmed = true;
    this.squash(1.15, 0.85);
    sfx.play('jump');
    this.scene.events.emit('player-walljump', this, side);
  }

  squash(sx, sy) {
    this.setScale(sx, sy);
    this.scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
  }

  // Called by GameScene when the tail is taken. Locks the player out.
  onTailLost() {
    this.pstate = PSTATE.TAIL_LOST;
    this.body.setAllowGravity(true);
    this.body.setAcceleration(0, 0);
    this.setTint(0xff4444);
    this.setFrame(this.frameIndex.fall[0]);
  }

  update(time, delta) {
    if (this.pstate === PSTATE.TAIL_LOST) return;
    const now = time;
    const b = this.body;
    const left = this.held('left'), right = this.held('right');
    const up = this.held('up'), down = this.held('down');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const clinging = this.pstate === PSTATE.CLING_LEFT || this.pstate === PSTATE.CLING_RIGHT;

    // Read every jump key's edge flags EVERY frame. Phaser latches JustDown/
    // JustUp until something reads them, so a skipped read (short-circuit or a
    // guarded branch) leaks a stale press into a later frame and eats a jump.
    const spacePressed = this.pressed('space');
    const upPressed = this.pressed('up');
    const spaceReleased = this.released('space');
    const upReleased = this.released('up');

    // Jump buffering: Space always; Up/W only when not on a wall (there it climbs).
    if (spacePressed || (upPressed && !clinging)) {
      this.bufferUntil = now + T.BUFFER_MS;
      this.bufferFromSpace = spacePressed;
    }

    // Variable jump cut — only while an actual jump is in flight.
    if (this.jumpCutArmed && (spaceReleased || upReleased)
        && b.velocity.y < T.JUMP_CUT_MIN_VY) {
      b.setVelocityY(b.velocity.y * T.JUMP_CUT);
      this.jumpCutArmed = false;
    }

    // Camera scout peek: hold Down while standing still (GameScene reads peekHeld).
    if (down && this.pstate === PSTATE.GROUNDED && Math.abs(b.velocity.x) < 10) this.peekHeld += delta;
    else this.peekHeld = 0;

    switch (this.pstate) {
      case PSTATE.GROUNDED: {
        b.setAllowGravity(true);
        // run
        if (now < this.hlockUntil) {
          b.setAcceleration(0, 0);
        } else if (dir !== 0) {
          b.setAcceleration(dir * T.RUN_ACCEL, 0);
          b.setDrag(0, 0);
          this.facing = dir;
        } else {
          b.setAcceleration(0, 0);
          b.setDrag(T.RUN_DRAG, 0);
        }
        b.maxVelocity.x = T.RUN_SPEED;

        // climb onto an adjacent wall by pushing into it + Up (checked BEFORE
        // the jump so W against a wall means "start climbing", not "hop")
        if (up && dir !== 0) {
          const side = dir === -1 ? 'left' : 'right';
          if ((side === 'left' ? b.blocked.left : b.blocked.right) && this.canCling(side, now)) {
            this.bufferUntil = -Infinity; // the Up press was climb intent, not a jump
            this.enterCling(side, now);
            break;
          }
        }
        // jump (incl. buffered)
        if (now < this.bufferUntil) {
          this.bufferUntil = -Infinity;
          this.groundJump();
          break;
        }
        // walked off a ledge
        if (!b.blocked.down) {
          this.pstate = PSTATE.AIRBORNE;
          this.coyoteUntil = now + T.COYOTE_MS;
          break;
        }
        // anims
        if (Math.abs(b.velocity.x) > 10) this.play('gecko-walk', true);
        else this.play('gecko-idle', true);
        this.setFlipX(this.facing === -1);
        break;
      }

      case PSTATE.AIRBORNE: {
        b.setAllowGravity(true);
        b.setDrag(0, 0);
        b.maxVelocity.x = 300; // let wall-jump vx (240) breathe; accel rule below caps steering
        // air control (locked briefly after wall-jump). Only accelerate when
        // below run speed or counter-steering — preserves wall-jump arcs
        // without air drag.
        if (now >= this.hlockUntil && dir !== 0) {
          const vx = b.velocity.x;
          if (Math.sign(vx) !== dir || Math.abs(vx) < T.RUN_SPEED) {
            b.setAcceleration(dir * T.AIR_ACCEL, 0);
          } else {
            b.setAcceleration(0, 0);
          }
          this.facing = dir;
        } else {
          b.setAcceleration(0, 0);
        }

        // coyote jumps
        if (now < this.bufferUntil) {
          if (now < this.coyoteUntil) {
            this.bufferUntil = -Infinity;
            this.groundJump();
            break;
          }
          if (now < this.wallCoyoteUntil && this.wallCoyoteSide) {
            this.bufferUntil = -Infinity;
            this.wallJump(now, this.wallCoyoteSide);
            break;
          }
        }

        // land
        if (b.blocked.down) {
          this.pstate = PSTATE.GROUNDED;
          this.jumpCutArmed = false;
          this.squash(1.2, 0.8);
          sfx.play('land');
          this.scene.events.emit('player-land', this);
          if (now < this.bufferUntil) {
            this.bufferUntil = -Infinity;
            this.groundJump();
          }
          break;
        }
        // auto-cling
        if (b.blocked.left && this.canCling('left', now)) { this.enterCling('left', now); break; }
        if (b.blocked.right && this.canCling('right', now)) { this.enterCling('right', now); break; }

        this.setFrame(b.velocity.y < 0 ? this.frameIndex.jump[0] : this.frameIndex.fall[0]);
        this.anims.stop();
        this.setFlipX(this.facing === -1);
        break;
      }

      case PSTATE.CLING_LEFT:
      case PSTATE.CLING_RIGHT: {
        const side = this.pstate === PSTATE.CLING_LEFT ? 'left' : 'right';
        const blockedIntoWall = side === 'left' ? b.blocked.left : b.blocked.right;

        // wall-jump (Space; or a jump buffered just before grabbing)
        if (now < this.bufferUntil) {
          this.bufferUntil = -Infinity;
          this.wallJump(now);
          break;
        }
        // hold-to-cling: releasing the into-wall direction lets go
        if (!this.held(side)) {
          this.exitClingToAir(now); // wall coyote window still allows a late wall-jump
          break;
        }
        // climbing into a barbed stretch detaches — never silently holds
        if (this.wallBarbed(side)) {
          this.exitClingToAir(now);
          break;
        }
        // mantle: wall ended while climbing up
        if (up && !blockedIntoWall) {
          this.exitClingToAir(now, { coyote: false });
          b.setVelocityY(T.MANTLE_VY);
          b.setVelocityX(side === 'left' ? -T.MANTLE_VX : T.MANTLE_VX);
          this.scene.events.emit('player-mantle', this);
          break;
        }
        // wall vanished some other way (e.g. climbed down past its end)
        if (!blockedIntoWall && !up) {
          this.exitClingToAir(now);
          break;
        }

        // stick + climb
        b.setAllowGravity(false);
        b.setAcceleration(0, 0);
        b.setVelocityX(side === 'left' ? -T.CLING_PUSH : T.CLING_PUSH);
        if (up) b.setVelocityY(-T.CLIMB_UP);
        else if (down) b.setVelocityY(T.CLIMB_DOWN);
        else b.setVelocityY(0);

        // reached the floor while climbing down
        if (b.blocked.down && down) {
          this.body.setAllowGravity(true);
          this.pstate = PSTATE.GROUNDED;
          this.clingSide = null;
          break;
        }

        if (up || down) this.play('gecko-climb', true);
        else { this.anims.stop(); this.setFrame(this.frameIndex.cling[0]); }
        this.setFlipX(side === 'right');
        break;
      }
    }
  }
}
