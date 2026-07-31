// Title: dark pen, a flickering lamp, the logo, and a level select.
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants.js';
import { LEVELS } from '../levels/index.js';
import { sfx } from '../audio/sfx.js';

const FONT = 'Courier New, monospace';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setBackgroundColor('#0b0e14');
    sfx.stopAmbient();

    // ambience: a lone lamp fixture flickering over a pen
    const onFrame = this.registry.get('sheets').lamp.frameIndex.on[0];
    const lamp = this.add.sprite(GAME_W / 2, 120, 'lamp', 0).setScale(4);
    this.time.addEvent({
      delay: 900, loop: true,
      callback: () => {
        if (Math.random() < 0.6) {
          lamp.setFrame(onFrame);
          this.time.delayedCall(120, () => lamp.setFrame(0));
        }
      },
    });
    this.add.sprite(GAME_W / 2 - 160, 130, 'caged-lizard', 0).setScale(3).setAlpha(0.5);
    this.add.sprite(GAME_W / 2 + 160, 130, 'jar', 0).setScale(3).setAlpha(0.6);

    this.add.text(GAME_W / 2, 210, 'KEEP YOUR TAIL', {
      fontFamily: FONT, fontSize: '54px', color: '#5cb85c', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 258, "a lizard's escape in three climbs", {
      fontFamily: FONT, fontSize: '17px', color: '#8a94a0',
    }).setOrigin(0.5);

    const unlocked = this.registry.get('unlocked') ?? 0;
    const names = LEVELS.map((l, i) => {
      const open = i <= unlocked;
      return `${i + 1}. ${open ? l.name : '???'}`;
    });
    this.add.text(GAME_W / 2, 340, names.join('      '), {
      fontFamily: FONT, fontSize: '16px', color: '#5c6e7d',
    }).setOrigin(0.5);

    this.add.text(GAME_W / 2, 400, 'ENTER — begin the escape', {
      fontFamily: FONT, fontSize: '20px', color: '#e8ecf0',
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 440, 'arrows/WASD move · SPACE/W/↑ jump · hold toward a wall to climb it · protect your tail', {
      fontFamily: FONT, fontSize: '13px', color: '#5c6e7d',
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 464, `press 1-${Math.min(unlocked + 1, LEVELS.length)} to jump to an unlocked level · M mute`, {
      fontFamily: FONT, fontSize: '13px', color: '#3d4a56',
    }).setOrigin(0.5);

    this.registry.set('lastCardLevel', null);
    this.registry.set('runStart', 0);
    this.registry.set('totalFails', 0);
    this.registry.set('failCount', 0);

    this.input.keyboard.on('keydown-ENTER', () => this.start(0));
    for (let i = 0; i < LEVELS.length; i++) {
      this.input.keyboard.on(`keydown-${['ONE', 'TWO', 'THREE'][i]}`, () => {
        if (i <= (this.registry.get('unlocked') ?? 0)) this.start(i);
      });
    }
  }

  start(i) {
    sfx.play('door');
    this.scene.start('Game', { level: i });
  }
}
