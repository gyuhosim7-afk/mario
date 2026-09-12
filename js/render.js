/* =============================================================
 * render.js - Mode-7 의사 3D 렌더러 + 빌보드 스프라이트 + 동적 카메라
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const S = D.SURFACE;

  /* ------------------------------------------------------------------
   * 동적 카메라 (Smooth Follow)
   *  - 부스터/고속 시 FOV 확대 + 거리 증가
   *  - 피격 시 흔들림
   * ------------------------------------------------------------------ */
  class Camera {
    constructor() {
      this.x = 0; this.y = 0; this.h = 96;
      this.yaw = 0;
      this.focal = 210;
      this.dist = 176;
      this.shake = 0;
      this.shakeX = 0; this.shakeY = 0;
      this.pitch = 0;
      this.introT = 0;
    }
    follow(k, dt, opts) {
      const boosting = k.boostTimer > 0 || k.state === 'BULLET';
      const sr = Math.max(0, Math.min(1.4, k.speedRatio));
      const targetDist = 168 + sr * 34 + (boosting ? 30 : 0);
      const targetFocal = 232 - sr * 22 - (boosting ? 26 : 0);      // 작을수록 넓은 시야각
      const targetH = 92 + sr * 12 + k.z * 0.55;

      let yaw = k.angle;
      // 드리프트 중에는 진행 방향을 살짝 앞서 본다
      if (k.drifting) yaw += k.driftDir * 0.22;
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const lag = k.controllable ? 7.5 : 3.2;
      this.yaw += dy * Math.min(1, dt * lag);

      this.dist += (targetDist - this.dist) * Math.min(1, dt * 4);
      this.focal += (targetFocal - this.focal) * Math.min(1, dt * 3.4);
      this.h += (targetH - this.h) * Math.min(1, dt * 5);

      const tx = k.x - Math.cos(this.yaw) * this.dist;
      const ty = k.y - Math.sin(this.yaw) * this.dist;
      this.x += (tx - this.x) * Math.min(1, dt * 11);
      this.y += (ty - this.y) * Math.min(1, dt * 11);

      this.shake = Math.max(this.shake, k.shake);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * this.shake * 13;
      this.shakeX = (Math.random() - 0.5) * s;
      this.shakeY = (Math.random() - 0.5) * s;
      this.pitch = k.z * 0.15;
    }
  }

  /* ------------------------------------------------------------------
   * 렌더러
   * ------------------------------------------------------------------ */
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.bw = 480; this.bh = 270;
      this.buf = document.createElement('canvas');
      this.buf.width = this.bw; this.buf.height = this.bh;
      this.bctx = this.buf.getContext('2d');
      this.img = this.bctx.createImageData(this.bw, this.bh);
      this.px = new Uint32Array(this.img.data.buffer);
      this.camera = new Camera();
      this.particles = [];
      this.flash = 0;
      this.flashColor = '255,255,255';
      this.time = 0;
    }

    resize(w, h) {
      this.canvas.width = w; this.canvas.height = h;
      const targetW = Math.min(640, Math.max(360, Math.round(w / 2.6)));
      const targetH = Math.round(targetW * (h / w));
      if (targetW !== this.bw || targetH !== this.bh) {
        this.bw = targetW; this.bh = targetH;
        this.buf.width = targetW; this.buf.height = targetH;
        this.img = this.bctx.createImageData(targetW, targetH);
        this.px = new Uint32Array(this.img.data.buffer);
      }
    }

    /* ---------- 3D -> 화면 투영 ---------- */
    project(wx, wy, wz) {
      const c = this.camera;
      const rx = wx - c.x, ry = wy - c.y;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
      const fwd = rx * cy + ry * sy;
      const side = -rx * sy + ry * cy;
      if (fwd < 12) return null;
      const k = this.scaleK;
      const sx = (this.bw / 2 + (side / fwd) * c.focal) * k + this.offX;
      const syy = (this.horizon + ((c.h - (wz || 0)) / fwd) * c.focal) * k + this.offY;
      return { x: sx, y: syy, fwd, scale: c.focal / fwd * k };
    }

    /* ---------- 지면(mode-7) ---------- */
    drawGround(track) {
      const c = this.camera, W = this.bw, H = this.bh;
      const px = this.px;
      const horizon = this.horizon;
      const tex = track.pixels, TW = track.world;
      const fogRGB = hexToRgb(track.def.fog);
      const voidCol = 0xff000000 | (fogRGB.b << 16) | (fogRGB.g << 8) | fogRGB.r;
      const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);

      // 지평선 위는 투명 (하늘은 별도 렌더)
      const top = Math.max(0, Math.min(H, Math.ceil(horizon)));
      px.fill(0, 0, top * W);

      for (let y = top; y < H; y++) {
        const dy = y - horizon;
        if (dy <= 0.5) { px.fill(voidCol, y * W, y * W + W); continue; }
        const fwd = (c.h * c.focal) / dy;
        const step = fwd / c.focal;
        let wx = c.x + cy * fwd - sy * (-W / 2) * step;
        let wy = c.y + sy * fwd + cy * (-W / 2) * step;
        const dwx = -sy * step, dwy = cy * step;

        // 거리 안개
        let fog = (fwd - 340) / 1500;
        fog = fog < 0 ? 0 : (fog > 0.82 ? 0.82 : fog);
        const fa = (fog * 256) | 0, ia = 256 - fa;
        const fr = fogRGB.r * fa, fg = fogRGB.g * fa, fb = fogRGB.b * fa;

        let o = y * W;
        if (fa < 4) {
          for (let x = 0; x < W; x++, o++) {
            const ix = wx | 0, iy = wy | 0;
            px[o] = (ix < 0 || iy < 0 || ix >= TW || iy >= TW) ? voidCol : tex[iy * TW + ix];
            wx += dwx; wy += dwy;
          }
        } else {
          for (let x = 0; x < W; x++, o++) {
            const ix = wx | 0, iy = wy | 0;
            const t = (ix < 0 || iy < 0 || ix >= TW || iy >= TW) ? voidCol : tex[iy * TW + ix];
            px[o] = 0xff000000 |
              ((((t >> 16 & 255) * ia + fb) >> 8) << 16) |
              ((((t >> 8 & 255) * ia + fg) >> 8) << 8) |
              (((t & 255) * ia + fr) >> 8);
            wx += dwx; wy += dwy;
          }
        }
      }
      this.bctx.putImageData(this.img, 0, 0);
    }

    /* ---------- 하늘 / 배경 ---------- */
    drawSky(track) {
      const ctx = this.ctx, c = this.camera;
      const W = this.canvas.width, H = this.canvas.height;
      const hy = this.horizon * this.scaleK + this.offY;
      const def = track.def;
      const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, hy));
      g.addColorStop(0, def.sky[0]); g.addColorStop(1, def.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Math.max(0, hy));

      const par = (-c.yaw / (Math.PI * 2)) * W * 3.2;
      const wrap = (x) => ((x % (W * 3.2)) + W * 3.2) % (W * 3.2) - W * 0.6;

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, hy)); ctx.clip();

      if (def.theme === 'circuit') {
        // 구름
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 9; i++) {
          const x = wrap(par + i * 340), y = hy * (0.16 + (i % 3) * 0.14);
          for (let b = 0; b < 4; b++) {
            ctx.beginPath();
            ctx.ellipse(x + b * 26, y + (b % 2) * 6, 34 - b * 3, 15 - b, 0, 0, 6.28); ctx.fill();
          }
        }
        // 웅장한 피치 성
        const cx = wrap(par + 520), base = hy;
        ctx.fillStyle = '#e8e4dc';
        ctx.fillRect(cx - 66, base - 96, 132, 96);
        ctx.fillStyle = '#d6d2c8'; ctx.fillRect(cx - 22, base - 132, 44, 132);
        [[-66, 74], [66, 74], [-22, 132], [22, 132], [0, 158]].forEach(t => {
          ctx.fillStyle = '#efe9e0'; ctx.fillRect(cx + t[0] - 12, base - t[1], 24, t[1]);
          ctx.fillStyle = '#e04a3a';
          ctx.beginPath(); ctx.moveTo(cx + t[0] - 17, base - t[1]); ctx.lineTo(cx + t[0], base - t[1] - 26); ctx.lineTo(cx + t[0] + 17, base - t[1]); ctx.closePath(); ctx.fill();
        });
        ctx.fillStyle = '#3a6fbf';
        ctx.beginPath(); ctx.arc(cx, base - 150, 12, 0, 6.28); ctx.fill();
        // 관중석 스탠드 실루엣
        ctx.fillStyle = 'rgba(60,90,60,0.35)';
        for (let i = 0; i < 12; i++) {
          const x = wrap(par + i * 260 + 130);
          ctx.fillRect(x, hy - 26, 150, 26);
        }
      } else if (def.theme === 'bowser') {
        // 열기로 일렁이는 화산 하늘
        for (let i = 0; i < 7; i++) {
          const x = wrap(par + i * 400), y = hy * (0.2 + (i % 3) * 0.16);
          const rg = ctx.createRadialGradient(x, y, 2, x, y, 90);
          rg.addColorStop(0, 'rgba(255,140,40,0.28)'); rg.addColorStop(1, 'rgba(255,60,10,0)');
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 90, 0, 6.28); ctx.fill();
        }
        ctx.fillStyle = '#170805';
        for (let i = 0; i < 10; i++) {
          const x = wrap(par + i * 300);
          ctx.beginPath(); ctx.moveTo(x - 120, hy); ctx.lineTo(x, hy - 90 - (i % 3) * 40); ctx.lineTo(x + 120, hy); ctx.closePath(); ctx.fill();
        }
        // 성벽 실루엣
        ctx.fillStyle = '#0e0503';
        const cx = wrap(par + 700);
        ctx.fillRect(cx - 110, hy - 150, 220, 150);
        for (let i = 0; i < 7; i++) ctx.fillRect(cx - 110 + i * 33, hy - 172, 20, 24);
        ctx.fillStyle = '#ff7a1e';
        for (let i = 0; i < 5; i++) ctx.fillRect(cx - 80 + i * 38, hy - 110, 12, 20);
      } else {
        // 무지개 로드: 칠흑의 우주, 토성의 띠와 별 소행성
        for (let i = 0; i < 130; i++) {
          const x = wrap(par * 0.4 + i * 97), y = (i * 53) % Math.max(1, hy);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + (i % 5) * 0.15) + ')';
          ctx.fillRect(x, y, 2, 2);
        }
        const sx = wrap(par * 0.7 + 420), sy2 = hy * 0.34;
        ctx.save(); ctx.translate(sx, sy2); ctx.rotate(-0.32);
        const pg = ctx.createRadialGradient(-14, -14, 4, 0, 0, 52);
        pg.addColorStop(0, '#ffe0a8'); pg.addColorStop(1, '#c98a3a');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.28); ctx.fill();
        ctx.strokeStyle = 'rgba(240,214,170,0.85)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.ellipse(0, 0, 88, 22, 0, 0, 6.28); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,170,130,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, 104, 27, 0, 0, 6.28); ctx.stroke();
        ctx.restore();
        // 회전하는 별 소행성
        for (let i = 0; i < 6; i++) {
          const x = wrap(par * 0.9 + i * 520 + 120), y = hy * (0.2 + (i % 3) * 0.2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(this.time * (0.6 + i * 0.2));
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath();
          for (let s = 0; s < 10; s++) {
            const r = s % 2 ? 5 : 13, a = s * Math.PI / 5 - Math.PI / 2;
            const px2 = Math.cos(a) * r, py = Math.sin(a) * r;
            s ? ctx.lineTo(px2, py) : ctx.moveTo(px2, py);
          }
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }

    /* ---------- 파티클 ---------- */
    spawn(x, y, z, vx, vy, vz, life, color, size, kind) {
      if (this.particles.length > 900) return;
      this.particles.push({ x, y, z, vx, vy, vz, life, max: life, color, size: size || 4, kind: kind || 'dot' });
    }
    updateParticles(dt) {
      const p = this.particles;
      for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        q.life -= dt;
        if (q.life <= 0) { p.splice(i, 1); continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.vz -= (q.kind === 'smoke' ? 20 : 260) * dt;
        if (q.z < 0) { q.z = 0; q.vz *= -0.28; q.vx *= 0.7; q.vy *= 0.7; }
        q.vx *= (1 - dt * 1.4); q.vy *= (1 - dt * 1.4);
      }
    }

    /* ---------- 메인 ---------- */
    render(world, dt) {
      this.time += dt;
      const ctx = this.ctx, cv = this.canvas;
      const W = cv.width, H = cv.height;
      const c = this.camera;
      this.scaleK = W / this.bw;
      this.offX = c.shakeX;
      this.offY = c.shakeY;
      this.horizon = this.bh * 0.40 - c.pitch;

      const track = world.track;
      this.drawSky(track);
      this.drawGround(track);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.buf, this.offX, this.offY, W, H);

      // ---- 빌보드 수집 ----
      const list = [];
      for (const d of track.decor) {
        const p = this.project(d.x, d.y, d.z || 0);
        if (p) list.push({ p, kind: 'decor', o: d });
      }
      for (const b of track.itemBoxes) {
        if (b.respawn > 0) continue;
        const p = this.project(b.x, b.y, 22);
        if (p) list.push({ p, kind: 'box', o: b });
      }
      for (const t of track.thwomps) {
        const p = this.project(t.x, t.y, t.h);
        if (p) list.push({ p, kind: 'thwomp', o: t });
      }
      for (const h of world.hazards) {
        if (h.dead) continue;
        const p = this.project(h.x, h.y, h.z || 8);
        if (p) list.push({ p, kind: 'hazard', o: h });
      }
      for (const k of world.karts) {
        const p = this.project(k.x, k.y, k.z);
        if (p) list.push({ p, kind: 'kart', o: k });
      }
      for (const q of this.particles) {
        const p = this.project(q.x, q.y, q.z);
        if (p) list.push({ p, kind: 'particle', o: q });
      }
      list.sort((a, b) => b.p.fwd - a.p.fwd);

      for (const e of list) {
        switch (e.kind) {
          case 'decor': this._drawDecor(e); break;
          case 'box': this._drawBox(e); break;
          case 'thwomp': this._drawThwomp(e); break;
          case 'hazard': this._drawHazard(e); break;
          case 'kart': this._drawKart(e, world); break;
          case 'particle': this._drawParticle(e); break;
        }
      }

      // ---- 화면 효과 ----
      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(' + this.flashColor + ',' + Math.min(0.85, this.flash) + ')';
        ctx.fillRect(0, 0, W, H);
        this.flash -= dt * 2.4;
      }
      const me = world.player;
      if (me) {
        if (me.boostTimer > 0 || me.state === 'BULLET') this._speedLines(ctx, W, H, me);
        if (me.starTimer > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = 'hsla(' + ((this.time * 420) % 360) + ',90%,60%,0.22)';
          ctx.fillRect(0, 0, W, H); ctx.restore();
        }
        if (me.surface === S.LAVA || (track.theme === 'bowser' && Math.random() < 0.02)) {
          ctx.fillStyle = 'rgba(255,90,20,0.06)'; ctx.fillRect(0, 0, W, H);
        }
      }
      // 비네트
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.92);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }

    _speedLines(ctx, W, H, k) {
      ctx.save();
      ctx.strokeStyle = k.state === 'BULLET' ? 'rgba(255,240,180,0.5)' : 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.283, r = H * (0.32 + Math.random() * 0.55);
        const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.7;
        const l = 20 + Math.random() * 70;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.7); ctx.stroke();
      }
      ctx.restore();
    }

    _shadow(ctx, x, y, r, alpha) {
      ctx.fillStyle = 'rgba(0,0,0,' + (alpha || 0.34) + ')';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.36, 0, 0, 6.28); ctx.fill();
    }

    _drawDecor(e) {
      const img = global.Sprites.obj(e.o.type);
      const s = e.p.scale * (DECOR_SIZE[e.o.type] || 70) * e.o.scale;
      if (s < 1) return;
      this.ctx.drawImage(img, e.p.x - s / 2, e.p.y - s, s, s);
    }

    _drawBox(e) {
      const ctx = this.ctx;
      const img = global.Sprites.obj('itembox');
      const s = e.p.scale * 62;
      if (s < 1) return;
      ctx.save();
      ctx.translate(e.p.x, e.p.y);
      const bob = Math.sin(this.time * 3 + e.o.x * 0.01) * s * 0.08;
      ctx.globalAlpha = 0.95;
      ctx.rotate(Math.sin(this.time * 1.6 + e.o.y * 0.01) * 0.25);
      ctx.drawImage(img, -s / 2, -s / 2 + bob, s, s);
      ctx.restore();
      this._shadow(ctx, e.p.x, e.p.y + s * 0.5, s * 0.28, 0.22);
    }

    _drawThwomp(e) {
      const ctx = this.ctx, t = e.o;
      const img = global.Sprites.obj('thwomp');
      const s = e.p.scale * 82;
      if (s < 1) return;
      ctx.drawImage(img, e.p.x - s / 2, e.p.y - s, s, s);
      const gp = this.project(t.x, t.y, 0);
      if (gp) this._shadow(ctx, gp.x, gp.y, s * 0.26, 0.4);
    }

    _drawHazard(e) {
      const ctx = this.ctx, h = e.o;
      const img = global.Sprites.obj(h.sprite || 'banana');
      const s = e.p.scale * (h.size || 46);
      if (s < 1) return;
      ctx.save();
      ctx.translate(e.p.x, e.p.y - s * 0.4);
      if (h.spin) ctx.rotate(this.time * 8);
      if (h.type === 'bulletbill') ctx.rotate(Math.sin(this.time * 20) * 0.1);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
      this._shadow(ctx, e.p.x, e.p.y + s * 0.14, s * 0.3, 0.3);
      if (h.type === 'redshell' || h.type === 'spiny') {
        ctx.fillStyle = 'rgba(255,120,120,0.28)';
        ctx.beginPath(); ctx.ellipse(e.p.x, e.p.y, s * 0.7, s * 0.24, 0, 0, 6.28); ctx.fill();
      }
    }

    _drawParticle(e) {
      const ctx = this.ctx, q = e.o;
      const a = Math.max(0, q.life / q.max);
      const s = Math.max(0.6, e.p.scale * q.size * (q.kind === 'smoke' ? (2 - a) : a + 0.35));
      ctx.globalAlpha = q.kind === 'smoke' ? a * 0.42 : a;
      ctx.fillStyle = q.color;
      if (q.kind === 'spark') {
        ctx.save(); ctx.translate(e.p.x, e.p.y); ctx.rotate(q.life * 14);
        ctx.fillRect(-s / 2, -s / 6, s, s / 3); ctx.fillRect(-s / 6, -s / 2, s / 3, s);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(e.p.x, e.p.y, s, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    _drawKart(e, world) {
      const ctx = this.ctx, k = e.o, p = e.p;
      const sc = p.scale * 92 * k.scale;
      // 카메라에 너무 가까우면(사실상 뒤쪽) 화면을 가리므로 생략
      if (sc < 2 || p.fwd < 46) return;

      // 그림자 (공중에 뜬 높이 반영)
      const groundP = this.project(k.x, k.y, 0);
      if (groundP) this._shadow(ctx, groundP.x, groundP.y, sc * 0.3 * (1 - Math.min(0.6, k.z / 300)), 0.36 * (1 - Math.min(0.7, k.z / 300)));

      // 방향 프레임 선택
      let rel = k.angle - this.camera.yaw + (k.spinAngle || 0);
      rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const n = k.sprite.count;
      const idx = Math.round(rel / (Math.PI * 2) * n) % n;
      const img = k.sprite.frames[idx];

      ctx.save();
      ctx.translate(p.x, p.y);
      const hop = k.hopT > 0 ? Math.sin((0.26 - k.hopT) / 0.26 * Math.PI) * sc * 0.12 : 0;
      const lean = k.drifting ? -k.driftDir * 0.12 : 0;
      ctx.rotate(lean);
      if (k.starTimer > 0) {
        ctx.shadowColor = 'hsl(' + ((this.time * 500) % 360) + ',100%,60%)';
        ctx.shadowBlur = 26;
      }
      if (k.invulnTimer > 0 && k.state !== 'RESPAWN' && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
      ctx.drawImage(img, -sc / 2, -sc * 0.78 - hop, sc, sc);
      ctx.restore();

      // 부스터 화염
      if (k.boostTimer > 0 || k.state === 'BULLET') {
        const c1 = k.boostSource === 'mt2' ? '#c264ff' : (k.boostSource === 'mt1' ? '#ff9c2a' : '#4fc3ff');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const r = sc * (0.16 + i * 0.07) * (0.8 + Math.random() * 0.4);
          ctx.fillStyle = i === 0 ? '#ffffff' : (i === 1 ? '#ffd66b' : c1);
          ctx.globalAlpha = 0.6 - i * 0.16;
          ctx.beginPath(); ctx.ellipse(p.x, p.y - sc * 0.1, r, r * 0.62, 0, 0, 6.28); ctx.fill();
        }
        ctx.restore();
      }

      // 드리프트 스파크
      if (k.drifting && k.driftStage >= 0) {
        const st = global.KartSystem.MT_STAGES[k.driftStage];
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const ox = (Math.random() - 0.5) * sc * 0.5, oy = (Math.random() - 0.2) * sc * 0.16;
          ctx.fillStyle = st.color; ctx.globalAlpha = 0.35 + Math.random() * 0.5;
          const r = sc * (0.03 + Math.random() * 0.05);
          ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, r, 0, 6.28); ctx.fill();
        }
        ctx.restore();
      }

      // 슬립스트림 기류
      if (k.slipFlash > 0 || (k.slipTimer > 0.35 && k.isPlayer)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220,245,255,' + (0.25 + k.slipTimer * 0.3) + ')';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const x = p.x + (Math.random() - 0.5) * sc * 1.2;
          const y = p.y - Math.random() * sc * 0.7;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + sc * 0.22); ctx.stroke();
        }
        ctx.restore();
      }

      // 이름표 (플레이어 제외)
      if (!k.isPlayer && p.fwd > 110 && p.fwd < 620 && sc > 26) {
        ctx.save();
        const fs = Math.max(9, Math.min(15, sc * 0.11));
        ctx.font = 'bold ' + fs + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.9;
        const tw = ctx.measureText(k.name).width + 10;
        const ty = p.y - Math.min(sc, 240) * 0.92;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(p.x - tw / 2, ty - fs * 0.8, tw, fs * 1.6);
        ctx.fillStyle = k.color;
        ctx.fillText(k.name, p.x, ty);
        ctx.restore();
      }

      // 룰렛 연출 (플레이어 외 카트 머리 위)
      if (k.roulette.active && !k.isPlayer && sc > 30) {
        const art = k.roulette.display && global.Sprites.itemArt(k.roulette.display.id);
        const is = sc * 0.3;
        if (art) ctx.drawImage(art, p.x - is / 2, p.y - sc * 1.24, is, is);
      }
    }
  }

  // 빌보드별 월드 크기(높이, world unit)
  const DECOR_SIZE = {
    tree: 92, piranha: 74, crowd: 58, sign: 52,
    pillar: 118, lavafall: 150, statue: 104, staroid: 62
  };

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  global.RenderSystem = { Renderer, Camera };
})(window);
