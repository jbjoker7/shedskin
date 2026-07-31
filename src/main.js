import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants.js';
import { TUNING } from './config/tuning.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b0e14',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: TUNING.GRAVITY_Y },
      debug: new URLSearchParams(location.search).has('debug'),
    },
  },
  scene: [BootScene, TitleScene, GameScene, UIScene],
});

if (import.meta.env.DEV) window.__game = game;
