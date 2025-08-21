import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Application, Container, Graphics, Renderer, Text, Sprite, Texture, Assets } from 'pixi.js';

type ObstacleType = 'ground' | 'flying';
interface ObstacleEntity { sprite: Sprite; type: ObstacleType; baseY?: number; }

type PowerupType = 'fly' | 'shield';
type CollectibleKind = 'coin' | 'powerup' | 'heart';

interface Collectible {
  sprite: Graphics;
  kind: CollectibleKind;
  powerupType?: PowerupType;
}

@Component({
  selector: 'runner-game',
  standalone: true,
  imports: [],
  templateUrl: './runner-game.component.html',
  styleUrls: ['./runner-game.component.scss'],
})
export class RunnerGameComponent implements OnInit, OnDestroy {
  @ViewChild('gameContainer', { static: true }) gameContainer!: ElementRef;
  app: Application<Renderer> = new Application();

  world: Container = new Container();
  private bgFarSprites: Sprite[] = [];

  dino!: Sprite;
  private dinoIdleTex!: Texture;
  private dinoWalkFrames: Texture[] = [];
  private dinoBaseTexH = 1;

  private texBackground!: Texture;
  private texHelicopters: Texture[] = [];   // кілька гелікоптерів
  private texGroundSet: Texture[] = [];

  private texPoliceCar!: Texture;
  private texTruck1!: Texture;

  private roadYOffset = 16;
  private GROUND_OBS_H = 90;
  private FLY_OBS_H = 70;

  private HEART_SIZE = 24;
  private HEART_GAP = 14;
  private HEART_MARGIN_X = 4;
  private HEART_MARGIN_Y = 0;

  private OBSTACLE_BASE_GAP = 260;
  private OBSTACLE_SPEED_FACTOR = 40;
  private OBSTACLE_JITTER = 120;

  groundTiles: Graphics[] = [];
  obstaclesList: ObstacleEntity[] = [];
  collectibles: Collectible[] = [];

  score = 0;
  best = 0;
  scoreText!: Text;

  heartsMax = 3;
  hearts = this.heartsMax;
  private heartsUI: Container = new Container();

  private powerupsUI: Container = new Container();

  tileWidth = 500;
  groundY = 0;

  gravityBase = 1;
  gravity = this.gravityBase;
  jumpStrength = 15;
  velocityY = 0;
  velocityX = 3;
  isJumping = false;

  private worldScrollX = 0;

  private prevDinoY = 0;
  private prevDinoH = 50;

  coyoteMs = 100;
  lastGroundedAt = 0;
  airJumpsLeft = 1;

  mass = 0;
  massMax = 3;
  massPerCoinWhenFull = 0.25;
  stompMassThreshold = 1.0;
  private scaleMin = 1.0;
  private scaleMax = 1.6;

  powerupDurations: Record<PowerupType, number> = { fly: 4000, shield: 3000 };
  activePowerups = new Map<PowerupType, number>();

  private shieldBubble: Graphics | null = null;
  private dinoJetpack: Graphics | null = null;

  gameState: 'Start' | 'Playing' | 'Paused' | 'GameOver' = 'Start';
  invincible = false;
  invincibleUntil = 0;

  private velocityMultiplier = 1;
  private speedBoostUntil = 0;
  private edgeLeftTouch = false;
  private edgeRightTouch = false;
  edgeMargin = 10;

  shake = 0;

  private isSpaceHeld = false;
  private keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);

  private gameOverUI: Container = new Container();
  private overlayGfx: Graphics = new Graphics();
  private gameOverText!: Text;
  private gameOverHint!: Text;

  private startUI: Container = new Container();
  private startOverlayGfx: Graphics = new Graphics();
  private startTitle!: Text;
  private startControls!: Text;
  private startHint!: Text;

  private collectibleMinSeparation = 80;
  private pickupMinSpacing = 240;
  private pickupSpacingJitter = 200;
  private nextPickupX = 0;

  private walkFrameIndex = 0;
  private nextWalkFrameAt = 0;
  private walkFrameMs = 80;
  private isWalking = false;

  async ngOnInit(): Promise<void> {
    await this.app.init({ resizeTo: this.gameContainer.nativeElement, antialias: true, resolution: 1, preference: 'webgl' });
    this.gameContainer.nativeElement.appendChild(this.app.canvas);

    // load all assets
    const toUrl = (n: number) => `assets/RedDinosaur${n}.png`;
    const dinoList = [1,9,10,11,12,13,14,15,16,17,18].map(toUrl);

    const groundUrls = [
      'assets/runner-police-car.png',
      'assets/runner-sport-car.png',
      'assets/truck-1_transparent.png',
    ];

    const heliUrls = [
      'assets/runner-helicopter.png',
      'assets/helicopter-2_transparent.png',
    ];

    const allAssets = [...dinoList, 'assets/runner-background.png', ...heliUrls, ...groundUrls];

    const loaded = await Assets.load(allAssets);
    const tex = (url: string) => (Array.isArray(loaded) ? loaded[allAssets.indexOf(url)] : loaded[url]) as Texture;

    // dino
    this.dinoIdleTex = tex(toUrl(1));
    this.dinoWalkFrames = [9,10,11,12,13,14,15,16,17,18].map(n => tex(toUrl(n)));

    // background & obstacles
    this.texBackground   = tex('assets/runner-background.png');
    this.texHelicopters  = heliUrls.map(tex);

    // конкретні ground-спрайти (щоб знати що фліпати)
    this.texPoliceCar    = tex('assets/runner-police-car.png');
    const sportCarTex    = tex('assets/runner-sport-car.png');
    this.texTruck1       = tex('assets/truck-1_transparent.png');

    // набір наземних перешкод
    this.texGroundSet = [this.texPoliceCar, sportCarTex, this.texTruck1];

    this.loadScene();
    this.registerControls();
    this.app.ticker.add(() => this.update());
  }

  loadScene(): void {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;

    // background (2 tiles)
    const makeBg = (): Sprite => {
      const s = new Sprite(this.texBackground);
      s.anchor.set(0,0);
      s.width = W; s.height = H;
      return s;
    };
    this.bgFarSprites = [makeBg(), makeBg()];
    this.bgFarSprites[1].x = W;

    this.app.stage.addChild(...this.bgFarSprites, this.world);

    // Ground
    this.groundY = H - 100;
    for (let i = 0; i < 3; i++) {
      const g = new Graphics().rect(0, 0, this.tileWidth, 100);
      g.y = this.groundY;
      g.x = i * this.tileWidth;
      this.world.addChild(g);
      this.groundTiles.push(g);
    }

    // Dino
    this.dino = new Sprite(this.dinoIdleTex);
    this.dino.anchor.set(0, 0);
    this.dinoBaseTexH = this.dino.texture.height || 1;
    this.dino.x = 100;
    this.updateDinoScale(true);
    this.dino.y = this.groundY - this.currentDinoHeight();
    this.world.addChild(this.dino);

    // pickups plan
    this.nextPickupX = 700;

    // Obstacles (перші три)
    this.spawnObstacle(700, 'ground');
    this.spawnObstacle(1000, 'flying');
    this.spawnObstacle(1400, 'ground');

    // Collectibles
    this.spawnCoin(this.placeCollectibleAtOrAfter(850));
    this.spawnCoin(this.placeCollectibleAtOrAfter(1200));
    this.spawnPowerup(this.placeCollectibleAtOrAfter(1100), 'fly');
    this.spawnPowerup(this.placeCollectibleAtOrAfter(1500), 'shield');
    this.spawnHeart(this.placeCollectibleAtOrAfter(1800));

    // HUD
    this.scoreText = new Text({ text: 'Score: 0', style: { fill: 0xffffff, fontSize: 22, fontFamily: 'Arial', fontWeight: 'bold' } });
    this.scoreText.x = 16; this.scoreText.y = 12;

    this.heartsUI.x = 16; this.heartsUI.y = 46;
    this.drawHearts();

    this.powerupsUI.x = 16;
    this.powerupsUI.y = 82;
    this.refreshPowerupsHUD();

    this.app.stage.addChild(this.scoreText, this.heartsUI, this.powerupsUI);

    // Overlays
    this.buildGameOverOverlay();
    this.hideGameOver();
    this.app.stage.addChild(this.gameOverUI);

    this.buildStartOverlay();
    this.app.stage.addChild(this.startUI); // спершу в stage
    this.showStart();                      // потім показуємо
  }

  // ---------- Helpers ----------
  private rightWorldEdge(): number {
    return -this.world.x + this.app.renderer.width;
  }
  private farthestObstacleX(): number {
    return this.obstaclesList.length
      ? Math.max(...this.obstaclesList.map(o => o.sprite.x))
      : (this.dino.x + 600);
  }
  private nextObstacleX(afterX?: number): number {
    const speed = this.velocityX * this.velocityMultiplier;
    const minGap = this.OBSTACLE_BASE_GAP + speed * this.OBSTACLE_SPEED_FACTOR;
    const jitter = this.OBSTACLE_JITTER + speed * 20;
    const base = Math.max(this.farthestObstacleX(), this.rightWorldEdge(), afterX ?? 0);
    return base + minGap + Math.random() * jitter;
  }

  /** Лівий край спрайта, коректний і для віддзеркалених по X */
  private leftXOf(s: Sprite): number {
    return s.scale.x >= 0 ? s.x : s.x - s.width;
  }

  // ---------- Spawners ----------
  private pickGroundTexture(): Texture {
    return this.texGroundSet[Math.floor(Math.random() * this.texGroundSet.length)];
  }
  private pickFlyingTexture(): Texture {
    return this.texHelicopters[Math.floor(Math.random() * this.texHelicopters.length)];
  }
  private scaleToHeight(sprite: Sprite, desiredH: number): void {
    const th = sprite.texture.height || 1;
    const s = desiredH / th;
    sprite.scale.set(s);
  }
  private makeObstacleSprite(type: ObstacleType): Sprite {
    const spr = new Sprite(type === 'ground' ? this.pickGroundTexture() : this.pickFlyingTexture());
    spr.anchor.set(0, 0);
    const targetH = type === 'ground' ? this.GROUND_OBS_H : this.FLY_OBS_H;
    this.scaleToHeight(spr, targetH);
    return spr;
  }

  /** Віддзеркалює police/truck по X і зберігає «лівий край» */
  private applyGroundFacing(spr: Sprite, leftX: number): void {
    const needFlip =
      spr.texture === this.texPoliceCar ||
      spr.texture === this.texTruck1;

    const sx = Math.abs(spr.scale.x);
    spr.scale.x = needFlip ? -sx : sx;

    // зафіксувати лівий край у leftX (anchor 0,0, width завжди додатна)
    spr.x = leftX;
    if (needFlip) spr.x += spr.width; // компенсуємо від’ємний scale.x
  }

  private obstacleY(type: ObstacleType, spr: Sprite): number {
    if (type === 'ground') return this.groundY - spr.height + this.roadYOffset;
    const hover = 100;
    return this.groundY - spr.height - hover;
  }

  spawnObstacle(x: number, obstacleType: ObstacleType = 'ground'): void {
    const sprite = this.makeObstacleSprite(obstacleType);

    if (obstacleType === 'ground') this.applyGroundFacing(sprite, x);
    else sprite.x = x;

    sprite.y = this.obstacleY(obstacleType, sprite);
    this.world.addChild(sprite);
    this.obstaclesList.push({ sprite, type: obstacleType, baseY: sprite.y });
  }

  // ---- pickup scheduler ----
  private scheduleNextPickupX(fromX: number): void {
    const spacing = this.pickupMinSpacing + Math.random() * this.pickupSpacingJitter;
    this.nextPickupX = fromX + spacing;
  }
  private placeCollectibleAtOrAfter(x: number): number {
    let finalX = Math.max(x, this.nextPickupX);
    const tooClose = (xx: number) => this.collectibles.some(c => Math.abs(c.sprite.x - xx) < this.collectibleMinSeparation);
    let guard = 0;
    while (tooClose(finalX) && guard++ < 6) finalX += this.collectibleMinSeparation;
    this.scheduleNextPickupX(finalX);
    return finalX;
  }

  spawnCoin(x: number): void {
    const xx = this.placeCollectibleAtOrAfter(x);
    const p = new Graphics();
    p.circle(0, 0, 12).fill({ color: 0xffd700 }).stroke({ width: 2, color: 0xb8860b });
    p.x = xx; p.y = this.groundY - 120;
    this.world.addChild(p);
    this.collectibles.push({ sprite: p, kind: 'coin' });
  }
  spawnPowerup(x: number, type: PowerupType): void {
    const xx = this.placeCollectibleAtOrAfter(x);
    const g = new Graphics();
    if (type === 'fly') this.drawJetpack(g);
    else if (type === 'shield') this.drawShieldIcon(g);
    g.x = xx; g.y = this.groundY - 150;
    this.world.addChild(g);
    this.collectibles.push({ sprite: g, kind: 'powerup', powerupType: type });
  }
  spawnHeart(x: number): void {
    const xx = this.placeCollectibleAtOrAfter(x);
    const h = new Graphics();
    this.drawHeart(h);
    h.x = xx; h.y = this.groundY - 130;
    this.world.addChild(h);
    this.collectibles.push({ sprite: h, kind: 'heart' });
  }

  // ---------- Controls ----------
  registerControls(): void {
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }
  onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') { this.isSpaceHeld = true; this.tryJump(); }
    else if (e.code === 'KeyP') this.togglePause();
    else if (e.code === 'KeyR' || e.code === 'Enter') {
      if (this.gameState === 'Start' || this.gameState === 'GameOver') this.restart();
    }
    else if (e.code === 'ArrowUp') { if (this.hasPowerup('fly')) this.velocityY = -8; }
  }
  onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') this.isSpaceHeld = false;
  }

  // ---------- Jump / Coyote / Double jump ----------
  tryJump(): void {
    if (this.hasPowerup('fly')) return;
    const onGround = (this.dino.y + this.currentDinoHeight()) >= this.groundY;
    const canCoyote = performance.now() - this.lastGroundedAt <= this.coyoteMs;

    if (onGround || canCoyote) {
      this.velocityY = -this.jumpStrength;
      this.isJumping = true;
      this.airJumpsLeft = 1;
      return;
    }
    if (this.airJumpsLeft > 0) {
      this.velocityY = -this.jumpStrength * 0.9;
      this.airJumpsLeft--;
    }
  }

  // ---------- Update loop ----------
  update(): void {
    if (this.gameState !== 'Playing') return;
    if (!this.dino || !this.world) return;

    const now = performance.now();
    if (this.invincible && now > this.invincibleUntil) this.invincible = false;

    // for stomp
    this.prevDinoY = this.dino.y;
    this.prevDinoH = this.currentDinoHeight();

    this.updatePowerups();

    if (this.velocityMultiplier !== 1 && now > this.speedBoostUntil) this.velocityMultiplier = 1;

    const vx = this.velocityX * this.velocityMultiplier;

    // Parallax wrap
    const W = this.app.renderer.width;
    const wrap = (tile: Sprite | Graphics, speed: number) => { tile.x -= speed; if (tile.x <= -W) tile.x += 2 * W; };
    this.bgFarSprites.forEach(t => wrap(t, vx * 0.2));

    // World scroll & player drift
    this.worldScrollX -= vx;
    this.dino.x += vx;

    // Flight
    if (this.hasPowerup('fly')) {
      this.gravity = 0.25;
      if (this.isSpaceHeld) this.velocityY = Math.max(-9, this.velocityY - 0.8);
    } else {
      this.gravity = this.gravityBase;
    }

    // Gravity
    this.velocityY += this.gravity;
    this.dino.y += this.velocityY;

    // Ground snap
    const dinoBottom = this.dino.y + this.currentDinoHeight();
    if (dinoBottom >= this.groundY) {
      this.dino.y = this.groundY - this.currentDinoHeight();
      if (this.velocityY > 18) this.addShake(6, 150);
      this.velocityY = 0;
      this.isJumping = false;
      this.lastGroundedAt = performance.now();
    }
    if (this.dino.y < 20) this.dino.y = 20;

    // Ground tiles recycle
    for (const tile of this.groundTiles) {
      const worldTileX = tile.x + this.world.x;
      if (worldTileX + this.tileWidth < 0) {
        const rightMost = Math.max(...this.groundTiles.map(t => t.x));
        tile.x = rightMost + this.tileWidth;
      }
    }

    // Obstacles recycle (speed-aware, spawn beyond horizon)
    this.obstaclesList.forEach(obstacle => {
      if (obstacle.type === 'flying') {
        const t = this.app.ticker.lastTime / 1000;
        obstacle.sprite.y = (obstacle.baseY ?? obstacle.sprite.y) + Math.sin(t * 2) * 8;
      }

      const worldLeft = this.leftXOf(obstacle.sprite) + this.world.x;
      if (worldLeft + obstacle.sprite.width < 0) {
        const newType: ObstacleType = Math.random() < 0.5 ? 'ground' : 'flying';
        obstacle.type = newType;

        obstacle.sprite.texture = (newType === 'ground') ? this.pickGroundTexture() : this.pickFlyingTexture();
        const targetH = newType === 'ground' ? this.GROUND_OBS_H : this.FLY_OBS_H;
        this.scaleToHeight(obstacle.sprite, targetH);

        const leftX = this.nextObstacleX();
        if (newType === 'ground') this.applyGroundFacing(obstacle.sprite, leftX);
        else obstacle.sprite.x = leftX;

        obstacle.sprite.y = this.obstacleY(newType, obstacle.sprite);
        obstacle.baseY = obstacle.sprite.y;

        // rarer pickups
        const roll = Math.random();
        const baseAfter = obstacle.sprite.x;
        if (roll < 0.12) this.spawnCoin(this.placeCollectibleAtOrAfter(baseAfter + 200));
        else if (roll < 0.15) this.spawnPowerup(this.placeCollectibleAtOrAfter(baseAfter + 220), 'fly');
        else if (roll < 0.18) this.spawnPowerup(this.placeCollectibleAtOrAfter(baseAfter + 220), 'shield');
        else if (roll < 0.20) this.spawnHeart(this.placeCollectibleAtOrAfter(baseAfter + 240));
      }
    });

    // Edges
    this.handleMapEdgesBoost();

    // Collectibles
    this.updateCollectibles();

    // Collisions
    this.checkCollisions();

    // Score
    this.score += 1;
    if (this.score % 500 === 0) this.velocityX = Math.min(this.velocityX + 0.5, 12);
    this.scoreText.text = `Score: ${this.score}`;
    if (this.score > this.best) this.best = this.score;

    // Walk animation
    const onGround = (this.dino.y + this.currentDinoHeight()) >= this.groundY - 0.5;
    this.isWalking = onGround && this.velocityMultiplier > 0 && this.velocityX > 0;
    if (this.isWalking) {
      if (now >= this.nextWalkFrameAt) {
        this.walkFrameIndex = (this.walkFrameIndex + 1) % this.dinoWalkFrames.length;
        this.dino.texture = this.dinoWalkFrames[this.walkFrameIndex];
        this.nextWalkFrameAt = now + this.walkFrameMs;
        this.updateDinoScale(false);
      }
    } else {
      if (this.dino.texture !== this.dinoIdleTex) {
        this.dino.texture = this.dinoIdleTex;
        this.updateDinoScale(false);
      }
    }

    // update overlays
    this.updateShieldBubble(now);
    this.updateJetpackAttachment();

    // Shake
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.world.x = this.worldScrollX + sx;
    this.world.y = sy;
  }

  // ---------- Map-edge boost ----------
  private handleMapEdgesBoost(): void {
    const dW = this.currentDinoWidth();
    const screenW = this.app.renderer.width;

    let screenX = this.dino.x + this.world.x;

    if (screenX <= this.edgeMargin) {
      screenX = this.edgeMargin;
      this.dino.x = screenX - this.world.x;
      if (!this.edgeLeftTouch) { this.onMapEdgeTouch('left'); this.edgeLeftTouch = true; }
    } else {
      this.edgeLeftTouch = false;
    }

    screenX = this.dino.x + this.world.x;

    if (screenX + dW >= screenW - this.edgeMargin) {
      const clamped = screenW - this.edgeMargin - dW;
      this.dino.x = clamped - this.world.x;
      if (!this.edgeRightTouch) { this.onMapEdgeTouch('right'); this.edgeRightTouch = true; }
    } else {
      this.edgeRightTouch = false;
    }
  }
  private onMapEdgeTouch(side: 'left' | 'right'): void {
    this.invincible = true;
    this.invincibleUntil = performance.now() + 5000;
    this.velocityMultiplier = 3;
    this.speedBoostUntil = this.invincibleUntil;
    const nudge = 4;
    if (side === 'left') this.dino.x += nudge; else this.dino.x -= nudge;
    this.addShake(10, 180);
  }

  // ---------- Powerups ----------
  private hasPowerup(type: PowerupType): boolean {
    const exp = this.activePowerups.get(type);
    return !!exp && performance.now() < exp;
  }
  private activatePowerup(type: PowerupType): void {
    const until = performance.now() + this.powerupDurations[type];
    this.activePowerups.set(type, until);
    if (type === 'shield') this.createShieldBubble();
    if (type === 'fly')    this.createJetpackAttachment();
    this.refreshPowerupsHUD();
  }
  private updatePowerups(): void {
    const now = performance.now();
    for (const [type, exp] of Array.from(this.activePowerups.entries())) {
      if (now >= exp) {
        this.activePowerups.delete(type);
        if (type === 'shield') this.removeShieldBubble();
        if (type === 'fly')    this.removeJetpackAttachment();
        this.refreshPowerupsHUD();
      }
    }
  }

  // ---------- Collectibles ----------
  private updateCollectibles(): void {
    const dW = this.currentDinoWidth();
    const dH = this.currentDinoHeight();

    this.collectibles = this.collectibles.filter((c) => {
      const worldX = c.sprite.x + this.world.x;
      if (worldX + 30 < 0) {
        const farthestX = this.farthestObstacleX();
        const base = Math.max(farthestX, this.rightWorldEdge()) + 200 + Math.random() * 260;
        c.sprite.x = this.placeCollectibleAtOrAfter(base);
      }

      const hit = this.rectsOverlap(this.dino.x, this.dino.y, dW, dH, c.sprite.x - 12, c.sprite.y - 12, 24, 24);

      if (hit) {
        if (c.kind === 'coin') {
          this.score += 50;
          if (this.hearts === this.heartsMax) {
            const beforeHeight = this.currentDinoHeight();
            this.mass = Math.min(this.massMax, this.mass + this.massPerCoinWhenFull);
            this.updateDinoScale(true, beforeHeight);
          }
          this.scoreText.text = `Score: ${this.score}`;
        } else if (c.kind === 'powerup' && c.powerupType) {
          this.activatePowerup(c.powerupType);
        } else if (c.kind === 'heart') {
          if (this.hearts < this.heartsMax) { this.hearts++; this.drawHearts(); }
          else { this.score += 30; }
        }
        c.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  // ---------- Collisions ----------
  private checkCollisions(): void {
    if (this.invincible) return;

    const dW = this.currentDinoWidth();
    const dH = this.currentDinoHeight();
    const dx = this.dino.x;
    const dy = this.dino.y;

    for (const o of this.obstaclesList) {
      const ow = o.sprite.width;
      const oh = o.sprite.height;
      const ox = this.leftXOf(o.sprite);   // виправлено для віддзеркалених спрайтів
      const oy = o.sprite.y;

      if (this.rectsOverlap(dx, dy, dW, dH, ox, oy, ow, oh)) {
        const prevBottom = this.prevDinoY + this.prevDinoH;
        const isTopHit = prevBottom <= oy + 1 && this.velocityY >= 0;

        if (isTopHit) {
          this.dino.y = oy - dH;
          if (this.mass >= this.stompMassThreshold) {
            this.destroyObstacle(o, true);
            this.velocityY = -Math.max(10, this.jumpStrength * 0.8);
            this.addShake(8, 120);
            this.score += 100;
            this.scoreText.text = `Score: ${this.score}`;
          } else {
            this.velocityY = -Math.min(12, Math.max(6, this.velocityY * 0.6));
            this.addShake(4, 80);
          }
          continue;
        }

        if (this.hasPowerup('shield')) {
          this.destroyObstacle(o, false);
          this.activePowerups.delete('shield');
          this.removeShieldBubble();
          this.refreshPowerupsHUD();
          this.addShake(6, 120);
          this.invincible = true;
          this.invincibleUntil = performance.now() + 300;
          continue;
        }

        this.onHit();
        break;
      }
    }
  }

  private destroyObstacle(o: ObstacleEntity, respawn: boolean): void {
    const idx = this.obstaclesList.indexOf(o);
    if (idx !== -1) this.obstaclesList.splice(idx, 1);
    o.sprite.destroy();

    if (respawn) {
      const x = this.nextObstacleX();
      const type: ObstacleType = Math.random() < 0.5 ? 'ground' : 'flying';
      this.spawnObstacle(x, type);
      if (Math.random() < 0.4) this.spawnCoin(this.placeCollectibleAtOrAfter(x + 140));
    }
  }

  private onHit(): void {
    this.hearts = Math.max(0, this.hearts - 1);
    this.drawHearts();

    this.score = Math.max(0, this.score - 150);
    this.scoreText.text = `Score: ${this.score}`;

    this.invincible = true;
    this.invincibleUntil = performance.now() + 900;
    this.addShake(8, 180);
    this.dino.alpha = 0.4;
    setTimeout(() => (this.dino.alpha = 1), 900);

    if (this.hearts === 0) {
      this.showGameOver();
      this.gameState = 'GameOver';
    }
  }

  // ---------- Shield bubble ----------
  private createShieldBubble(): void {
    if (this.shieldBubble) return;
    const g = new Graphics();
    this.shieldBubble = g;
    this.world.addChild(g);
    this.updateShieldBubble(performance.now());
  }
  private removeShieldBubble(): void {
    if (!this.shieldBubble) return;
    this.shieldBubble.destroy();
    this.shieldBubble = null;
  }
  private updateShieldBubble(now: number): void {
    if (!this.shieldBubble || !this.hasPowerup('shield')) return;
    const dW = this.currentDinoWidth();
    const dH = this.currentDinoHeight();
    const cx = this.dino.x + dW / 2;
    const cy = this.dino.y + dH / 2;

    const pulse = 1 + Math.sin(now / 200) * 0.05;
    const rx = (dW * 0.65) * pulse;
    const ry = (dH * 0.75) * pulse;

    this.shieldBubble.clear();
    this.shieldBubble.ellipse(cx, cy, rx, ry).fill({ color: 0x66ccff, alpha: 0.12 });
    this.shieldBubble.ellipse(cx, cy, rx, ry).stroke({ width: 3, color: 0x9ad6ff, alpha: 0.9 });
  }

  // ---------- Jetpack attachment ----------
  private createJetpackAttachment(): void {
    if (this.dinoJetpack) return;
    const g = new Graphics();
    this.drawJetpack(g);
    this.dinoJetpack = g;
    this.dino.addChild(g);
    this.updateJetpackAttachment();
  }
  private removeJetpackAttachment(): void {
    if (!this.dinoJetpack) return;
    this.dinoJetpack.destroy();
    this.dinoJetpack = null;
  }
  private updateJetpackAttachment(): void {
    if (!this.dinoJetpack || !this.hasPowerup('fly')) return;

    const texW = this.dino.texture.width  || 50;
    const texH = this.dino.texture.height || 50;

    const cx = texW * 0.18;
    const cy = texH * 0.54;

    const desiredLocalHeight = texH * 0.42;     // фіксоване (без crouch)
    const scale = desiredLocalHeight / 30;      // base drawing height ≈30px
    this.dinoJetpack.scale.set(scale);
    this.dinoJetpack.rotation = 10 * Math.PI / 180;

    this.dinoJetpack.position.set(cx, cy);
  }

  // ---------- Powerups HUD (icons) ----------
  private refreshPowerupsHUD(): void {
    this.powerupsUI.removeChildren();
    let x = 0;
    const gap = 8;

    if (this.hasPowerup('shield')) {
      const s = new Graphics();
      this.drawShieldIcon(s);
      s.scale.set(0.7);
      s.x = x; s.y = 0;
      this.powerupsUI.addChild(s);
      x += 32 * 0.7 + gap;
    }
    if (this.hasPowerup('fly')) {
      const j = new Graphics();
      this.drawJetpack(j);
      j.scale.set(0.9);
      j.x = x; j.y = 4;
      this.powerupsUI.addChild(j);
      x += 20 * 0.9 + gap;
    }
  }

  // ---------- Hearts UI ----------
  private drawHearts(): void {
    this.heartsUI.removeChildren();

    const step = this.HEART_SIZE + this.HEART_GAP;
    for (let i = 0; i < this.heartsMax; i++) {
      const h = new Graphics();
      this.drawHeart(h, i < this.hearts);

      const scale = this.HEART_SIZE / 24;
      h.scale.set(scale);

      h.x = this.HEART_MARGIN_X + i * step;
      h.y = this.HEART_MARGIN_Y;

      this.heartsUI.addChild(h);
    }
  }

  // ---------- Game Over Overlay ----------
  private buildGameOverOverlay(): void {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;

    this.overlayGfx.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });

    this.gameOverText = new Text({
      text: 'GAME OVER',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontWeight: '900', fontSize: 64 },
    });
    this.gameOverText.anchor.set(0.5);
    this.gameOverText.x = W / 2;
    this.gameOverText.y = H / 2 - 20;

    this.gameOverHint = new Text({
      text: 'Press R or Click to Restart',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 20 },
    });
    this.gameOverHint.anchor.set(0.5);
    this.gameOverHint.x = W / 2;
    this.gameOverHint.y = H / 2 + 28;

    this.gameOverUI.addChild(this.overlayGfx, this.gameOverText, this.gameOverHint);

    // @ts-ignore
    this.gameOverUI.eventMode = 'static';
    // @ts-ignore
    this.gameOverUI.cursor = 'pointer';
    this.gameOverUI.on('pointerdown', () => { if (this.gameState === 'GameOver') this.restart(); });
  }
  private showGameOver(): void {
    this.gameOverUI.visible = true;
    this.app.stage.setChildIndex(this.gameOverUI, this.app.stage.children.length - 1);
  }
  private hideGameOver(): void {
    this.gameOverUI.visible = false;
  }

  // ---------- Start Overlay ----------
  private buildStartOverlay(): void {
    const W = this.app.renderer.width;
    const H = this.app.renderer.height;

    this.startOverlayGfx.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });

    this.startTitle = new Text({
      text: 'Controls',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontWeight: '900', fontSize: 48 },
    });
    this.startTitle.anchor.set(0.5);
    this.startTitle.x = W / 2;
    this.startTitle.y = H / 2 - 120;

    this.startControls = new Text({
      text:
        'Space — jump\n' +
        '↑ (with jetpack) — fly up\n' +
        'P — pause',
      style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 22, lineHeight: 30 },
    });
    this.startControls.anchor.set(0.5);
    this.startControls.x = W / 2;
    this.startControls.y = H / 2 - 20;

    this.startHint = new Text({
      text: 'Ready? Press R, to start',
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
      if (this.gameState === 'Start') this.restart();
    });
  }
  private showStart(): void {
    this.startUI.visible = true;
    this.app.stage.setChildIndex(this.startUI, this.app.stage.children.length - 1);
  }
  private hideStart(): void {
    this.startUI.visible = false;
  }

  // ---------- Scale helpers ----------
  private baseDinoHeight(): number { return 50; }
  private baseDinoWidth(): number { return 50; }
  private currentScale(): number {
    const t = Math.max(0, Math.min(1, this.mass / this.massMax));
    return this.scaleMin + (this.scaleMax - this.scaleMin) * t;
  }
  private currentDinoHeight(): number { return this.baseDinoHeight() * this.currentScale(); }
  private currentDinoWidth(): number { return this.baseDinoWidth() * this.currentScale(); }

  private updateDinoScale(anchorBottom = true, oldHeight?: number): void {
    const desiredH = this.currentDinoHeight();
    const texH = this.dino.texture.height || this.dinoBaseTexH || 1;

    const oldH = oldHeight ?? (this.dino.height);
    const oldBottom = this.dino.y + oldH;

    const uniformScale = desiredH / texH;
    this.dino.scale.set(uniformScale);

    if (anchorBottom) {
      this.dino.y = oldBottom - this.dino.height;
      const bottom = this.dino.y + this.dino.height;
      if (bottom > this.groundY) this.dino.y = this.groundY - this.dino.height;
      if (this.dino.y < 20) this.dino.y = 20;
    }

    this.updateJetpackAttachment();
  }

  private drawShieldIcon(g: Graphics): void {
    g.clear();
    g.roundRect(-16, -20, 32, 40, 10).fill({ color: 0x7fffd4 }).stroke({ width: 3, color: 0x1e90ff });
    g.moveTo(0, -6).lineTo(8, 4).lineTo(0, 12).lineTo(-8, 4).lineTo(0, -6).fill({ color: 0x1e90ff });
  }
  private drawJetpack(g: Graphics): void {
    g.clear();
    g.roundRect(-10, -18, 20, 30, 4).fill({ color: 0xb0bec5 }).stroke({ width: 2, color: 0x37474f });
    g.roundRect(-8, -22, 16, 6, 3).fill({ color: 0x90a4ae }).stroke({ width: 2, color: 0x37474f });
    g.roundRect(-16, -8, 6, 14, 2).fill({ color: 0x90a4ae }).stroke({ width: 2, color: 0x37474f });
    g.roundRect(10, -8, 6, 14, 2).fill({ color: 0x90a4ae }).stroke({ width: 2, color: 0x37474f });
    g.moveTo(-6, 14).lineTo(-2, 26).lineTo(2, 14).fill({ color: 0xffd54f });
    g.moveTo(2, 14).lineTo(5, 22).lineTo(8, 14).fill({ color: 0xff8f00 });
  }
  private drawHeart(g: Graphics, filled: boolean = true): void {
    g.clear();
    const fillColor = filled ? 0xff4d6d : 0x2f2f2f;
    g.circle(-6, -2, 6).fill({ color: fillColor });
    g.circle(6, -2, 6).fill({ color: fillColor });
    g.moveTo(-12, 0).lineTo(0, 14).lineTo(12, 0).fill({ color: fillColor });
    g.stroke({ width: 2, color: 0xaa2c45 });
  }

  private rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  private addShake(power = 6, duration = 200): void {
    this.shake = power;
    setTimeout(() => (this.shake = 0), duration);
  }
  private togglePause(): void {
    if (this.gameState === 'GameOver') return;
    this.gameState = this.gameState === 'Paused' ? 'Playing' : 'Paused';
  }

  private restart(): void {
    // reset state
    this.velocityX = 3;
    this.velocityY = 0;
    this.gravity = this.gravityBase;
    this.isJumping = false;
    this.invincible = false;
    this.activePowerups.clear();
    this.removeShieldBubble();
    this.removeJetpackAttachment();
    this.refreshPowerupsHUD();

    this.velocityMultiplier = 1;
    this.speedBoostUntil = 0;
    this.edgeLeftTouch = false;
    this.edgeRightTouch = false;

    // scroll/shake
    this.worldScrollX = 0;
    this.world.x = 0; this.world.y = 0;
    this.shake = 0;

    // parallax reset
    const W = this.app.renderer.width;
    this.bgFarSprites?.forEach((t, i) => (t.x = i * W));

    // HUD
    this.score = 0; this.scoreText.text = `Score: ${this.score}`;
    this.hearts = this.heartsMax; this.drawHearts();

    // player
    this.mass = 0;
    this.dino.texture = this.dinoIdleTex;
    this.updateDinoScale(true);
    this.dino.x = 100;
    this.dino.y = this.groundY - this.currentDinoHeight();
    this.dino.alpha = 1;

    // obstacles (place beyond horizon)
    let x = this.rightWorldEdge() + 300;
    this.obstaclesList.forEach((o, i) => {
      o.type = i % 2 === 0 ? 'ground' : 'flying';
      o.sprite.texture = (o.type === 'ground') ? this.pickGroundTexture() : this.pickFlyingTexture();
      const targetH = o.type === 'ground' ? this.GROUND_OBS_H : this.FLY_OBS_H;
      this.scaleToHeight(o.sprite, targetH);

      x = this.nextObstacleX(x);

      if (o.type === 'ground') this.applyGroundFacing(o.sprite, x);
      else o.sprite.x = x;

      o.sprite.y = this.obstacleY(o.type, o.sprite);
      o.baseY = o.sprite.y;
    });

    // collectibles
    this.collectibles.forEach((c) => c.sprite.destroy());
    this.collectibles = [];
    this.nextPickupX = this.rightWorldEdge() + 400;
    this.spawnCoin(this.placeCollectibleAtOrAfter(this.nextPickupX));
    this.spawnCoin(this.placeCollectibleAtOrAfter(this.nextPickupX + 300));
    this.spawnPowerup(this.placeCollectibleAtOrAfter(this.nextPickupX + 500), 'fly');
    this.spawnPowerup(this.placeCollectibleAtOrAfter(this.nextPickupX + 800), 'shield');
    this.spawnHeart(this.placeCollectibleAtOrAfter(this.nextPickupX + 1100));

    this.hideGameOver();
    this.hideStart();
    this.gameState = 'Playing';
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.app.destroy(true);
  }
}
