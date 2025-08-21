import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Application, Container, Graphics, Renderer, Text, Texture, Assets, AnimatedSprite, TilingSprite, Rectangle } from 'pixi.js';

type Facing = 'left' | 'right';
type Owner = 'player' | 'enemy';

interface Hitbox { x: number; y: number; w: number; h: number; until: number; damage: number; owner: Owner; knockX: number; isBoss?: boolean; }
interface LifeBar { g: Graphics; w: number; h: number; ox: number; oy: number; }

interface ActorBase { id: number; sprite: Container; body: Graphics; hp: number; hpMax: number; facing: Facing; x: number; y: number; w: number; h: number; lifebar: LifeBar; hurtUntil: number; kbVX: number; }
interface Player extends ActorBase { vx: number; vy: number; onGround: boolean; slash: Graphics; comboStep: 0 | 1 | 2 | 3; comboUntil: number; attackLockUntil: number; airAttacked: boolean; nextAttackAt: number; avatar: AnimatedSprite; animState: 'idle' | 'walk' | 'jump'; }
type EState = 'idle' | 'chase' | 'windup' | 'recover';
interface Enemy extends ActorBase { state: EState; vx: number; speed: number; attackRange: number; damage: number; windupMs: number; recoverMs: number; attackW: number; attackH: number; cdUntil: number; windupUntil: number; recoverUntil: number; tint: number; isBoss?: boolean; avatar?: AnimatedSprite; animState?: 'idle' | 'walk' | 'attack'; kind?: 'knight' | 'skeleton'; }
interface EnemyArchetype { key: 'knight' | 'skeleton'; w: number; h: number; baseHP: number; speed: number; attackRange: number; damage: number; windupMs: number; recoverMs: number; attackW: number; attackH: number; color: number; edge: number; weight: number; }

@Component({
  selector: 'beat-em-up-game',
  standalone: true,
  template: `<div #gameContainer class="game-host"></div>`,
  styles: [`
    :host, .game-host { display:block; width:100%; height:520px; }
    .game-host { background:#1f2430; }
  `],
})
export class BeatEmUpGameComponent implements OnInit, OnDestroy {
  @ViewChild('gameContainer', { static: true }) gameContainer!: ElementRef;
  app: Application<Renderer> = new Application();

  readonly EDGE_REACH = 16;

  world = new Container();
  bgLayer?: TilingSprite;

  cameraX = 0;
  worldWidth = 4600;
  viewH = 0;
  readonly GROUND_Y = 380;

  shakeAmp = 0;
  shakeUntil = 0;
  shakeX = 0;

  waitingStart = true;
  startTitle?: Text;
  startHelp?: Text;

  player!: Player;
  enemies: Enemy[] = [];
  activeHitboxes: Hitbox[] = [];

  wave = 1;
  nextWaveAt = -1;
  waveText!: Text;
  maxSimul = 4;
  reservedSpawns = 0;
  spawnCooldownUntil = 0;
  spawnBaseX = 800;

  leftHeld = false;
  rightHeld = false;
  upHeld = false;
  downHeld = false;
  jumpHeld = false;
  pendingAttack = false;
  attackBufferUntil = 0;

  readonly MOVE_SPEED = 300;
  readonly JUMP_VY    = -560;
  readonly GRAVITY    = 1500;
  readonly FRICTION   = 0.86;

  readonly COMBO_WINDOW    = 380;
  readonly ATTACK_COOLDOWN = 240;
  readonly ATTACK_LOCK_G   = 200;
  readonly ATTACK_LOCK_A   = 200;
  readonly INPUT_BUFFER    = 150;

  readonly PLAYER_VISUAL_SCALE = 1.38;
  readonly BG_PARALLAX = 0.22;

  hud!: Text;

  private idleFrames: Texture[] = [];
  private walkFrames: Texture[] = [];
  private jumpTex!: Texture;

  private enemyAnims: Record<'knight'|'skeleton', { idle: Texture[]; walk: Texture[]; attack: Texture[] }> = {
    knight:   { idle: [], walk: [], attack: [] },
    skeleton: { idle: [], walk: [], attack: [] },
  };
  private enemyMeta: Record<'knight'|'skeleton', { baseH: number }> = {
    knight:   { baseH: 1 },
    skeleton: { baseH: 1 },
  };

  private readonly ARCHETYPES: EnemyArchetype[] = [
    { key: 'knight',   w: 80, h: 108, baseHP: 18, speed: 110, attackRange: 90, damage: 3, windupMs: 220, recoverMs: 280, attackW: 80, attackH: 40, color: 0x555555, edge: 0x222222, weight: 0.8 },
    { key: 'skeleton', w: 74, h: 102, baseHP: 14, speed: 125, attackRange: 84, damage: 2, windupMs: 200, recoverMs: 240, attackW: 72, attackH: 34, color: 0x999999, edge: 0x333333, weight: 1.2 },
  ];
  private readonly BOSS: EnemyArchetype = { key: 'knight', w: 118, h: 150, baseHP: 120, speed: 85, attackRange: 122, damage: 6, windupMs: 420, recoverMs: 620, attackW: 132, attackH: 46, color: 0x8e44ad, edge: 0x4a235a, weight: 0 };

  private kd = (e: KeyboardEvent) => this.onKeyDown(e);
  private ku = (e: KeyboardEvent) => this.onKeyUp(e);
  private nextActorId = 1;
  gameOver = false;
  gameOverText?: Text;
  restartText?: Text;

  async ngOnInit(): Promise<void> {
    await this.app.init({ background: '#1f2430', resizeTo: this.gameContainer.nativeElement, antialias: true, resolution: 1, preference: 'webgl' });
    this.gameContainer.nativeElement.appendChild(this.app.canvas);
    this.viewH = this.app.renderer.height;

    this.idleFrames = await this.loadTextures(Array.from({ length: 8 }, (_, i) => `assets/RedDinosaur${i + 1}.png`));
    this.walkFrames = await this.loadTextures(Array.from({ length: 10 }, (_, i) => `assets/RedDinosaur${i + 9}.png`));
    this.jumpTex = this.idleFrames[3] ?? this.idleFrames[0];

    await this.loadKnightAnims();
    await this.loadSkeletonAnims();

    try {
      const bgTex = await Assets.load<Texture>('assets/beat-em-up-bg.png');
      this.bgLayer = new TilingSprite(bgTex, this.app.renderer.width, this.app.renderer.height);
      this.fitBackgroundToHeight();
      this.app.stage.addChild(this.bgLayer, this.world);
    } catch {
      this.app.stage.addChild(this.world);
    }

    this.setupScene();
    this.spawnPlayer();
    this.showStartScreen();

    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);

    this.app.ticker.add(() => this.update());
  }

  private async loadTextures(paths: string[]): Promise<Texture[]> {
    const arr: Texture[] = [];
    for (const p of paths) arr.push(await Assets.load<Texture>(p));
    return arr;
  }

  private async loadKnightAnims() {
    const idle   = await this.loadSeq('assets/knight/idle/sprite_', 1, 40, '.png');
    const walk   = await this.loadSeq('assets/knight/walk/run_', 1, 40, '.png');
    const attack = await this.loadSeq('assets/knight/attack/attack_', 1, 40, '.png');
    const idleU   = this.unifyFrames(idle);
    const walkU   = this.unifyFrames(walk.length ? walk : idle);
    const attackU = this.unifyFrames(attack.length ? attack : idle);
    this.enemyAnims.knight = { idle: idleU, walk: walkU, attack: attackU };
    const t0 = idleU[0] ?? walkU[0] ?? attackU[0];
    this.enemyMeta.knight.baseH = t0?.height ?? 1;
  }

  private async loadSkeletonAnims() {
    const idle   = await this.loadSeq('assets/skeleton/idle/skeleton_idle_', 1, 20, '.png');
    const walk   = await this.loadSeq('assets/skeleton/walk/skeleton_walk_', 1, 20, '.png');
    const attack = await this.loadSeq('assets/skeleton/attack/skeleton_attack_', 1, 20, '.png');
    const idleU   = this.unifyFrames(idle);
    const walkU   = this.unifyFrames(walk.length ? walk : idle);
    const attackU = this.unifyFrames(attack.length ? attack : idle);
    this.enemyAnims.skeleton = { idle: idleU, walk: walkU, attack: attackU };
    const t0 = idleU[0] ?? walkU[0] ?? attackU[0];
    this.enemyMeta.skeleton.baseH = t0?.height ?? 1;
  }

  private async loadSeq(prefix: string, from: number, to: number, ext: string): Promise<Texture[]> {
    const frames: Texture[] = [];
    for (let i = from; i <= to; i++) {
      try { frames.push(await Assets.load<Texture>(`${prefix}${i}${ext}`)); } catch {}
    }
    return frames;
  }

  private unifyFrames(input: Texture[]): Texture[] {
    if (!input.length) return [];
    const maxW = Math.max(...input.map(t => t.width));
    const maxH = Math.max(...input.map(t => t.height));
    const out: Texture[] = [];
    for (const tex of input) {
      const src = (tex as any).source?.resource?.source
        || (tex as any).baseTexture?.resource?.source
        || (tex as any).source?.source
        || (tex as any).baseTexture?.resource?.bitmap
        || (tex as any).baseTexture?.resource?.source;
      const w = tex.width, h = tex.height;
      const left = Math.floor((maxW - w) / 2);
      const top  = Math.max(0, maxH - h);
      const frame = new Rectangle(0, 0, w, h);
      const orig  = new Rectangle(0, 0, maxW, maxH);
      const trim  = new Rectangle(left, top, w, h);
      out.push(new Texture({ source: src, frame, orig, trim }));
    }
    return out;
  }

  private setupScene(): void {
    this.hud = new Text({ text: 'A/D: Move  |  W/S or ↑/↓: Aim  |  Space: Jump  |  J: Attack  |  R: Start / Restart', style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold' } });
    this.hud.x = 12; this.hud.y = 10;
    this.app.stage.addChild(this.hud);
    this.waveText = new Text({ text: '', style: { fill: 0xffe66d, fontFamily: 'Arial', fontSize: 20, fontWeight: '900' } });
    this.waveText.x = 12; this.waveText.y = 34;
    this.app.stage.addChild(this.waveText);
  }

  private showStartScreen(): void {
    this.waitingStart = true;
    const w = this.app.renderer.width;
    this.startTitle = new Text({ text: 'PIXEL BRAWL', style: { fill: 0xffe66d, fontFamily: 'Arial', fontSize: 44, fontWeight: '900' } });
    this.startTitle.x = (w - this.startTitle.width) / 2;
    this.startTitle.y = 120;
    this.app.stage.addChild(this.startTitle);
    const controls = 'Controls: A/D — Move • W/S — Aim • Space — Jump • J — Attack';
    this.startHelp = new Text({ text: controls + '\nPress R to START', style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 18, fontWeight: 'bold', align: 'center' } });
    this.startHelp.x = (w - this.startHelp.width) / 2;
    this.startHelp.y = 170;
    this.app.stage.addChild(this.startHelp);
  }

  private startGame(): void {
    if (this.startTitle) { this.startTitle.destroy(); this.startTitle = undefined; }
    if (this.startHelp) { this.startHelp.destroy(); this.startHelp = undefined; }
    this.waitingStart = false;
    this.wave = 1;
    this.spawnWave(this.wave);
  }

  private spawnPlayer(): void {
    const body = new Graphics();
    const slash = new Graphics();
    slash.visible = false;
    const avatar = new AnimatedSprite(this.idleFrames, true);
    avatar.anchor.set(0.5, 1);
    const hbW = 40, hbH = 60;
    avatar.x = hbW / 2;
    avatar.y = hbH;
    this.fitAvatarScale(avatar, hbW, hbH);
    avatar.animationSpeed = 0.12;
    avatar.play();
    body.addChild(avatar, slash);
    const lifebar: LifeBar = { g: new Graphics(), w: 48, h: 6, ox: -2, oy: -12 };
    const spriteRoot = new Container();
    spriteRoot.addChild(body, lifebar.g);
    this.world.addChild(spriteRoot);
    const hpMax = 14;
    this.player = { id: this.nextActorId++, sprite: spriteRoot, body, slash, hp: hpMax, hpMax, facing: 'right', x: 240, y: this.GROUND_Y - hbH, w: hbW, h: hbH, vx: 0, vy: 0, onGround: true, comboStep: 0, comboUntil: 0, attackLockUntil: 0, airAttacked: false, nextAttackAt: 0, lifebar, hurtUntil: 0, kbVX: 0, avatar, animState: 'idle' };
    this.updateLifeBar(this.player);
    this.commitPlayerTransform();
  }

  private fitAvatarScale(av: AnimatedSprite, hbW: number, hbH: number) {
    const texW = av.texture.width || 1;
    const texH = av.texture.height || 1;
    const sx = (hbW * this.PLAYER_VISUAL_SCALE) / texW;
    const sy = (hbH * this.PLAYER_VISUAL_SCALE) / texH;
    av.scale.set(sx, sy);
  }

  private spawnWave(n: number): void {
    this.activeHitboxes = [];
    this.player.hp = this.player.hpMax;
    this.updateLifeBar(this.player);
    let count = Math.min(3 + n, 9);
    let boss = false;
    if (n % 5 === 0) { count = 1; boss = true; }
    const now = performance.now();
    this.spawnBaseX = Math.min(this.worldWidth - 400, Math.max(this.player.x + 420, 600));
    const batch = Math.min(count, this.maxSimul);
    for (let i = 0; i < batch; i++) {
      const type = boss ? this.BOSS : this.pickArchetypeForWave(n);
      const x = this.spawnBaseX + i * 140 + Math.random() * 40;
      const e = this.makeEnemyFromType(type, x, n, boss);
      this.enemies.push(e);
    }
    this.reservedSpawns = count - batch;
    this.spawnCooldownUntil = now + 600;
    this.waveText.text = boss ? `WAVE ${n} — BOSS` : `Wave ${n}`;
    this.waveText.alpha = 1;
    let t = 0;
    const showMs = 1200;
    const tick = () => { t += this.app.ticker.deltaMS; this.waveText.alpha = Math.max(0, 1 - t / showMs); if (t >= showMs) this.app.ticker.remove(tick); };
    this.app.ticker.add(tick);
  }

  private trySpawnFromReserve(now: number): void {
    if (this.reservedSpawns <= 0) return;
    if (this.enemies.length >= this.maxSimul) return;
    if (now < this.spawnCooldownUntil) return;
    const type = this.pickArchetypeForWave(this.wave);
    const x = this.spawnBaseX + Math.random() * 180 + 40;
    const e = this.makeEnemyFromType(type, x, this.wave, false);
    this.enemies.push(e);
    this.reservedSpawns--;
    this.spawnCooldownUntil = now + 420;
  }

  private pickArchetypeForWave(_wave: number): EnemyArchetype {
    const pool = this.ARCHETYPES.map(a => ({ a, w: a.weight }));
    const sum = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * sum;
    for (const p of pool) { if ((r -= p.w) <= 0) return p.a; }
    return pool[0].a;
  }

  private makeEnemyFromType(t: EnemyArchetype, x: number, wave: number, isBoss = false): Enemy {
    const sprite = new Container();
    const body = new Graphics().roundRect(0, 0, t.w, t.h, Math.min(10, t.w / 4)).fill({ color: 0x000000, alpha: 0 }).stroke({ width: 0 });
    const lbW = Math.max(60, t.w + (isBoss ? 36 : 10));
    const lbOY = -Math.max(12, Math.floor(t.h * 0.22));
    const lifebar: LifeBar = { g: new Graphics(), w: lbW, h: isBoss ? 8 : 6, ox: 0, oy: lbOY };
    let avatar: AnimatedSprite | undefined;
    const set = this.enemyAnims[t.key];
    if (set.idle.length) {
      avatar = new AnimatedSprite(set.idle, true);
      avatar.anchor.set(0.5, 1);
      avatar.x = t.w / 2;
      avatar.y = t.h;
      const s = t.h / (this.enemyMeta[t.key].baseH || 1);
      avatar.scale.set(s, s);
      avatar.animationSpeed = 0.12;
      avatar.play();
      sprite.addChild(avatar);
    }
    sprite.addChild(body, lifebar.g);
    this.world.addChild(sprite);
    const hpMax = Math.round(t.baseHP + wave * (isBoss ? 6 : 2));
    const e: Enemy = { id: this.nextActorId++, sprite, body, hp: hpMax, hpMax, facing: 'left', x, y: this.GROUND_Y - t.h, w: t.w, h: t.h, vx: 0, speed: isBoss ? Math.max(60, t.speed - 15) : t.speed, attackRange: isBoss ? t.attackRange + 14 : t.attackRange, damage: isBoss ? t.damage + 2 : t.damage, windupMs: isBoss ? t.windupMs + 120 : t.windupMs, recoverMs: isBoss ? t.recoverMs + 200 : t.recoverMs, attackW: isBoss ? t.attackW + 18 : t.attackW, attackH: isBoss ? t.attackH + 6 : t.attackH, state: 'idle', cdUntil: 0, windupUntil: 0, recoverUntil: 0, lifebar, tint: t.color, hurtUntil: 0, kbVX: 0, isBoss, avatar, animState: 'idle', kind: t.key };
    this.updateLifeBar(e);
    this.commitEnemyTransform(e);
    return e;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.leftHeld = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') this.rightHeld = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') this.upHeld = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') this.downHeld = true;
    if (e.code === 'Space') this.jumpHeld = true;
    if (e.code === 'KeyJ') { if (e.repeat) return; this.pendingAttack = true; this.attackBufferUntil = performance.now() + this.INPUT_BUFFER; }
    if (e.code === 'KeyR') { if (this.waitingStart) this.startGame(); else if (this.gameOver) this.resetGame(); else this.resetGame(); }
  }
  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.leftHeld = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') this.rightHeld = false;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') this.upHeld = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') this.downHeld = false;
    if (e.code === 'Space') this.jumpHeld = false;
  }

  private update(): void {
    if (this.gameOver || this.waitingStart) return;
    const dt = this.app.ticker.deltaMS / 1000;
    const now = performance.now();
    this.updatePlayer(now, dt);
    this.updateEnemies(now, dt);
    this.resolveHits(now);
    this.trySpawnFromReserve(now);
    this.updateCamera(now);
    if (this.enemies.length === 0 && this.reservedSpawns === 0 && this.nextWaveAt < 0) this.nextWaveAt = now + 800;
    if (this.nextWaveAt > 0 && now >= this.nextWaveAt) { this.wave++; this.spawnWave(this.wave); this.nextWaveAt = -1; }
  }

  private updatePlayer(now: number, dt: number): void {
    const p = this.player;
    if (this.rightHeld) p.facing = 'right'; else if (this.leftHeld) p.facing = 'left';
    const locked = now < p.attackLockUntil;
    if (!locked) {
      if (this.leftHeld && !this.rightHeld)      p.vx = -this.MOVE_SPEED;
      else if (this.rightHeld && !this.leftHeld) p.vx =  this.MOVE_SPEED;
      else                                        p.vx *= this.FRICTION;
    }
    if (!locked && p.onGround && this.jumpHeld) { p.vy = this.JUMP_VY; p.onGround = false; p.airAttacked = false; }
    p.vy += this.GRAVITY * dt;
    p.x += (p.vx + p.kbVX) * dt;
    p.y += p.vy * dt;
    p.kbVX *= 0.86;
    p.x = Math.max(0, Math.min(this.worldWidth - p.w, p.x));
    if (p.y >= this.GROUND_Y - p.h) { p.y = this.GROUND_Y - p.h; p.vy = 0; p.onGround = true; } else p.onGround = false;
    if (this.pendingAttack) {
      const ready = now >= p.nextAttackAt && now >= p.attackLockUntil;
      if (ready) { this.doPlayerAttack(now); this.pendingAttack = false; }
      else if (now > this.attackBufferUntil) this.pendingAttack = false;
    }
    const tilt = p.onGround ? (p.vx / this.MOVE_SPEED) * 0.08 : 0;
    p.body.angle = tilt * 57.3;
    this.applyHurtFX(p, now);
    this.hud.text = `A/D: Move  |  W/S or ↑/↓: Aim  |  Space: Jump  |  J: Attack  |  R: Start / Restart`;
    const moving = Math.abs(p.vx) > 40 && p.onGround && now >= p.attackLockUntil;
    if (!p.onGround) this.setPlayerAnim('jump');
    else if (moving) this.setPlayerAnim('walk', Math.min(0.36, 0.14 + 0.24 * (Math.abs(p.vx) / this.MOVE_SPEED)));
    else this.setPlayerAnim('idle', 0.12);
    this.updateLifeBar(p);
    this.commitPlayerTransform();
  }

  private setPlayerAnim(state: 'idle'|'walk'|'jump', speed: number = 0.12) {
    const p = this.player;
    if (p.animState === state) { if (state === 'walk') p.avatar.animationSpeed = speed; return; }
    p.animState = state;
    if (state === 'idle') { p.avatar.textures = this.idleFrames; this.fitAvatarScale(p.avatar, p.w, p.h); p.avatar.animationSpeed = speed; p.avatar.play(); }
    else if (state === 'walk') { p.avatar.textures = this.walkFrames; this.fitAvatarScale(p.avatar, p.w, p.h); p.avatar.animationSpeed = speed; p.avatar.play(); }
    else { p.avatar.stop(); p.avatar.textures = [this.jumpTex]; this.fitAvatarScale(p.avatar, p.w, p.h); p.avatar.gotoAndStop(0); }
  }

  private doPlayerAttack(now: number): void {
    const p = this.player;
    if (this.leftHeld && !this.rightHeld) p.facing = 'left';
    else if (this.rightHeld && !this.leftHeld) p.facing = 'right';

    const reach = this.EDGE_REACH; // наскільки далі від краю тягнеться удар

    if (!p.onGround) {
      if (p.airAttacked) return;
      p.airAttacked = true;
      p.attackLockUntil = now + this.ATTACK_LOCK_A;
      p.nextAttackAt    = now + this.ATTACK_COOLDOWN;

      const dir = p.facing === 'right' ? 1 : -1;

      if (this.downHeld && p.vy > 0) {
        const w = 40 + Math.floor(reach * 0.6), h = 28;
        const ox = dir > 0 ? p.w : -w;  // від краю!
        const oy = p.h - h - 4;
        this.playSlash('air', dir);
        this.spawnHitbox({ owner: 'player', damage: 4, knockX: 120 * dir, x: p.x + ox, y: p.y + oy, w, h, until: now + 180 });
      } else if (this.upHeld) {
        const w = 28, h = 50;
        const ox = (p.w - w) / 2 + (dir > 0 ? 10 : -10);
        const oy = 4;
        this.playSlash('up', dir);
        this.spawnHitbox({ owner: 'player', damage: 3, knockX: 160 * dir, x: p.x + ox, y: p.y + oy, w, h, until: now + 200 });
      } else {
        const w = 56 + reach, h = 24;
        const ox = dir > 0 ? p.w : -w;  // від краю!
        const oy = 26;
        this.playSlash('air', dir);
        this.spawnHitbox({ owner: 'player', damage: 3, knockX: 200 * dir, x: p.x + ox, y: p.y + oy, w, h, until: now + 200 });
      }

      // близька «тілесна» зона — лишаю як є
      this.spawnHitbox({ owner: 'player', damage: 2, knockX: 0, x: p.x - 6, y: p.y + 10, w: p.w + 12, h: p.h - 20, until: now + 120 });
      this.setShake(6, 120);
      return;
    }

    if (now > p.comboUntil) p.comboStep = 0;
    p.comboStep = (Math.min(3, p.comboStep + 1) as 1 | 2 | 3);
    p.comboUntil = now + this.COMBO_WINDOW;
    p.attackLockUntil = now + this.ATTACK_LOCK_G;
    p.nextAttackAt    = now + this.ATTACK_COOLDOWN;

    const dir = p.facing === 'right' ? 1 : -1;

    if (this.upHeld) {
      const w = 34, h = 62;
      const ox = (p.w - w) / 2 + (dir > 0 ? 8 : -8);
      const oy = -4;
      this.playSlash('up', dir);
      this.spawnHitbox({ owner: 'player', damage: 4, knockX: 160 * dir, x: p.x + ox, y: p.y + oy, w, h, until: now + 220 });
    } else if (this.downHeld) {
      const w = 66 + Math.floor(reach * 0.5), h = 26;
      const ox = dir > 0 ? p.w : -w; // від краю!
      const oy = p.h - h - 6;
      this.playSlash('down', dir);
      this.spawnHitbox({ owner: 'player', damage: 4, knockX: 180 * dir, x: p.x + ox, y: p.y + oy, w, h, until: now + 220 });
    } else {
      const combo = [
        { w: 50 + reach, h: 26, dmg: 3, kb: 180, life: 200, oy: 32 },
        { w: 64 + reach, h: 26, dmg: 4, kb: 220, life: 220, oy: 30 },
        { w: 80 + reach, h: 30, dmg: 6, kb: 260, life: 240, oy: 26 },
      ] as const;
      const spec = combo[p.comboStep - 1];
      const ox = dir > 0 ? p.w : -spec.w; // від краю!
      this.playSlash(p.comboStep === 1 ? 'f1' : p.comboStep === 2 ? 'f2' : 'f3', dir);
      this.spawnHitbox({ owner: 'player', damage: spec.dmg, knockX: spec.kb * dir, x: p.x + ox, y: p.y + spec.oy, w: spec.w, h: spec.h, until: now + spec.life });
    }

    this.spawnHitbox({ owner: 'player', damage: 2, knockX: 0, x: p.x - 8, y: p.y + 12, w: p.w + 16, h: p.h - 24, until: now + 140 });
    this.setShake(p.comboStep === 3 ? 10 : 6, 140);
  }

  private playSlash(mode: 'f1'|'f2'|'f3'|'up'|'down'|'air', dir: number) {
    const p = this.player;
    const g = p.slash;

    // базові форми (радіус і кути)
    const base = {
      f1:  { r: 46, a0: -0.8, a1: 0.55, life: 200, oy: 32 },
      f2:  { r: 62, a0: -0.5, a1: 0.95, life: 220, oy: 30 },
      f3:  { r: 78, a0: -0.3, a1: 1.25, life: 240, oy: 26 },
      up:  { r: 54, a0: -1.4, a1: -0.2, life: 220, oy:  2 },
      down:{ r: 54, a0:  0.2, a1:  1.3,  life: 220, oy: 44 },
      air: { r: 54, a0: -0.9, a1:  0.9,  life: 220, oy: 26 },
    }[mode];

    g.visible = true;
    g.alpha = 0.95;
    (g as any).blendMode = 'add';
    g.clear();
    g.moveTo(0, 0).arc(0, 0, base.r, base.a0, base.a1).lineTo(0, 0).fill({ color: 0xffffff, alpha: 0.95 });

    // головне: X слеша тепер на самому краї моделі
    const edgeX = (mode === 'up') ? (dir > 0 ? 12 : -12) : (p.w - 2); // up трохи від центру, інші — з краю
    g.x = edgeX * dir;
    g.y = base.oy;
    g.scale.set(dir, 1);

    const b = p.body;
    b.scale.y = 0.9; b.scale.x = 1.08;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let t = 0;
    const startDeg = -40, endDeg = 50;
    const step = () => {
      t += this.app.ticker.deltaMS;
      const kLin = Math.min(1, t / base.life);
      const k = ease(kLin);
      g.angle = (startDeg + (endDeg - startDeg) * k) * (dir > 0 ? 1 : -1);
      g.alpha = 0.95 * (1 - k);
      const bx = 1.08 - 0.08 * k;
      const by = 0.9  + 0.10 * k;
      b.scale.set(bx, by);
      if (kLin >= 1) { this.app.ticker.remove(step); g.visible = false; b.scale.set(1, 1); }
    };
    this.app.ticker.add(step);
  }

  private updateEnemies(now: number, dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      e.facing = (p.x > e.x) ? 'right' : 'left';
      switch (e.state) {
        case 'idle':
        case 'chase': {
          const dx = p.x - e.x; const dist = Math.abs(dx);
          if (dist > e.attackRange * 0.9) { e.state = 'chase'; e.vx = Math.sign(dx) * e.speed; this.setEnemyAnim(e, 'walk', 0.16); }
          else { e.vx = 0; this.setEnemyAnim(e, 'idle', 0.12); if (now >= e.cdUntil) { e.state = 'windup'; e.windupUntil = now + e.windupMs; this.setEnemyAnim(e, 'attack', 0.22); } }
          break;
        }
        case 'windup': {
          e.vx = 0;
          if (now >= e.windupUntil) {
            const dir = e.facing === 'right' ? 1 : -1;
            const oy = Math.max(22, Math.floor(e.h * 0.33));
            const w = e.attackW, h = e.attackH;
            const ox = dir > 0 ? e.w - 8 : -w + 8;
            this.spawnHitbox({ owner: 'enemy', damage: e.isBoss ? e.damage + 2 : e.damage, isBoss: e.isBoss, knockX: 280 * dir, x: e.x + ox, y: e.y + oy, w, h, until: now + Math.max(140, Math.floor(e.recoverMs * 0.5)) });
            e.state = 'recover';
            e.recoverUntil = now + e.recoverMs;
            e.cdUntil = now + (e.recoverMs + 260);
          }
          break;
        }
        case 'recover': {
          e.vx = 0;
          this.setEnemyAnim(e, 'idle', 0.12);
          if (now >= e.recoverUntil) e.state = 'idle';
          break;
        }
      }
      e.x += (e.vx + e.kbVX) * dt;
      e.kbVX *= 0.86;
      e.x = Math.max(0, Math.min(this.worldWidth - e.w, e.x));
      e.y = this.GROUND_Y - e.h;
      this.applyHurtFX(e, now);
      this.commitEnemyTransform(e);
    }
  }

  private setEnemyAnim(e: Enemy, state: 'idle'|'walk'|'attack', speed: number) {
    const kind = e.kind ?? 'knight';
    const set = this.enemyAnims[kind];
    if (!e.avatar || !set) return;
    if (e.animState === state) { if (state !== 'attack') e.avatar.animationSpeed = speed; return; }
    e.animState = state;
    const frames = state === 'idle' ? set.idle : state === 'walk' ? (set.walk.length ? set.walk : set.idle) : (set.attack.length ? set.attack : set.idle);
    if (frames.length) {
      e.avatar.textures = frames;
      const s = e.h / (this.enemyMeta[kind].baseH || 1);
      e.avatar.scale.set(s, s);
      e.avatar.animationSpeed = speed;
      e.avatar.loop = state !== 'attack';
      e.avatar.gotoAndPlay(0);
      if (!e.avatar.loop) e.avatar.onComplete = () => { if (e.animState === 'attack') this.setEnemyAnim(e, 'idle', 0.12); };
    }
  }

  private spawnHitbox(h: Hitbox): void { this.activeHitboxes.push(h); }

  private resolveHits(now: number): void {
    for (const hb of this.activeHitboxes) {
      if (hb.owner !== 'player') continue;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (!this.rectOverlapHB(hb, e)) continue;
        if (now < e.hurtUntil) continue;
        e.hp = Math.max(0, e.hp - hb.damage);
        e.hurtUntil = now + 180;
        e.kbVX += hb.knockX * 0.006;
        this.updateLifeBar(e);
        this.setShake(e.isBoss ? 10 : 6, 120);
        if (e.hp <= 0) {
          e.sprite.destroy();
          this.enemies.splice(i, 1);
          const heal = Math.max(1, Math.round((e.isBoss ? 3 : e.damage) * 0.3));
          this.player.hp = Math.min(this.player.hpMax, this.player.hp + heal);
          this.updateLifeBar(this.player);
        }
      }
    }
    for (const hb of this.activeHitboxes) {
      if (hb.owner !== 'enemy') continue;
      const p = this.player;
      if (!this.rectOverlapHB(hb, p)) continue;
      if (now < p.hurtUntil) continue;
      const dmg = hb.isBoss ? Math.max(3, Math.min(6, hb.damage)) : hb.damage;
      p.hp = Math.max(0, p.hp - dmg);
      p.hurtUntil = now + 550;
      p.kbVX += hb.knockX * 0.006;
      this.updateLifeBar(p);
      this.setShake(10, 160);
      if (p.hp <= 0 && !this.gameOver) { this.triggerGameOver(); return; }
    }
    this.activeHitboxes = this.activeHitboxes.filter(h => now < h.until);
  }

  private rectOverlapHB(hb: Hitbox, a: ActorBase): boolean {
    const padX = (a as any).isBoss ? 12 : 4;
    const ax0 = a.x - padX;
    const ax1 = a.x + a.w + padX;
    const ay0 = a.y;
    const ay1 = a.y + a.h;

    const hx0 = hb.x;
    const hx1 = hb.x + hb.w;
    const hy0 = hb.y;
    const hy1 = hb.y + hb.h;

    return hx0 < ax1 && hx1 > ax0 && hy0 < ay1 && hy1 > ay0;
  }

  private updateLifeBar(a: ActorBase): void {
    const lb = a.lifebar;
    const g = lb.g;
    const ratio = Math.max(0, Math.min(1, a.hp / a.hpMax));
    g.clear();
    g.rect(0, 0, lb.w, lb.h).fill({ color: 0x111418, alpha: 0.9 }).stroke({ width: 1, color: 0x222830, alpha: 0.9 });
    g.rect(1, 1, (lb.w - 2) * ratio, lb.h - 2).fill({ color: ratio > 0.5 ? 0x9be15d : 0xffc857 });
    g.x = a.w / 2 - lb.w / 2 + lb.ox;
    g.y = lb.oy;
  }

  private applyHurtFX(a: ActorBase, now: number): void {
    const pulse = (Math.sin(now * 0.05) + 1) * 0.5;
    const val = (now < a.hurtUntil) ? (0.5 + 0.5 * pulse) : 1;
    const anyA = a as any;
    if (anyA.avatar) anyA.avatar.alpha = val;
    else a.body.alpha = val;
  }

  private fitBackgroundToHeight(): void {
    if (!this.bgLayer) return;
    const viewW = this.app.renderer.width;
    const viewH = this.app.renderer.height;
    const texH  = this.bgLayer.texture.height || 1;
    const scale = viewH / texH;
    this.bgLayer.tileScale.set(scale, scale);
    this.bgLayer.width  = viewW;
    this.bgLayer.height = viewH;
    this.bgLayer.x = 0; this.bgLayer.y = 0;
  }

  private updateCamera(now: number): void {
    const target = this.player.x;
    const viewW = this.app.renderer.width;
    const margin = 140;
    const left = this.cameraX + margin;
    const right = this.cameraX + viewW - margin;
    if (target < left)  this.cameraX = Math.max(0, target - margin);
    if (target > right) this.cameraX = Math.min(this.worldWidth - viewW, target - (viewW - margin));
    if (now < this.shakeUntil && this.shakeAmp > 0) { this.shakeX = (Math.random() * 2 - 1) * this.shakeAmp; this.shakeAmp *= 0.9; }
    else this.shakeX = 0;
    if (this.bgLayer) {
      if (this.bgLayer.width !== this.app.renderer.width || this.bgLayer.height !== this.app.renderer.height) {
        this.bgLayer.width  = this.app.renderer.width;
        this.bgLayer.height = this.app.renderer.height;
        this.fitBackgroundToHeight();
      }
      this.bgLayer.tilePosition.x = -this.cameraX * this.BG_PARALLAX;
      this.bgLayer.x = this.shakeX * this.BG_PARALLAX;
    }
    this.world.x = -this.cameraX + this.shakeX;
  }

  private setShake(amp: number, durationMs: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeUntil = Math.max(this.shakeUntil, performance.now() + durationMs);
  }

  private commitPlayerTransform(): void {
    const p = this.player;
    p.sprite.x = Math.round(p.x);
    p.sprite.y = Math.round(p.y);
    const dir = p.facing === 'right' ? 1 : -1;
    p.sprite.scale.x = dir;
    p.body.x = dir > 0 ? 0 : -p.w;
  }

  private commitEnemyTransform(e: Enemy): void {
    e.sprite.x = Math.round(e.x);
    e.sprite.y = Math.round(e.y);
    const dir = e.facing === 'right' ? 1 : -1;
    e.sprite.scale.x = dir;
    e.body.x = dir > 0 ? 0 : -e.w;
    this.updateLifeBar(e);
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.gameOverText = new Text({ text: 'GAME OVER', style: { fill: 0xff6b6b, fontFamily: 'Arial', fontSize: 42, fontWeight: '900' } });
    this.gameOverText.x = (this.app.renderer.width - this.gameOverText.width) / 2;
    this.gameOverText.y = 90;
    this.app.stage.addChild(this.gameOverText);
    this.restartText = new Text({ text: 'Press R to restart', style: { fill: 0xffffff, fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold' } });
    this.restartText.x = (this.app.renderer.width - this.restartText.width) / 2;
    this.restartText.y = 140;
    this.app.stage.addChild(this.restartText);
  }

  private resetGame(): void {
    if (this.gameOverText) { this.gameOverText.destroy(); this.gameOverText = undefined; }
    if (this.restartText) { this.restartText.destroy(); this.restartText = undefined; }
    for (const e of this.enemies) e.sprite.destroy();
    this.enemies = [];
    this.activeHitboxes = [];
    const p = this.player;
    p.hp = p.hpMax; p.hurtUntil = 0; p.x = 240; p.y = this.GROUND_Y - p.h;
    p.vx = 0; p.vy = 0; p.kbVX = 0; p.facing = 'right';
    p.comboStep = 0; p.comboUntil = 0; p.attackLockUntil = 0; p.airAttacked = false; p.nextAttackAt = 0;
    p.animState = 'idle'; p.avatar.textures = this.idleFrames; p.avatar.animationSpeed = 0.12; p.avatar.play();
    this.fitAvatarScale(p.avatar, p.w, p.h);
    this.updateLifeBar(p);
    this.commitPlayerTransform();
    this.cameraX = 0; this.world.x = 0; this.wave = 1; this.reservedSpawns = 0; this.spawnCooldownUntil = 0; this.nextWaveAt = -1;
    this.shakeAmp = 0; this.shakeUntil = 0; this.shakeX = 0;
    this.gameOver = false;
    this.showStartScreen();
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.app.destroy(true);
  }
}
