import Phaser from 'phaser';
import { state, save, addMoney, addMinutes, addMastery } from '../state';
import { text, scrim, promptLine } from '../ui';

type Step = 'diagnose' | 'explain' | 'done';

export class JobScene extends Phaser.Scene {
  private step: Step = 'diagnose';
  private overlay: Phaser.GameObjects.Container | null = null;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('Job');
  }

  create(): void {
    this.step = 'diagnose';
    this.add.image(0, 0, 'job').setOrigin(0);

    // three hit zones exactly over the printed answers
    [0, 1, 2].forEach((i) => {
      const zone = this.add
        .rectangle(i * 128, 190, 128, 18, 0x000000, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => zone.setFillStyle(0x46e0e6, 0.12));
      zone.on('pointerout', () => zone.setFillStyle(0x000000, 0.001));
      zone.on('pointerdown', () => this.answer(i));
    });

    this.hint = promptLine(this, 196, 'choose a diagnosis   1-3');

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.answer(0));
    kb.on('keydown-TWO', () => this.answer(1));
    kb.on('keydown-THREE', () => this.answer(2));
    kb.on('keydown-ENTER', () => this.advance());
    kb.on('keydown-SPACE', () => this.advance());

    // iPad: tapping anywhere above the answer row advances the result panel
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 185 && this.step !== 'diagnose') this.advance();
    });
  }

  private clearOverlay(): void {
    this.overlay?.destroy();
    this.overlay = null;
  }

  private panel(lines: { s: string; c?: string; size?: number }[], footer: string): void {
    this.clearOverlay();
    const c = this.add.container(0, 0).setDepth(50);
    c.add(scrim(this, 0, 40, 384, 140, 0.9));
    c.add(this.add.rectangle(0, 40, 384, 1, 0x46e0e6).setOrigin(0, 0));
    let y = 52;
    for (const l of lines) {
      const t = text(this, 16, y, l.s, l.size ?? 8, l.c ?? '#e8e8f0');
      c.add(t);
      y += (l.size ?? 8) + 7;
    }
    c.add(text(this, 16, 166, footer, 8, '#9aa0b8'));
    this.overlay = c;
    this.hint.setText(footer);
  }

  private answer(i: number): void {
    if (this.step !== 'diagnose') return;

    if (i === 1) {
      // correct: gateway is wrong / not forwarding
      addMastery('gateway', 40);
      this.step = 'explain';
      this.panel(
        [
          { s: 'correct.', c: '#5ce08a' },
          { s: 'the LAN peer answers (1ms), 8.8.8.8 times out.' },
          { s: 'no path off the subnet: the gateway was never set.' },
          { s: 'you set it. the card reader is back.' },
        ],
        'then: tell her what happened   enter',
      );
      return;
    }

    addMinutes(4);
    state.energy = Math.max(0, state.energy - 1);
    save();
    this.panel(
      [
        { s: 'wrong. four minutes gone.', c: '#ff3b5c' },
        { s: i === 0 ? 'a /24 mask with a peer answering on .50 is fine.' : 'the printer is powered on and idle.' },
        { s: 'the evidence says the subnet cannot reach the internet.' },
        { s: 'chan tai is watching the queue grow.' },
      ],
      'try again  1-3',
    );
  }

  private advance(): void {
    if (this.step === 'diagnose') return;

    if (this.step === 'explain') {
      this.step = 'done';
      addMoney(450);
      if (!state.done.includes('chantai')) state.done.push('chantai');
      addMinutes(20);
      save();
      this.panel(
        [
          { s: '+ $450', c: '#ffc84a', size: 10 },
          { s: 'chan tai pays in cash and gives you a bag of buns.' },
          { s: 'mastery  gateway +40' },
          { s: 'the wire will carry your name for an hour.' },
        ],
        'back to the road   enter',
      );
      return;
    }

    this.clearOverlay();
    this.scene.start('City');
  }
}
