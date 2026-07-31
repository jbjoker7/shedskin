// Owns every trap in the level: updates them, then tests their hurt shapes
// against the player's body rect and the tail's trailing hurtbox. One rule:
// any harmful overlap = tail loss.
import Phaser from 'phaser';

const { RectangleToRectangle, CircleToRectangle } = Phaser.Geom.Intersects;

export class TrapManager {
  constructor(scene) {
    this.scene = scene;
    this.traps = [];
  }

  add(trap) { this.traps.push(trap); return trap; }

  update(time, delta, kindness, checkHits) {
    for (const trap of this.traps) trap.update(time, delta, kindness);
    if (!checkHits) return;

    const player = this.scene.player;
    const tail = this.scene.tail;
    const bodyRect = new Phaser.Geom.Rectangle(
      player.body.x, player.body.y, player.body.width, player.body.height,
    );
    const tailRect = tail?.attached ? tail.hurtRect : null;

    for (const trap of this.traps) {
      for (const shape of trap.getHurtShapes()) {
        const hitBody = shape.rect
          ? RectangleToRectangle(shape.rect, bodyRect)
          : CircleToRectangle(shape.circle, bodyRect);
        const hitTail = tailRect && (shape.rect
          ? RectangleToRectangle(shape.rect, tailRect)
          : CircleToRectangle(shape.circle, tailRect));
        if (hitBody || hitTail) {
          this.scene.onTailLoss(trap);
          return;
        }
      }
    }
  }

  destroy() {
    for (const trap of this.traps) trap.destroy();
    this.traps = [];
  }
}
