import Phaser from 'phaser';
import { load } from '../state';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('map', 'img/map.png');
    this.load.image('job', 'img/job.png');
    this.load.image('prison', 'img/prison.png');
  }

  create(): void {
    load();

    // the player is drawn once into a texture: hair, face, shirt, legs
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x14131c, 1).fillRect(2, 0, 8, 5);
    g.fillStyle(0xf0b98a, 1).fillRect(3, 4, 6, 3);
    g.fillStyle(0x14131c, 1).fillRect(4, 5, 1, 1);
    g.fillStyle(0x14131c, 1).fillRect(7, 5, 1, 1);
    g.fillStyle(0x4fa3ff, 1).fillRect(1, 7, 10, 6);
    g.fillStyle(0x2f6fb5, 1).fillRect(5, 8, 2, 4);
    g.fillStyle(0x343a54, 1).fillRect(2, 13, 3, 2);
    g.fillStyle(0x343a54, 1).fillRect(7, 13, 3, 2);
    g.generateTexture('player', 12, 15);
    g.destroy();

    this.scene.start('City');
  }
}
