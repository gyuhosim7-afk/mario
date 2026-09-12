/* =============================================================
 * hud.js - 레이스 HUD (순위표 / 미니맵 / 랩타임 / 아이템 슬롯 / 속도계)
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;

  function fmtTime(t) {
    if (t == null || !isFinite(t)) return "--'--\"---";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 1000);
    return m + "'" + String(s).padStart(2, '0') + '"' + String(ms).padStart(3, '0');
  }
  function ordinal(n) { return n + '위'; }

  class HUD {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.toast = null;
      this.toastT = 0;
      this.bigText = null;
      this.bigT = 0;
      this.bigColor = '#fff';
      this.mini = null;
    }
    resize(w, h) {
      // 고해상도 화면에서 HUD 텍스트가 뭉개지지 않도록 DPR 배율로 렌더한다
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }

    showToast(text, color, itemId) {
      this.toast = text; this.toastColor = color || '#fff';
      this.toastIcon = itemId ? global.Icons.get(itemId) : null;
      this.toastT = 2.0;
    }
    showBig(text, color, dur) { this.bigText = text; this.bigColor = color || '#fff'; this.bigT = dur || 1.2; }

    _buildMini(track) {
      const size = 220;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const k = size / track.world;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = Math.max(3, track.width * k * 0.9);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      const n = track.nodes;
      g.moveTo(n[0].x * k, n[0].y * k);
      for (let i = 1; i < n.length; i += 3) g.lineTo(n[i].x * k, n[i].y * k);
      g.closePath(); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
      this.mini = c;
      this.miniTrack = track.id;
    }

    draw(world, dt) {
      const ctx = this.ctx;
      const dpr = this.dpr || 1;
      const W = this.w || this.canvas.width, H = this.h || this.canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const me = world.player;
      // UI 스케일: 세로 화면(모바일)에서도 읽을 수 있게 하한을 둔다
      const u = Math.max(0.55, Math.min(1.4, Math.min(W / 1280, H / 720)));
      const bi = this.bottomInset || 0;            // 터치 컨트롤 영역 확보
      if (!me) return;

      /* ---------- 좌상단: 랩 & 타임 ---------- */
      ctx.save();
      ctx.translate(18 * u, 16 * u);
      panel(ctx, 0, 0, 214 * u, 92 * u, 'rgba(10,12,22,0.55)');
      ctx.fillStyle = '#ffd54a';
      ctx.font = '900 ' + (30 * u) + 'px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('LAP', 14 * u, 38 * u);
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + (34 * u) + 'px system-ui, sans-serif';
      ctx.fillText(Math.max(1, Math.min(me.lap, world.track.laps)) + '/' + world.track.laps, 76 * u, 39 * u);
      ctx.font = '600 ' + (15 * u) + 'px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText('TOTAL ' + fmtTime(world.raceTime), 14 * u, 62 * u);
      ctx.fillStyle = 'rgba(160,230,255,0.95)';
      ctx.fillText('LAP   ' + fmtTime(world.raceTime - me.lastLapStamp), 14 * u, 82 * u);
      ctx.restore();

      /* ---------- 우상단: 실시간 순위표 ---------- */
      ctx.save();
      const rowH = 25 * u, listW = 216 * u;
      const order = world.standings;
      ctx.translate(W - listW - 18 * u, 16 * u);
      panel(ctx, 0, 0, listW, rowH * order.length + 10 * u, 'rgba(10,12,22,0.5)');
      order.forEach((k, i) => {
        const y = 6 * u + i * rowH;
        if (k.isPlayer) {
          ctx.fillStyle = 'rgba(255,214,74,0.22)';
          roundRect(ctx, 4 * u, y, listW - 8 * u, rowH - 2 * u, 5 * u); ctx.fill();
        }
        ctx.fillStyle = i === 0 ? '#ffd54a' : 'rgba(255,255,255,0.85)';
        ctx.font = '800 ' + (14 * u) + 'px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), 26 * u, y + 17 * u);
        ctx.fillStyle = k.color;
        ctx.beginPath(); ctx.arc(38 * u, y + 12 * u, 5 * u, 0, 6.28); ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = k.finished ? '#8ef2a8' : '#fff';
        ctx.font = (k.isPlayer ? '800 ' : '600 ') + (13 * u) + 'px system-ui, sans-serif';
        ctx.fillText(k.name, 50 * u, y + 17 * u);
        if (k.item) {
          const ic = global.Icons.get(k.item.id);
          if (ic) ctx.drawImage(ic, listW - 26 * u, y + 2 * u, 20 * u, 20 * u);
        }
      });
      ctx.restore();

      /* ---------- 미니맵 ---------- */
      if (!this.mini || this.miniTrack !== world.track.id) this._buildMini(world.track);
      const ms = 150 * u;
      ctx.save();
      ctx.translate(W - ms - 22 * u, 16 * u + rowH * order.length + 24 * u);
      ctx.globalAlpha = 0.9;
      panel(ctx, -6 * u, -6 * u, ms + 12 * u, ms + 12 * u, 'rgba(10,12,22,0.45)');
      ctx.globalAlpha = 0.75;
      ctx.drawImage(this.mini, 0, 0, ms, ms);
      ctx.globalAlpha = 1;
      const mk = ms / world.track.world;
      for (const k of world.karts) {
        ctx.fillStyle = k.isPlayer ? '#fff' : k.color;
        ctx.beginPath(); ctx.arc(k.x * mk, k.y * mk, (k.isPlayer ? 5 : 3.6) * u, 0, 6.28); ctx.fill();
        if (k.isPlayer) { ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2 * u; ctx.stroke(); }
      }
      ctx.restore();

      /* ---------- 좌하단: 아이템 슬롯 ---------- */
      ctx.save();
      const slot = 96 * u;
      ctx.translate(24 * u, H - slot - 24 * u - bi);
      ctx.fillStyle = 'rgba(8,10,20,0.55)';
      roundRect(ctx, 0, 0, slot, slot, 14 * u); ctx.fill();
      ctx.strokeStyle = me.roulette.active ? '#ffd54a' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3 * u; ctx.stroke();
      const shown = me.roulette.active ? me.roulette.display : me.item;
      if (shown) {
        ctx.save();
        ctx.translate(slot / 2, slot / 2);
        if (me.roulette.active) {
          const wob = Math.sin(world.time * 40) * 0.16;
          ctx.rotate(wob); ctx.scale(1 + Math.abs(wob) * 0.3, 1 - Math.abs(wob) * 0.2);
        }
        const art = global.Icons.get(shown.id);
        if (art) {
          ctx.drawImage(art, -slot * 0.36, -slot * 0.36, slot * 0.72, slot * 0.72);
        } else {
          ctx.font = (52 * u) + 'px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(shown.icon, 0, 4 * u);
        }
        ctx.restore();
      }
      if (me.itemCount > 1) {
        ctx.fillStyle = '#ffd54a';
        ctx.font = '900 ' + (20 * u) + 'px system-ui, sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('x' + me.itemCount, slot - 8 * u, slot - 8 * u);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '700 ' + (11 * u) + 'px system-ui, sans-serif';
      ctx.fillText('SPACE', slot / 2, slot + 16 * u);
      // 동전
      ctx.textAlign = 'left';
      const coinArt = global.Icons.get('coin');
      ctx.drawImage(coinArt, slot + 12 * u, slot * 0.62 - 22 * u, 26 * u, 26 * u);
      ctx.font = '900 ' + (22 * u) + 'px system-ui, sans-serif';
      ctx.fillStyle = '#ffd54a';
      ctx.fillText(String(me.coins).padStart(2, '0'), slot + 42 * u, slot * 0.62);
      ctx.restore();

      /* ---------- 우하단: 순위 + 속도계 ---------- */
      ctx.save();
      ctx.translate(W - 30 * u, H - 30 * u - bi);
      // 순위 대형 표기
      const rank = me.rank;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = '900 ' + (78 * u) + 'px system-ui, sans-serif';
      const grad = ctx.createLinearGradient(0, -70 * u, 0, 0);
      grad.addColorStop(0, rank === 1 ? '#fff3a8' : '#ffffff');
      grad.addColorStop(1, rank === 1 ? '#ffb020' : '#c9d4e5');
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 6 * u;
      ctx.strokeText(String(rank), -46 * u, 0);
      ctx.fillText(String(rank), -46 * u, 0);
      ctx.font = '900 ' + (30 * u) + 'px system-ui, sans-serif';
      ctx.strokeText('위', -6 * u, -4 * u);
      ctx.fillText('위', -6 * u, -4 * u);
      ctx.restore();

      // 속도계
      ctx.save();
      const cx = W - 120 * u, cy = H - 116 * u - bi, r = 52 * u;
      ctx.lineWidth = 9 * u; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,10,20,0.5)';
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      const ratio = Math.max(0, Math.min(1.35, me.speed / me.phys.maxSpeed)) / 1.35;
      const gg = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      gg.addColorStop(0, '#4fc3ff'); gg.addColorStop(0.6, '#8ef2a8'); gg.addColorStop(1, '#ff5a3a');
      ctx.strokeStyle = gg;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + ratio * Math.PI * 1.5); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + (24 * u) + 'px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(Math.abs(me.speed) * 0.42)), cx, cy - 2 * u);
      ctx.font = '700 ' + (11 * u) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('km/h', cx, cy + 16 * u);
      ctx.restore();

      /* ---------- 드리프트 게이지 ---------- */
      if (me.drifting) {
        const stages = global.KartSystem.MT_STAGES;
        ctx.save();
        ctx.translate(W / 2 - 90 * u, H - 46 * u - bi);
        ctx.fillStyle = 'rgba(8,10,20,0.5)';
        roundRect(ctx, 0, 0, 180 * u, 12 * u, 6 * u); ctx.fill();
        const maxC = stages[2].charge;
        const p = Math.min(1, me.driftCharge / maxC);
        ctx.fillStyle = me.driftStage >= 0 ? stages[me.driftStage].color : 'rgba(255,255,255,0.4)';
        roundRect(ctx, 0, 0, 180 * u * p, 12 * u, 6 * u); ctx.fill();
        stages.forEach(s => {
          const x = 180 * u * (s.charge / maxC);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5 * u;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 12 * u); ctx.stroke();
        });
        ctx.restore();
      }

      /* ---------- 슬립스트림 게이지 ---------- */
      if (me.slipTimer > 0.15) {
        ctx.save();
        ctx.translate(W / 2 - 60 * u, H - 70 * u - bi);
        ctx.fillStyle = 'rgba(160,230,255,0.85)';
        ctx.font = '800 ' + (13 * u) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SLIPSTREAM', 60 * u, -4 * u);
        ctx.fillStyle = 'rgba(8,10,20,0.5)';
        roundRect(ctx, 0, 0, 120 * u, 7 * u, 4 * u); ctx.fill();
        ctx.fillStyle = '#9fe8ff';
        roundRect(ctx, 0, 0, 120 * u * Math.min(1, me.slipTimer / global.KartSystem.SLIP_REQUIRED), 7 * u, 4 * u); ctx.fill();
        ctx.restore();
      }

      /* ---------- 부스터 스피드 라인 ---------- */
      if (me.boostTimer > 0 || me.state === 'BULLET' || me.speedRatio > 1.02) {
        ctx.save();
        ctx.strokeStyle = me.state === 'BULLET' ? 'rgba(255,240,180,0.4)' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2 * u;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * 6.283, r = H * (0.34 + Math.random() * 0.6);
          const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.72;
          const l = (22 + Math.random() * 78) * u;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.72); ctx.stroke();
        }
        ctx.restore();
      }

      /* ---------- 화면 플래시 (번개 / 피격) ---------- */
      const R = this.renderer;
      if (R && R.flash > 0) {
        ctx.fillStyle = 'rgba(' + R.flashColor + ',' + Math.min(0.8, R.flash) + ')';
        ctx.fillRect(0, 0, W, H);
        R.flash -= dt * 2.4;
      }

      /* ---------- F3 그래픽 진단 패널 ---------- */
      if (this.debug && this.renderer) {
        const R = this.renderer, st = R.stats(), gi = R.gpuInfo();
        const fps = st.fps || (st.ms > 0 ? Math.round(1000 / st.ms) : 0);
        const name = gi.renderer || '(비공개)';
        const lines = [
          ['FPS ' + fps + '   (' + st.ms + ' ms/frame)', '#ffd54a'],
          [(gi.software ? '⚠ 소프트웨어 렌더링 (하드웨어 가속 꺼짐)' : '✓ 하드웨어 가속') +
            (gi.webgl2 ? ' · WebGL2' : ' · WebGL1'), gi.software ? '#ff9a8a' : '#8ef2a8'],
          ['GPU ' + name.slice(0, 42), 'rgba(226,235,255,0.92)']
        ];
        if (name.length > 42) lines.push(['    ' + name.slice(42, 84), 'rgba(226,235,255,0.7)']);
        lines.push(
          ['품질 ' + st.quality + '/3 (' + (st.mode === 'auto' ? '자동' : '고정') + ')  해상도배율 ' + st.dpr, 'rgba(226,235,255,0.92)'],
          ['드로우콜 ' + st.calls + '  삼각형 ' + (st.tris / 1000).toFixed(0) + 'k  파티클 ' + st.particles, 'rgba(226,235,255,0.92)']
        );
        ctx.save();
        const pw = 348 * u, ph = lines.length * 16 * u + 14 * u;
        const px = 18 * u, py = 120 * u;         // 랩 패널 아래
        ctx.fillStyle = 'rgba(6,9,18,0.82)';
        roundRect(ctx, px, py, pw, ph, 8 * u); ctx.fill();
        ctx.strokeStyle = gi.software ? 'rgba(255,140,120,0.8)' : 'rgba(140,240,180,0.5)';
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = '600 ' + (11.5 * u) + 'px ui-monospace, monospace';
        lines.forEach((t, i) => {
          ctx.fillStyle = t[1];
          ctx.fillText(t[0], px + 10 * u, py + 20 * u + i * 16 * u);
        });
        ctx.restore();
      }

      /* ---------- 토스트 / 대형 문구 ---------- */
      if (this.toastT > 0) {
        this.toastT -= dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.toastT * 2);
        ctx.textAlign = 'center';
        ctx.font = '900 ' + (26 * u) + 'px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const tw = ctx.measureText(this.toast).width;
        roundRect(ctx, W / 2 - tw / 2 - 16 * u, H * 0.2, tw + 32 * u, 42 * u, 10 * u); ctx.fill();
        ctx.fillStyle = this.toastColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(this.toast, W / 2 + (this.toastIcon ? 16 * u : 0), H * 0.2 + 22 * u);
        if (this.toastIcon) ctx.drawImage(this.toastIcon, W / 2 - tw / 2 - 14 * u, H * 0.2 + 5 * u, 32 * u, 32 * u);
        ctx.restore();
      }
      if (this.bigT > 0) {
        this.bigT -= dt;
        ctx.save();
        const p = Math.min(1, this.bigT * 3);
        ctx.globalAlpha = p;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const sc = 1 + (1 - p) * 0.5;
        ctx.translate(W / 2, H * 0.42); ctx.scale(sc, sc);
        ctx.font = '900 ' + (92 * u) + 'px system-ui, sans-serif';
        ctx.lineWidth = 10 * u; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(this.bigText, 0, 0);
        ctx.fillStyle = this.bigColor;
        ctx.fillText(this.bigText, 0, 0);
        ctx.restore();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function panel(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  global.HUDSystem = { HUD, fmtTime, ordinal };
})(window);
