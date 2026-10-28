import Phaser from 'phaser';

export const FONT = 'monospace';

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size = 8,
  colour = '#e8e8f0',
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, value, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color: colour,
      resolution: 1,
    })
    .setShadow(0, 1, '#000000', 0, false, true);
}

export function scrim(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.78,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, 0x0b0d16, alpha).setOrigin(0, 0);
}

export function promptLine(
  scene: Phaser.Scene,
  y: number,
  value: string,
): Phaser.GameObjects.Text {
  scrim(scene, 0, y - 5, 384, 14, 0.8).setDepth(89);
  return text(scene, 8, y, value, 8, '#ffffff').setDepth(90);
}
