import Phaser from 'phaser';
import { state, save, clock } from '../state';
import { text, scrim, promptLine } from '../ui';

type Spot = {
  x: number;
  y: number;
  r: number;
  label: string;
  job?: boolean;
};

const WALK = { minX: 10, maxX: 374, minY: 102, maxY: 158 };

const WIRE = [
  'AMING BOUGHT THE 2-BED IN TSUEN WAN - $4.2M',
  'PARTS +12% AT GOLDEN ARCADE - CAT6 DRUM $680',
  'NEW WARDEN AT STANLEY PRISON - VISITOR IT DOWN',
  'MISS CHAN PASSED NETWORK SPECIALIST',
  'TYPHOON T8 - THE 6 BUS IS SUSPENDED',
];

export class CityScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private clockText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private wireText!: Phaser.GameObjects.Text;
  private wireIndex = 0;
  private spots: Spot[] = [];
  private target: Phaser.Math.Vector2 | null = null;
  private near: Spot | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('City');
  }

  create(): void {
    this.add.image(0, 0, 'map').setOrigin(0).setDepth(0);

    this.spots = [
      { x: 44, y: 108, r: 18, label: state.done.includes('chantai') ? 'chan tai - paid already' : 'talk to chan tai', job: !state.done.includes('chantai') },
      { x: 78, y: 98, r: 13, label: 'store - closed' },
      { x: 122, y: 98, r: 15, label: 'stanley restaurant - no ticket yet' },
      { x: 182, y: 100, r: 15, label: 'college gate - mr lau is not in' },
      { x: 332, y: 96, r: 15, label: 'stanley prison - number 99' },
      { x: 372, y: 100, r: 14, label: 'stanley fort - no entry' },
    ];

    this.player = this.add.image(state.x, state.y, 'player').setDepth(20);
    this.player.setPosition(
      Phaser.Math.Clamp(state.x, WALK.minX, WALK.maxX),
      Phaser.Math.Clamp(state.y, WALK.minY, WALK.maxY),
    );

    // ---- HUD
    scrim(this, 0, 12, 384, 14, 0.6).setDepth(80);
    text(this, 8, 15, 'tung tau wan rd', 8, '#9aa0b8').setDepth(81);
    this.clockText = text(this, 274, 15, clock(), 8, '#ffffff').setDepth(81);
    this.moneyText = text(this, 312, 15, `$${state.money}`, 8, '#ffc84a').setDepth(81);
    this.energyText = text(this, 358, 15, '', 8, '#5ce08a').setDepth(81);

    // ---- wire
    this.add.rectangle(0, 0, 384, 10, 0x0b0d16, 0.8).setOrigin(0, 0).setDepth(80);
    this.add.rectangle(0, 0, 384, 1, 0x5ce08a, 0.9).setOrigin(0, 0).setDepth(81);
    text(this, 4, 1, 'WIRE', 8, '#5ce08a').setDepth(82);
    this.wireText = text(this, 40, 1, WIRE[0], 8, '#e8e8f0').setDepth(82);

    this.prompt = promptLine(this, 196, 'wasd move    e interact');

    // ---- input
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const wx = p.worldX;
      const wy = p.worldY;
      const hit = this.spotAt(wx, wy);
      if (hit) this.activate(hit);
      else this.target = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(wx, WALK.minX, WALK.maxX),
        Phaser.Math.Clamp(wy, WALK.minY, WALK.maxY),
      );
    });

    this.time.addEvent({ delay: 6000, loop: true, callback: () => this.nextWire() });
    this.refreshHud();
  }

  private spotAt(x: number, y: number): Spot | null {
    for (const s of this.spots) {
      if (Phaser.Math.Distance.Between(x, y, s.x, s.y) <= s.r) return s;
    }
    return null;
  }

  private nextWire(): void {
    this.wireIndex = (this.wireIndex + 1) % WIRE.length;
    this.wireText.setText(WIRE[this.wireIndex]);
    this.wireText.setX(384);
  }

  private refreshHud(): void {
    this.clockText.setText(clock());
    this.moneyText.setText(`$${state.money}`);
    this.energyText.setText('|'.repeat(Math.max(0, state.energy)).padEnd(5, '.'));
  }

  private activate(s: Spot): void {
    if (s.job) {
      save();
      this.scene.start('Job');
      return;
    }
    this.prompt.setText(s.label);
    this.cameras.main.shake(120, 0.002);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const speed = 62;
    let vx = 0;
    let vy = 0;

    if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;

    if (vx === 0 && vy === 0 && this.target) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.target.x, this.target.y);
      if (d < 2) {
        this.target = null;
      } else {
        vx = (this.target.x - this.player.x) / d;
        vy = (this.target.y - this.player.y) / d;
      }
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      this.player.x = Phaser.Math.Clamp(this.player.x + (vx / len) * speed * dt, WALK.minX, WALK.maxX);
      this.player.y = Phaser.Math.Clamp(this.player.y + (vy / len) * speed * dt, WALK.minY, WALK.maxY);
      state.x = this.player.x;
      state.y = this.player.y;
    }

    const near = this.spotAt(this.player.x, this.player.y);
    if (near !== this.near) {
      this.near = near;
      this.prompt.setText(near ? `[e] ${near.label}` : 'wasd move   e interact');
    }
    if (near && Phaser.Input.Keyboard.JustDown(this.keys.E)) this.activate(near);
  }
}
