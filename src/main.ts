import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CityScene } from './scenes/CityScene';
import { JobScene } from './scenes/JobScene';
import { state } from './state';

// QA hook: lets a headless browser assert on game state without reading pixels
(window as unknown as { __cit: typeof state }).__cit = state;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 384,
  height: 216,
  pixelArt: true,
  backgroundColor: '#0b0d16',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, CityScene, JobScene],
});
