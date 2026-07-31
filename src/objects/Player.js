// The gecko. State machine: GROUNDED / AIRBORNE / CLING_LEFT / CLING_RIGHT /
// TAIL_LOST. Auto-cling: touching a wall while airborne clings unless the
// player holds the direction away from that wall (that hold is also the
// release input while clinging).
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
    this.dropNoClingUntil = now;   // no-cling after pressing away to release
    this.dropNoClingSide = null;

    this.peekHeld = 0;             // ms Up has been held (for camera peek)

    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = scene.input.keyboard;
    this.keys = {
      left: [kb.addKey(K.LEFT), kb.addKey(K.A)],
      right: [kb.addKey(K.RIGHT), kb.addKey(K.D)],
      up: [kb.addKey(K.UP), kb.addKey(K.W)],
      down: [kb.addKey(K.DOWN), kb.addKey(K.S)],
      jump: [kb.addKey(K.SPACE)],
    };

    this.frameIndex = scene.registry.get('sheets').gecko.frameIndex;
    this.setFrame(this.frameIndex.fall[0]);
  }

  // --- input helpers ---
  held(name) { return this.keys[name].some((k) => k.isDown); }
  pressed(name) { return this.keys[name].some((k) => Phaser.Input.Keyboard.JustDown(k)); }
  released(name) { return this.keys[name].some((k) => Phaser.Input.Keyboard.JustUp(k)); }

  // Tail anchor point (world coords) — where the follower tail attaches.
  tailAnchor() {
    if (this.pstate === PSTATE.CLING_LEFT) return { x: this.x + 3, y: this.y + 10 };
    if (this.pstate === PSTATE.CLING_RIGHT) return { x: this.x - 3, y: this.y + 10 };
    return { x: this.x - this.facing * 8, y: this.y + 6 };
  }

  // Is the wall tile beside the body on `side` unusable (barbed)?
  wallNoCling(side) {
    const px = side === 'left' ? this.body.left - 2 : this.body.right + 2;
    const t = this.layer.getTileAtWorldXY(px, this.body.center.y);
    return !!t?.properties?.noCling;
  }

  canCling(side, now) {
    if (this.held(side === 'left' ? 'right' : 'left')) return false; // holding away refuses
    if (this.restickSide === side && now < this.restickUntil) return false;
    if (this.dropNoClingSide === side && now < this.dropNoClingUntil) return false;
    if (this.wallNoCling(side)) return false;
    return true;
  }

  enterCling(side, now) {
    this.pstate = side === 'left' ? PSTATE.CLING_LEFT : PSTATE.CLING_RIGHT;
    this.clingSide = side;
    this.body.setAllowGravity(false);
    this.body.setAcceleration(0, 0);
    this.body.setDrag(0, 0);
    this.body.setVelocity(0, 0);
    this.setFlipX(side === 'right'); // cling art is drawn wall-left
    this.scene.events.emit('player-cling', this);
    sfx.play('cling');
    this.squash(0.85, 1.1);
    // Buffered jump converts to an instant wall-jump on contact.
    if (now < this.bufferUntil) {
      this.bufferUntil = -Infinity;
      this.wallJump(now);
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

    // Jump buffering (recorded regardless of state).
    if (this.pressed('jump')) this.bufferUntil = now + T.BUFFER_MS;

    // Variable jump cut.
    if (this.released('jump') && b.velocity.y < T.JUMP_CUT_MIN_VY) {
      b.setVelocityY(b.velocity.y * T.JUMP_CUT);
    }

    // Camera peek bookkeeping (GameScene reads peekHeld).
    const idleCling = (this.pstate === PSTATE.CLING_LEFT || this.pstate === PSTATE.CLING_RIGHT) && !down;
    if (up && (this.pstate === PSTATE.GROUNDED || idleCling)) this.peekHeld += delta;
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

        // jump (incl. buffered)
        if (now < this.bufferUntil) {
          this.bufferUntil = -Infinity;
          this.groundJump();
          break;
        }
        // climb onto an adjacent wall by pushing into it + Up
        if (up && dir !== 0) {
          const side = dir === -1 ? 'left' : 'right';
          if ((side === 'left' ? b.blocked.left : b.blocked.right) && this.canCling(side, now)) {
            this.enterCling(side, now);
            break;
          }
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

        // wall-jump
        if (now < this.bufferUntil) {
          this.bufferUntil = -Infinity;
          this.wallJump(now);
          break;
        }
        // release by pressing away
        if (this.held(side === 'left' ? 'right' : 'left')) {
          this.exitClingToAir(now);
          b.setVelocityX(side === 'left' ? 60 : -60);
          this.dropNoClingSide = side;
          this.dropNoClingUntil = now + T.DROP_NOCLING_MS;
          break;
        }
        // climbing into a barbed (noCling) stretch detaches — never silently holds
        if (this.wallNoCling(side)) {
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
