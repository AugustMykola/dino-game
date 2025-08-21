import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Application, Container, Graphics, Renderer, Text, Sprite, Texture, Assets } from 'pixi.js';

type GameState = 'Start' | 'Playing' | 'Paused' | 'GameOver' | 'LevelClear';

interface Bullet { sprite: Graphics; vy: number; from: 'player' | 'invader'; }
interface Invader { sprite: Sprite; w: number; h: number; alive: boolean; row: number; col: number; }

@Component({
  selector: 'space-invaders-game',
  standalone: true,
  templateUrl: './space-invaders-game.component.html',
  styleUrl: './space-invaders-game.component.scss',
})
export class SpaceInvadersGameComponent implements OnInit, OnDestroy {
  @ViewChild('gameContainer', { static: true }) gameContainer!: ElementRef;
  app: Application<Renderer> = new Application();

  // Layers
  world: Container = new Container();
  stars: Graphics = new Graphics();
  invaderLayer: Container = new Container();
  bunkerLayer: Container = new Container();

  // Start overlay UI
  startUI: Container = new Container();
  startOverlayGfx: Graphics = new Graphics();
  startTitle!: Text;
  startControls!: Text;
  startHint!: Text;

  // Player (Sprite)
  player!: Sprite;
  playerW = 48;
  playerH = 24;
  playerSpeed = 6;
  canShoot = true; shotCooldownMs = 260; lastShotAt = 0;

  // State
  gameState: GameState = 'Start';
  score = 0; level = 1; lives = 3;
  invincibleUntil = 0;

  // HUD
  scoreText!: Text; livesText!: Text; levelText!: Text; centerText!: Text;

  // Invaders
  invaders: Invader[] = [];
  rows = 5; cols = 11;
  invaderDX = 1.2;
  invaderDir: 1 | -1 = 1;
  stepDown = 22;
  leftMargin = 24; rightMargin = 24; topMargin = 64; bottomSafeY = 420;

  // Bullets
  playerBullets: Bullet[] = [];
  invaderBullets: Bullet[] = [];
  invaderFireEveryMs = 900; lastInvaderShotAt = 0;

  // UFO
  ufo?: Sprite; ufoVX = 2.2; nextUfoAt = 0; ufoAlive = false;

  // Bunkers
  bunkers: Graphics[] = [];
  bunkerCell = 8;

  // Input
  leftHeld = false; rightHeld = false; fireHeld = false;

  // Score tweak
  bombShotScore = 10;

  // Textures
  private shipTextures: Texture[] = [];
  private ufoTexture?: Texture;
  private playerTexture?: Texture;

  // UFO schedule
  private readonly UFO_FIRST_DELAY_MS = 15_000;
  private readonly UFO_INTERVAL_MS    = 30_000;

  // Listeners
  private keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);

  async ngOnInit(): Promise<void> {
    await this.app.init({
      background: '#000000',
      resizeTo: this.gameContainer.nativeElement,
      antialias: true,
      resolution: 1,
      preference: 'webgl',
    });
    this.gameContainer.nativeElement.appendChild(this.app.canvas);

    await this.preloadTextures();

    this.loadScene();
    this.registerControls();
    this.app.ticker.add(() => this.update());
  }

  private async preloadTextures(): Promise<void> {
    const invaderPaths = [1,2,3,4,5].map(n => `assets/ships/Ship_${n}.png`);
    try {
      this.shipTextures  = await Promise.all(invaderPaths.map(p => Assets.load<Texture>(p)));
      this.ufoTexture    = await Assets.load<Texture>('assets/ships/ufo-ship.png');
      this.playerTexture = await Assets.load<Texture>('assets/ships/bluecruiser.png');
    } catch {
      this.shipTextures = [];
      this.ufoTexture = undefined;
      this.playerTexture = undefined;
    }
  }

  private loadScene(): void {
    // BG
    this.drawStars();
    this.app.stage.addChild(this.stars, this.world);

    // HUD
    this.scoreText = new Text({ text: 'Score: 0', style: { fill: 0x9be15d, fontSize: 18, fontFamily: 'Arial', fontWeight: 'bold' } });
    this.livesText = new Text({ text: 'Lives: 3', style: { fill: 0xffa6b6, fontSize: 18, fontFamily: 'Arial', fontWeight: 'bold' } });
    this.levelText = new Text({ text: 'Level 1', style: { fill: 0x7fdbff, fontSize: 18, fontFamily: 'Arial', fontWeight: 'bold' } });
    this.centerText = new Text({ text: '', style: { fill: 0xffffff, fontSize: 28, fontFamily: 'Arial', fontWeight: '900' } });
    this.scoreText.x = 12; this.scoreText.y = 10;
    this.livesText.x = 12; this.livesText.y = 34;
    this.levelText.x = 12; this.levelText.y = 58;
    this.centerText.x = this.app.renderer.width / 2 - 100; this.centerText.y = 80;
    this.app.stage.addChild(this.scoreText, this.livesText, this.levelText, this.centerText);

    // World layers
    this.world.addChild(this.invaderLayer);
    this.world.addChild(this.bunkerLayer);

    this.setupPlayer();
    this.buildBunkers();
    this.buildInvaders();

    // UFO timer (15 c після старту)
    this.nextUfoAt = performance.now() + this.UFO_FIRST_DELAY_MS;

    // Start overlay
    this.buildStartOverlay();
    this.showStart();
    this.gameState = 'Start';
  }

  // ---------- Start Overlay ----------
  private buildStartOverlay(): void {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;

    this.startUI.removeChildren();

    this.startOverlayGfx.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });

    this.startTitle = new Text({
      text: 'УПРАВЛІННЯ',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontWeight: '900', fontSize: 48 },
    });
    this.startTitle.anchor.set(0.5);
    this.startTitle.x = W / 2;
    this.startTitle.y = H / 2 - 120;

    this.startControls = new Text({
      text: 'Space — fire\n←/A, →/D — movement\nP — pause\nR — start game',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 22, lineHeight: 30 },
    });
    this.startControls.anchor.set(0.5);
    this.startControls.x = W / 2;
    this.startControls.y = H / 2 - 20;

    this.startHint = new Text({
      text: 'Ready? Press R to start',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 20 },
    });
    this.startHint.anchor.set(0.5);
    this.startHint.x = W / 2;
    this.startHint.y = H / 2 + 80;

    this.startUI.addChild(this.startOverlayGfx, this.startTitle, this.startControls, this.startHint);

    // @ts-ignore
    this.startUI.eventMode = 'static';
    // @ts-ignore
    this.startUI.cursor = 'pointer';
    this.startUI.on('pointerdown', () => {
      if (this.gameState === 'Start') this.startGame();
    });

    this.app.stage.addChild(this.startUI);
  }
  private showStart(): void {
    this.startUI.visible = true;
    this.app.stage.setChildIndex(this.startUI, this.app.stage.children.length - 1);
  }
  private hideStart(): void {
    this.startUI.visible = false;
  }

  private setupPlayer(): void {
    // Якщо текстура завантажена — спрайт, інакше fallback прямокутник
    if (this.playerTexture) {
      this.player = new Sprite(this.playerTexture);
      this.player.width  = this.playerW;
      this.player.height = this.playerH;
    } else {
      const g = new Graphics();
      g.rect(0, 0, this.playerW, this.playerH).fill({ color: 0x21c7ff });
      const tex = this.app.renderer.generateTexture(g);
      this.player = new Sprite(tex);
    }

    // Щоб оберталось навколо центру
    this.player.anchor.set(0.5);
    // Повернути на 90° (за год. стрілкою). Якщо треба в інший бік — поставте +Math.PI/2
    this.player.rotation = -Math.PI / 2;

    const baseY = this.app.renderer.height - 80;
    this.player.x = (this.app.renderer.width) / 2;
    this.player.y = baseY;
    this.world.addChild(this.player);
  }

  private buildInvaders(): void {
    this.invaderLayer.removeChildren();
    this.invaders = [];

    const spacingX = 44, spacingY = 32;
    const startX = this.leftMargin + 40;
    const startY = this.topMargin + 20;

    const targetW = 32;
    const targetH = 24;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let sprite: Sprite;

        if (this.shipTextures.length) {
          const tex = this.shipTextures[(r + c) % this.shipTextures.length];
          sprite = new Sprite(tex);
          sprite.width = targetW;
          sprite.height = targetH;
        } else {
          const g = new Graphics();
          g.rect(0,0,targetW,targetH).fill({ color: 0x9be15d }).stroke({ width: 2, color: 0x222222 });
          const tex = this.app.renderer.generateTexture(g);
          sprite = new Sprite(tex);
        }

        sprite.x = startX + c * spacingX;
        sprite.y = startY + r * spacingY;

        this.invaderLayer.addChild(sprite);
        this.invaders.push({ sprite, w: targetW, h: targetH, alive: true, row: r, col: c });
      }
    }

    this.invaderLayer.x = 0; this.invaderLayer.y = 0;
    this.invaderDir = 1;
    this.invaderDX = 1.2 + (this.level - 1) * 0.3;
  }

  private buildBunkers(): void {
    this.bunkerLayer.removeChildren();
    this.bunkers = [];

    const viewW = this.app.renderer.width;
    const baseY = this.app.renderer.height - 140;
    const positions = [viewW*0.15, viewW*0.35, viewW*0.55, viewW*0.75];

    for (const x of positions) {
      const bunker = new Graphics();
      const cols = 11, rows = 6, s = this.bunkerCell;
      for (let r=0;r<rows;r++) {
        for (let c=0;c<cols;c++) {
          if ((r>=rows-2 && (c<2 || c>cols-3)) || (r===2 && c>=4 && c<=6)) continue;
          bunker.rect(c*s, r*s, s-1, s-1).fill({ color: 0x7fdbff });
        }
      }
      bunker.x = x; bunker.y = baseY; bunker.stroke({ width: 2, color: 0x006994 });
      this.bunkerLayer.addChild(bunker);
      this.bunkers.push(bunker);
    }
  }

  // === Controls ===
  private registerControls(): void {
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }
  private onKeyDown(e: KeyboardEvent): void {
    if (this.gameState === 'Playing') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.leftHeld = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.rightHeld = true;
      if (e.code === 'Space') this.fireHeld = true;
      if (e.code === 'KeyP') this.togglePause();
    }

    if (e.code === 'KeyR') {
      if (this.gameState === 'Start') this.startGame();               // старт тільки з екрана старту
      else if (this.gameState === 'GameOver') this.restart();         // рестарт тільки коли гра завершена
      // в інших станах ігноруємо R
    }
  }
  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.leftHeld = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.rightHeld = false;
    if (e.code === 'Space') this.fireHeld = false;
  }

  // === Loop ===
  private update(): void {
    if (this.gameState !== 'Playing') return;

    const now = performance.now();
    const viewW = this.app.renderer.width;

    // Player move (враховуючи якір по центру)
    if (this.leftHeld) this.player.x -= this.playerSpeed;
    if (this.rightHeld) this.player.x += this.playerSpeed;
    // межі з урахуванням половини ширини
    const halfW = this.playerW / 2;
    this.player.x = Math.max(8 + halfW, Math.min(viewW - 8 - halfW, this.player.x));

    // Player fire
    if (this.fireHeld && now - this.lastShotAt >= this.shotCooldownMs) {
      this.spawnPlayerBullet();
      this.lastShotAt = now;
    }

    // Update
    this.updateBullets();
    this.updateInvaders(now);
    this.updateUfo(now);

    // HUD
    this.scoreText.text = `Score: ${this.score}`;
    this.livesText.text = `Lives: ${this.lives}`;
    this.levelText.text = `Level ${this.level}`;

    // Lose if invaders reached the base line
    const deepest = this.deepestInvaderY();
    const lossLine = this.app.renderer.height - 140;
    if (deepest >= lossLine) this.gameOver('Invaders reached the base!');

    // Next level if all down
    if (this.invaders.every(i => !i.alive)) {
      this.gameState = 'LevelClear';
      this.centerText.text = 'LEVEL CLEAR!';
      setTimeout(() => this.nextLevel(), 1200);
    }
  }

  // === Invaders ===
  private updateInvaders(now: number): void {
    const aliveCount = this.invaders.filter(i => i.alive).length;
    const speedBoost = 1 + (1 - aliveCount / (this.rows * this.cols)) * 1.6;

    this.invaderLayer.x += this.invaderDX * this.invaderDir * speedBoost;

    const bounds = this.invaderBounds();
    const viewW = this.app.renderer.width;
    if (bounds.minX <= this.leftMargin || bounds.maxX >= viewW - this.rightMargin) {
      this.invaderLayer.y += this.stepDown;
      this.invaderDir *= -1;
      this.invaderDX *= 1.05;
    }

    if (now - this.lastInvaderShotAt > this.invaderFireEveryMs) {
      this.fireFromRandomColumn();
      this.lastInvaderShotAt = now + (Math.random() * 300 - 150);
    }
  }

  private invaderBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const inv of this.invaders) if (inv.alive) {
      const x = inv.sprite.x + this.invaderLayer.x;
      const y = inv.sprite.y + this.invaderLayer.y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + inv.w);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + inv.h);
    }
    if (minX === Infinity) { minX = maxX = minY = maxY = 0; }
    return { minX, maxX, minY, maxY };
  }

  private deepestInvaderY(): number {
    let deep = 0;
    for (const inv of this.invaders) if (inv.alive) {
      deep = Math.max(deep, inv.sprite.y + this.invaderLayer.y + inv.h);
    }
    return deep;
  }

  private fireFromRandomColumn(): void {
    const cols = this.cols;
    const startCol = Math.floor(Math.random() * cols);
    for (let offset=0; offset<cols; offset++) {
      const c = (startCol + offset) % cols;
      let lowest: Invader | undefined;
      for (let r=this.rows-1; r>=0; r--) {
        const inv = this.invaders.find(v => v.col === c && v.row === r && v.alive);
        if (inv) { lowest = inv; break; }
      }
      if (lowest) {
        const b = new Graphics();
        b.rect(0,0,4,10).fill({ color: 0xff595e });
        b.x = lowest.sprite.x + this.invaderLayer.x + lowest.w/2 - 2;
        b.y = lowest.sprite.y + this.invaderLayer.y + lowest.h;
        this.world.addChild(b);
        this.invaderBullets.push({ sprite: b, vy: 5.2, from: 'invader' });
        return;
      }
    }
  }

  // === Bullets & Collisions ===
  private spawnPlayerBullet(): void {
    const b = new Graphics();
    b.rect(0,0,4,12).fill({ color: 0x9be15d });
    // стріляємо з центру спрайта (якір по центру)
    b.x = this.player.x - 2;
    b.y = this.player.y - this.playerH/2 - 12;
    this.world.addChild(b);
    this.playerBullets.push({ sprite: b, vy: -8.5, from: 'player' });
  }

  private updateBullets(): void {
    // Player bullets
    for (let i=this.playerBullets.length-1; i>=0; i--) {
      const b = this.playerBullets[i];
      b.sprite.y += b.vy;
      if (b.sprite.y + 12 < 0) { b.sprite.destroy(); this.playerBullets.splice(i,1); continue; }

      // bullet vs bullet
      let hit = false;
      for (let j=this.invaderBullets.length-1; j>=0; j--) {
        const eb = this.invaderBullets[j];
        if (this.rectsOverlap(b.sprite.x, b.sprite.y, 4, 12, eb.sprite.x, eb.sprite.y, 4, 10)) {
          this.spawnSpark((b.sprite.x + eb.sprite.x) / 2, (b.sprite.y + eb.sprite.y) / 2);
          b.sprite.destroy(); this.playerBullets.splice(i,1);
          eb.sprite.destroy(); this.invaderBullets.splice(j,1);
          this.score += this.bombShotScore;
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // Invaders
      for (const inv of this.invaders) if (inv.alive) {
        const ix = inv.sprite.x + this.invaderLayer.x;
        const iy = inv.sprite.y + this.invaderLayer.y;
        if (this.rectsOverlap(b.sprite.x, b.sprite.y, 4, 12, ix, iy, inv.w, inv.h)) {
          inv.alive = false;
          inv.sprite.visible = false;
          b.sprite.destroy(); this.playerBullets.splice(i,1);
          this.score += 10 + (4 - inv.row) * 10;
          hit = true;
          break;
        }
      }
      if (hit) continue;

      // UFO
      if (this.ufoAlive && this.ufo) {
        if (this.rectsOverlap(b.sprite.x, b.sprite.y, 4, 12, this.ufo.x, this.ufo.y, this.ufo.width, this.ufo.height)) {
          this.score += 150 + Math.floor(Math.random()*100);
          b.sprite.destroy(); this.playerBullets.splice(i,1);
          this.world.removeChild(this.ufo); this.ufo.destroy(); this.ufo = undefined; this.ufoAlive = false;
          continue;
        }
      }

      // Bunkers
      if (this.hitBunker(b.sprite.x, b.sprite.y, 4, 12)) {
        b.sprite.destroy(); this.playerBullets.splice(i,1);
      }
    }

    // Enemy bullets
    for (let i=this.invaderBullets.length-1; i>=0; i--) {
      const b = this.invaderBullets[i];
      b.sprite.y += b.vy;
      if (b.sprite.y > this.app.renderer.height) { b.sprite.destroy(); this.invaderBullets.splice(i,1); continue; }

      const now = performance.now();
      // зіткнення з гравцем (прямокутник за габаритами до повороту)
      if (now >= this.invincibleUntil && this.rectsOverlap(
        b.sprite.x, b.sprite.y, 4, 10,
        this.player.x - this.playerW/2, this.player.y - this.playerH/2, this.playerW, this.playerH)) {
        this.lives = Math.max(0, this.lives - 1);
        this.invincibleUntil = now + 1200;
        this.flash(this.player, 0xffa6b6);
        b.sprite.destroy(); this.invaderBullets.splice(i,1);
        if (this.lives === 0) { this.gameOver('You were destroyed!'); return; }
        continue;
      }

      if (this.hitBunker(b.sprite.x, b.sprite.y, 4, 10)) {
        b.sprite.destroy(); this.invaderBullets.splice(i,1);
      }
    }
  }

  private hitBunker(x: number, y: number, w: number, h: number): boolean {
    for (const b of this.bunkers) {
      const bx = b.x, by = b.y;
      const bw = b.width, bh = b.height;
      if (!this.rectsOverlap(x, y, w, h, bx, by, bw, bh)) continue;
      const lx = Math.floor((x - bx) / this.bunkerCell) * this.bunkerCell;
      const ly = Math.floor((y - by) / this.bunkerCell) * this.bunkerCell;
      b.rect(lx, ly, this.bunkerCell, this.bunkerCell).fill({ color: 0x000000 });
      return true;
    }
    return false;
  }

  // === UFO ===
  private updateUfo(now: number): void {
    if (this.gameState !== 'Playing') return;

    // запуск за розкладом
    if (!this.ufoAlive && now >= this.nextUfoAt) {
      this.spawnUfo();
      this.nextUfoAt += this.UFO_INTERVAL_MS; // наступний проліт через 30 с
    }

    if (this.ufoAlive && this.ufo) {
      this.ufo.x += this.ufoVX;
      if (this.ufo.x < -60 || this.ufo.x > this.app.renderer.width + 60) {
        this.world.removeChild(this.ufo); this.ufo.destroy();
        this.ufo = undefined; this.ufoAlive = false;
      }
    }
  }

  private spawnUfo(): void {
    if (!this.ufoTexture) return;
    const s = new Sprite(this.ufoTexture);
    s.width = 48; s.height = 24;

    const fromLeft = Math.random() < 0.5;
    s.x = fromLeft ? -50 : this.app.renderer.width + 50;
    s.y = this.topMargin + 8;

    this.ufoVX = (fromLeft ? 1 : -1) * (2.0 + Math.random()*0.8);

    this.world.addChild(s);
    this.ufo = s;
    this.ufoAlive = true;
  }

  // === Helpers ===
  private flash(g: Sprite | Graphics, tint: number): void {
    const old = (g as any).tint ?? 0xffffff;
    (g as any).tint = tint; (g as any).alpha = 0.8;
    setTimeout(() => { (g as any).tint = old; (g as any).alpha = 1; }, 160);
  }

  private spawnSpark(x: number, y: number): void {
    const s = new Graphics();
    s.circle(0, 0, 6).fill({ color: 0xfff39a }).stroke({ width: 2, color: 0xffc300 });
    s.x = x; s.y = y; this.world.addChild(s);
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 160;
      if (t >= 1) { s.destroy(); return; }
      s.scale.set(1 - 0.6 * t);
      s.alpha = 1 - t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private drawStars(): void {
    const w = this.app.renderer.width, h = this.app.renderer.height;
    this.stars.clear();
    this.stars.rect(0,0,w,h).fill({ color: 0x000000 });
    for (let i=0;i<140;i++) {
      const x = Math.random()*w, y = Math.random()*h, r = Math.random()<0.85 ? 1 : 2;
      this.stars.circle(x,y,r).fill({ color: 0xffffff });
    }
  }

  // === State & Flow ===
  private togglePause(): void {
    if (this.gameState !== 'Playing' && this.gameState !== 'Paused') return;
    if (this.gameState === 'Playing') { this.gameState = 'Paused'; this.centerText.text = 'PAUSED'; }
    else if (this.gameState === 'Paused') { this.gameState = 'Playing'; this.centerText.text = ''; }
  }

  private gameOver(reason: string): void {
    this.gameState = 'GameOver';
    this.centerText.text = `GAME OVER\n${reason}\nPress R to restart`;
  }

  private startGame(): void {
    // ховаємо стартовий екран і запускаємо перший рівень
    this.hideStart();
    this.centerText.text = '';
    this.gameState = 'Playing';
  }

  private nextLevel(): void {
    this.level++;
    this.centerText.text = '';
    this.buildInvaders();
    this.clearBullets();
    if (this.lives < 5) this.lives++;
    this.gameState = 'Playing';
  }

  private clearBullets(): void {
    for (const b of this.playerBullets) b.sprite.destroy();
    for (const b of this.invaderBullets) b.sprite.destroy();
    this.playerBullets = []; this.invaderBullets = [];
  }

  private restart(): void {
    // РЕСТАРТ ДОЗВОЛЕНИЙ ЛИШЕ ПІСЛЯ GAME OVER
    if (this.gameState !== 'GameOver') return;

    this.score = 0; this.level = 1; this.lives = 3; this.invincibleUntil = 0;
    // повернути гравця в центр
    this.player.x = (this.app.renderer.width) / 2;
    this.player.y = this.app.renderer.height - 80;

    this.clearBullets();
    this.buildBunkers();
    this.buildInvaders();
    this.centerText.text = '';
    this.nextUfoAt = performance.now() + this.UFO_FIRST_DELAY_MS;

    this.gameState = 'Playing';
  }

  // === Cleanup ===
  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.app.destroy(true);
  }
}
