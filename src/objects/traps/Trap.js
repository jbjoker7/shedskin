// Base trap contract. Traps expose hurt shapes only while dangerous; the
// TrapManager tests them against the player body and tail hurtbox each frame.
// Shapes: { rect: Phaser.Geom.Rectangle } or { circle: Phaser.Geom.Circle }.
export class Trap {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }
  // kindness: telegraph duration multiplier (>= 1) from the kindness valve.
  update(time, delta, kindness) {} // eslint-disable-line no-unused-vars
  getHurtShapes() { return []; }
  destroy() {}
}
