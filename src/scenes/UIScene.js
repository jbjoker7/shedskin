// Overlay scene at zoom 1 (crisp text over the zoomed game). Absorbs the
// level intro card, fail card, win card, and HUD — driven by game.events.
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants.js';

const FONT = 'Courier New, monospace';

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.cardGroup = null;
    this.awaitKey = null;

    // ---- HUD ----
    this.levelText = this.add.text(14, 10, '', {
      fontFamily: FONT, fontSize: '16px', color: '#8a94a0',
    });
    // right-edge progress bar
    const barX = GAME_W - 22, barTop = 60, barH = GAME_H - 120;
    this.add.rectangle(barX, barTop + barH / 2, 4, barH, 0x3d4a56, 0.6);
    this.add.text(barX - 7, barTop - 24, '☀', { fontSize: '15px', color: '#f2c811' });
    this.playerPip = this.add.rectangle(barX, barTop + barH, 10, 4, 0x5cb85c);
    this.collectorPip = this.add.rectangle(barX, barTop + barH, 10, 4, 0xe23b2e).setVisible(false);
    this.barTop = barTop; this.barH = barH;

    this.muteText = this.add.text(14, GAME_H - 24, 'M mute · R restart', {
      fontFamily: FONT, fontSize: '12px', color: '#5c6e7d',
    });

    // ---- events from GameScene ----
    const g = this.game.events;
    this.onLevelStart = (info) => {
      this.levelText.setText(info.name.toUpperCase());
      this.clearCard();
      if (this.registry.get('lastCardLevel') !== info.index) {
        this.registry.set('lastCardLevel', info.index);
        this.showLevelCard(info);
      }
    };
    this.onTailLost = () => this.showFailCard();
    this.onLevelComplete = (info) => (info.isLast ? this.showWinScreen(info) : this.showClearCard(info));
    this.onProgress = (p) => {
      this.playerPip.y = this.barTop + this.barH * (1 - Phaser.Math.Clamp(p.player, 0, 1));
      if (p.collector !== null && p.collector > 0) {
        this.collectorPip.setVisible(true);
        this.collectorPip.y = this.barTop + this.barH * (1 - Phaser.Math.Clamp(p.collector, 0, 1));
      }
    };
    this.onCollector = () => this.flashText('THE COLLECTOR IS COMING. CLIMB.');

    g.on('level-start', this.onLevelStart);
    g.on('tail-lost', this.onTailLost);
    g.on('level-complete', this.onLevelComplete);
    g.on('hud-progress', this.onProgress);
    g.on('collector-triggered', this.onCollector);
    this.events.once('shutdown', () => {
      g.off('level-start', this.onLevelStart);
      g.off('tail-lost', this.onTailLost);
      g.off('level-complete', this.onLevelComplete);
      g.off('hud-progress', this.onProgress);
      g.off('collector-triggered', this.onCollector);
    });
  }

  clearCard() {
    this.cardGroup?.destroy(true);
    this.cardGroup = null;
    if (this.awaitKey) { this.input.keyboard.off('keydown', this.awaitKey); this.awaitKey = null; }
  }

  makeCard(alpha = 0.75) {
    this.clearCard();
    this.cardGroup = this.add.container(0, 0);
    const bg = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0e14, alpha);
    this.cardGroup.add(bg);
    return this.cardGroup;
  }

  text(x, y, str, size, color = '#e8ecf0') {
    const t = this.add.text(x, y, str, {
      fontFamily: FONT, fontSize: `${size}px`, color, align: 'center',
    }).setOrigin(0.5);
    this.cardGroup.add(t);
    return t;
  }

  showLevelCard(info) {
    this.makeCard(0.85);
    const n = info.index === 'test' ? '?' : info.index + 1;
    this.text(GAME_W / 2, GAME_H / 2 - 30, `LEVEL ${n} — ${info.name.toUpperCase()}`, 30);
    if (info.subtitle) this.text(GAME_W / 2, GAME_H / 2 + 14, info.subtitle, 16, '#8a94a0');
    this.time.delayedCall(1400, () => this.clearCard());
  }

  showFailCard() {
    // brief card during the auto-restart fade; no input needed
    this.time.delayedCall(250, () => {
      if (!this.scene.get('Game') || this.scene.get('Game').state !== 'dying') return;
      this.makeCard(0.55);
      this.text(GAME_W / 2, GAME_H / 2 - 10, 'THEY GOT YOUR TAIL.', 32, '#e23b2e');
    });
  }

  showClearCard(info) {
    this.makeCard(0.8);
    this.text(GAME_W / 2, GAME_H / 2 - 40, 'LEVEL CLEAR', 34, '#5cb85c');
    this.text(GAME_W / 2, GAME_H / 2 + 8, 'the climb continues', 16, '#8a94a0');
    this.text(GAME_W / 2, GAME_H / 2 + 60, 'press any key', 14, '#5c6e7d');
    this.waitForKey();
  }

  showWinScreen(info) {
    this.makeCard(0.92);
    const mins = Math.floor(info.elapsedMs / 60000);
    const secs = Math.floor((info.elapsedMs % 60000) / 1000);
    this.text(GAME_W / 2, GAME_H / 2 - 80, 'FREE.', 52, '#f4b8a0');
    this.text(GAME_W / 2, GAME_H / 2 - 20, 'YOU ESCAPED — TAIL INTACT', 24, '#5cb85c');
    this.text(GAME_W / 2, GAME_H / 2 + 30,
      `time: ${mins}m ${String(secs).padStart(2, '0')}s   ·   tails left behind: ${info.totalFails}`,
      16, '#8a94a0');
    this.text(GAME_W / 2, GAME_H / 2 + 90, 'press any key', 14, '#5c6e7d');
    this.waitForKey();
  }

  waitForKey() {
    this.awaitKey = () => {
      this.awaitKey = null;
      this.clearCard();
      this.scene.get('Game').advance();
    };
    // slight delay so a held key from gameplay doesn't skip the card instantly
    this.time.delayedCall(400, () => {
      if (this.awaitKey) this.input.keyboard.once('keydown', this.awaitKey);
    });
  }

  flashText(str) {
    const t = this.add.text(GAME_W / 2, 90, str, {
      fontFamily: FONT, fontSize: '20px', color: '#e23b2e', align: 'center',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, duration: 500,
      delay: 1800, onComplete: () => t.destroy(),
    });
  }
}
