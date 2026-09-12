/* =============================================================
 * track.js - 트랙 절차적 생성
 *   · Catmull-Rom 스플라인 중심선
 *   · 비주얼 텍스처(2048px) : mode-7 렌더러가 샘플링
 *   · 서페이스 맵(1024px)   : 물리(노면 판정)가 샘플링
 *   · 체크포인트 / 아이템 박스 / 부스터 / 장식물
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const S = D.SURFACE;
  const WORLD = 2048;          // 월드 한 변 크기(= 텍스처 픽셀)
  const SURF_RES = 1024;       // 서페이스 맵 해상도
  const NODES = 900;           // 중심선 샘플 수
  const GRID = 96;             // 최근접 노드 조회 그리드

  const SURFACE_COLOR = {};
  SURFACE_COLOR[S.VOID] = 'rgb(0,0,0)';
  SURFACE_COLOR[S.ROAD] = 'rgb(40,0,0)';
  SURFACE_COLOR[S.OFFROAD] = 'rgb(80,0,0)';
  SURFACE_COLOR[S.KERB] = 'rgb(120,0,0)';
  SURFACE_COLOR[S.BOOST] = 'rgb(160,0,0)';
  SURFACE_COLOR[S.LAVA] = 'rgb(200,0,0)';
  SURFACE_COLOR[S.WALL] = 'rgb(240,0,0)';

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  class Track {
    constructor(def) {
      this.def = def;
      this.id = def.id;
      this.name = def.name;
      this.laps = def.laps;
      this.width = def.width;
      this.theme = def.theme;
      this.world = WORLD;
      this.nodes = [];
      this.length = 0;
      this._buildCenterline();
      this._buildGrid();
      this._buildTextures();
      this._buildProps();
    }

    /* ---------------- 중심선 ---------------- */
    _buildCenterline() {
      const c = this.def.ctrl, n = c.length;
      const per = Math.max(2, Math.round(NODES / n));
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p0 = c[(i - 1 + n) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
        for (let j = 0; j < per; j++) {
          const t = j / per;
          pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t),
                    catmull(p0[1], p1[1], p2[1], p3[1], t)]);
        }
      }
      let len = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1e-6;
        this.nodes.push({
          x: a[0], y: a[1],
          dx: dx / d, dy: dy / d,       // 진행 방향
          nx: -dy / d, ny: dx / d,      // 좌측 법선
          s: len, seg: d, curv: 0
        });
        len += d;
      }
      this.length = len;
      // 곡률 계산 (AI 감속 / 카메라 연출용)
      const N = this.nodes.length;
      for (let i = 0; i < N; i++) {
        const a = this.nodes[(i - 6 + N) % N], b = this.nodes[(i + 6) % N];
        let d = Math.atan2(b.dy, b.dx) - Math.atan2(a.dy, a.dx);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.nodes[i].curv = d;
      }
    }

    /* --------- 최근접 노드 조회 그리드 --------- */
    _buildGrid() {
      const g = new Uint16Array(GRID * GRID);
      const cell = WORLD / GRID;
      for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
          const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
          let best = 0, bd = Infinity;
          for (let i = 0; i < this.nodes.length; i += 2) {
            const nd = this.nodes[i];
            const d = (nd.x - px) * (nd.x - px) + (nd.y - py) * (nd.y - py);
            if (d < bd) { bd = d; best = i; }
          }
          g[gy * GRID + gx] = best;
        }
      }
      this._grid = g;
      this._cell = cell;
    }

    /** 월드 좌표 -> { node, index, lateral, progress } */
    project(x, y) {
      const gx = Math.max(0, Math.min(GRID - 1, (x / this._cell) | 0));
      const gy = Math.max(0, Math.min(GRID - 1, (y / this._cell) | 0));
      const seed = this._grid[gy * GRID + gx];
      const N = this.nodes.length;
      let best = seed, bd = Infinity;
      for (let k = -14; k <= 14; k++) {
        const i = (seed + k + N) % N;
        const nd = this.nodes[i];
        const d = (nd.x - x) * (nd.x - x) + (nd.y - y) * (nd.y - y);
        if (d < bd) { bd = d; best = i; }
      }
      const nd = this.nodes[best];
      const lateral = (x - nd.x) * nd.nx + (y - nd.y) * nd.ny;
      return { index: best, node: nd, lateral, progress: nd.s / this.length, dist: Math.sqrt(bd) };
    }

    nodeAt(i) { return this.nodes[((i % this.nodes.length) + this.nodes.length) % this.nodes.length]; }
    nodeAtT(t) { return this.nodes[Math.floor(((t % 1) + 1) % 1 * this.nodes.length)]; }

    /* ---------------- 텍스처 ---------------- */
    _buildTextures() {
      // 비주얼
      const vc = document.createElement('canvas');
      vc.width = vc.height = WORLD;
      const vx = vc.getContext('2d');
      this._paint(vx, 1, false);
      this.canvas = vc;
      this.pixels = new Uint32Array(vx.getImageData(0, 0, WORLD, WORLD).data.buffer.slice(0));

      // 서페이스
      const sc = document.createElement('canvas');
      sc.width = sc.height = SURF_RES;
      const sx = sc.getContext('2d');
      sx.imageSmoothingEnabled = false;
      this._paint(sx, SURF_RES / WORLD, true);
      const sd = sx.getImageData(0, 0, SURF_RES, SURF_RES).data;
      const map = new Uint8Array(SURF_RES * SURF_RES);
      for (let i = 0, p = 0; i < map.length; i++, p += 4) {
        map[i] = Math.round(sd[p] / 40);
      }
      this.surface = map;
      this.surfRes = SURF_RES;
    }

    surfaceAt(x, y) {
      if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return this.def.voidOffroad ? S.VOID : S.OFFROAD;
      const sx = (x * SURF_RES / WORLD) | 0, sy = (y * SURF_RES / WORLD) | 0;
      return this.surface[sy * SURF_RES + sx];
    }

    _path(ctx, k) {
      ctx.beginPath();
      const n = this.nodes;
      ctx.moveTo(n[0].x * k, n[0].y * k);
      for (let i = 1; i < n.length; i++) ctx.lineTo(n[i].x * k, n[i].y * k);
      ctx.closePath();
    }

    _paint(ctx, k, surfaceMode) {
      const def = this.def, W = WORLD * k;
      const roadW = this.width * k, kerbW = 13 * k;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      /* ---- 배경(오프로드) ---- */
      if (surfaceMode) {
        ctx.fillStyle = SURFACE_COLOR[def.voidOffroad ? S.VOID : (def.lavaOffroad ? S.LAVA : S.OFFROAD)];
        ctx.fillRect(0, 0, W, W);
      } else {
        this._paintBackground(ctx, k, W);
      }

      /* ---- 갓길(Shoulder): 코스 이탈 시 즉사 대신 감속 ---- */
      const shoulder = (def.shoulder || 0) * k;
      if (shoulder > 0) {
        if (surfaceMode) {
          ctx.strokeStyle = SURFACE_COLOR[S.OFFROAD];
          ctx.lineWidth = roadW + kerbW * 2 + shoulder * 2;
          this._path(ctx, k); ctx.stroke();
        } else if (this.theme === 'bowser') {
          ctx.save();
          ctx.shadowColor = '#ff6a1e'; ctx.shadowBlur = 20 * k;
          ctx.strokeStyle = '#2a231f';
          ctx.lineWidth = roadW + kerbW * 2 + shoulder * 2;
          this._path(ctx, k); ctx.stroke();
          ctx.restore();
          ctx.strokeStyle = 'rgba(90,78,68,0.55)';
          ctx.lineWidth = roadW + kerbW * 2 + shoulder;
          this._path(ctx, k); ctx.stroke();
        } else {
          ctx.save();
          ctx.shadowColor = '#7ef9ff'; ctx.shadowBlur = 18 * k;
          ctx.strokeStyle = 'rgba(46,38,86,0.95)';
          ctx.lineWidth = roadW + shoulder * 2;
          this._path(ctx, k); ctx.stroke();
          ctx.restore();
        }
      }

      /* ---- 커브 둔턱(Kerb) ---- */
      if (this.theme !== 'rainbow') {
        if (surfaceMode) {
          ctx.strokeStyle = SURFACE_COLOR[S.KERB];
          ctx.lineWidth = roadW + kerbW * 2;
          this._path(ctx, k); ctx.stroke();
        } else {
          const base = this.theme === 'bowser' ? '#d8cfc4' : '#ffffff';
          const alt = this.theme === 'bowser' ? '#2b2320' : '#e02a2a';
          ctx.strokeStyle = base;
          ctx.lineWidth = roadW + kerbW * 2;
          this._path(ctx, k); ctx.stroke();
          // 둥근 캡은 굵은 선에서 점선 간격을 메워버리므로 butt 캡으로 그린다
          ctx.save();
          ctx.lineCap = 'butt';
          ctx.setLineDash([34 * k, 34 * k]);
          ctx.strokeStyle = alt;
          ctx.lineWidth = roadW + kerbW * 2;
          this._path(ctx, k); ctx.stroke();
          ctx.restore();
        }
      } else if (!surfaceMode) {
        // 무지개 로드: 펜스 없는 네온 발광 가장자리
        ctx.save();
        ctx.shadowColor = '#7ef9ff';
        ctx.shadowBlur = 26 * k;
        ctx.strokeStyle = 'rgba(150,240,255,0.85)';
        ctx.lineWidth = roadW + 9 * k;
        this._path(ctx, k); ctx.stroke();
        ctx.restore();
      }

      /* ---- 노면 ---- */
      if (surfaceMode) {
        ctx.strokeStyle = SURFACE_COLOR[S.ROAD];
        ctx.lineWidth = roadW;
        this._path(ctx, k); ctx.stroke();
      } else {
        this._paintRoad(ctx, k, roadW);
      }

      /* ---- 부스터 발판 ---- */
      for (const t of def.boosts) this._paintBoost(ctx, k, t, roadW, surfaceMode);

      /* ---- 스타트/피니시 라인 ---- */
      this._paintStartLine(ctx, k, roadW, surfaceMode);

      ctx.restore();
    }

    _paintBackground(ctx, k, W) {
      const th = this.theme;
      if (th === 'circuit') {
        const g = ctx.createLinearGradient(0, 0, 0, W);
        g.addColorStop(0, '#4f9e3a'); g.addColorStop(1, '#3d8330');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
        // 입체적인 풀잎
        for (let i = 0; i < 26000; i++) {
          const x = Math.random() * W, y = Math.random() * W;
          const l = (2 + Math.random() * 4) * k;
          ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(120,200,90,0.55)' : 'rgba(40,100,40,0.45)';
          ctx.lineWidth = 1 * k;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * l, y - l); ctx.stroke();
        }
      } else if (th === 'bowser') {
        const g = ctx.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W * 0.75);
        g.addColorStop(0, '#c8340a'); g.addColorStop(0.55, '#8e1f06'); g.addColorStop(1, '#3a0d04');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
        // 마그마 소용돌이
        for (let i = 0; i < 2600; i++) {
          const x = Math.random() * W, y = Math.random() * W, r = (6 + Math.random() * 34) * k;
          ctx.fillStyle = ['rgba(255,190,60,0.35)', 'rgba(255,110,20,0.3)', 'rgba(90,20,10,0.4)'][(Math.random() * 3) | 0];
          ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + Math.random() * 0.7), Math.random() * 6.28, 0, 6.28); ctx.fill();
        }
      } else {
        // 무지개 로드: 칠흑 같은 우주
        ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, W, W);
        for (let i = 0; i < 5200; i++) {
          const x = Math.random() * W, y = Math.random() * W, r = Math.random() * 1.9 * k;
          const c = Math.random();
          ctx.fillStyle = c < 0.6 ? 'rgba(255,255,255,0.85)' : (c < 0.8 ? 'rgba(160,200,255,0.8)' : 'rgba(255,190,230,0.8)');
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
        }
        // 성운
        for (let i = 0; i < 60; i++) {
          const x = Math.random() * W, y = Math.random() * W, r = (60 + Math.random() * 220) * k;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          const hue = 250 + Math.random() * 90;
          g.addColorStop(0, 'hsla(' + hue + ',80%,60%,0.16)');
          g.addColorStop(1, 'hsla(' + hue + ',80%,60%,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
        }
      }
    }

    _paintRoad(ctx, k, roadW) {
      const th = this.theme, n = this.nodes;
      if (th === 'rainbow') {
        // 육각 프리즘이 각인된 오팔 빛 유리 도로 - 세그먼트별 무지개 그라데이션
        for (let i = 0; i < n.length; i++) {
          const a = n[i], b = n[(i + 1) % n.length];
          const hue = (i / n.length) * 360;
          ctx.strokeStyle = 'hsl(' + hue + ',85%,58%)';
          ctx.lineWidth = roadW;
          ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke();
        }
        // 프리즘 하이라이트 + 육각 패턴
        ctx.save();
        this._path(ctx, k);
        ctx.lineWidth = roadW; ctx.strokeStyle = 'rgba(255,255,255,0.001)'; ctx.stroke();
        ctx.clip('nonzero');
        ctx.globalCompositeOperation = 'overlay';
        const hs = 22 * k;
        for (let y = 0; y < WORLD * k; y += hs * 1.5) {
          for (let x = 0; x < WORLD * k; x += hs * 1.74) {
            const ox = ((y / (hs * 1.5)) | 0) % 2 ? hs * 0.87 : 0;
            ctx.beginPath();
            for (let s = 0; s < 6; s++) {
              const ang = Math.PI / 3 * s;
              const px = x + ox + Math.cos(ang) * hs * 0.5, py = y + Math.sin(ang) * hs * 0.5;
              s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2 * k; ctx.stroke();
          }
        }
        ctx.restore();
      } else if (th === 'bowser') {
        ctx.strokeStyle = '#3b342f';
        ctx.lineWidth = roadW;
        this._path(ctx, k); ctx.stroke();
        ctx.save();
        this._path(ctx, k); ctx.lineWidth = roadW; ctx.stroke(); ctx.clip('nonzero');
        // 불규칙하게 금이 간 석판 + 틈새로 새어나오는 마그마
        for (let i = 0; i < 2200; i++) {
          const x = Math.random() * WORLD * k, y = Math.random() * WORLD * k;
          ctx.strokeStyle = Math.random() < 0.72 ? 'rgba(15,10,8,0.75)' : 'rgba(255,120,30,0.55)';
          ctx.lineWidth = (Math.random() < 0.8 ? 1.4 : 2.6) * k;
          ctx.beginPath(); ctx.moveTo(x, y);
          let cx = x, cy = y;
          for (let s = 0; s < 4; s++) {
            cx += (Math.random() - 0.5) * 34 * k; cy += (Math.random() - 0.5) * 34 * k;
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 900; i++) {
          const x = Math.random() * WORLD * k, y = Math.random() * WORLD * k;
          ctx.fillStyle = 'rgba(90,80,72,' + (0.1 + Math.random() * 0.25) + ')';
          ctx.beginPath(); ctx.ellipse(x, y, (4 + Math.random() * 16) * k, (3 + Math.random() * 11) * k, Math.random() * 6.28, 0, 6.28); ctx.fill();
        }
        ctx.restore();
      } else {
        // 마리오 서킷: 잘 정돈된 아스팔트
        ctx.strokeStyle = '#57575f';
        ctx.lineWidth = roadW;
        this._path(ctx, k); ctx.stroke();
        ctx.save();
        this._path(ctx, k); ctx.lineWidth = roadW; ctx.stroke(); ctx.clip('nonzero');
        for (let i = 0; i < 9000; i++) {
          const x = Math.random() * WORLD * k, y = Math.random() * WORLD * k;
          ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.07) + ')';
          ctx.fillRect(x, y, 2 * k, 2 * k);
        }
        for (let i = 0; i < 1400; i++) {
          const x = Math.random() * WORLD * k, y = Math.random() * WORLD * k;
          ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.12) + ')';
          ctx.beginPath(); ctx.arc(x, y, (2 + Math.random() * 9) * k, 0, 6.28); ctx.fill();
        }
        ctx.restore();
        // 중앙 점선
        ctx.save();
        ctx.setLineDash([30 * k, 34 * k]);
        ctx.strokeStyle = 'rgba(255,255,255,0.34)';
        ctx.lineWidth = 3 * k;
        this._path(ctx, k); ctx.stroke();
        ctx.restore();
      }
    }

    _paintBoost(ctx, k, t, roadW, surfaceMode) {
      const nd = this.nodeAtT(t);
      const w = roadW * 0.62, l = 74 * k;
      ctx.save();
      ctx.translate(nd.x * k, nd.y * k);
      ctx.rotate(Math.atan2(nd.dy, nd.dx));
      if (surfaceMode) {
        ctx.fillStyle = SURFACE_COLOR[S.BOOST];
        ctx.fillRect(-l / 2, -w / 2, l, w);
      } else {
        const th = this.theme;
        const base = th === 'rainbow' ? '#f5ff3a' : (th === 'bowser' ? '#ff7a1e' : '#f5a623');
        ctx.fillStyle = th === 'rainbow' ? 'rgba(20,20,10,0.35)' : 'rgba(255,255,255,0.15)';
        ctx.fillRect(-l / 2, -w / 2, l, w);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = base;
          ctx.globalAlpha = 0.55 + i * 0.15;
          const x = -l / 2 + i * (l / 3) + 4 * k;
          ctx.beginPath();
          ctx.moveTo(x, -w / 2); ctx.lineTo(x + l / 5, 0); ctx.lineTo(x, w / 2);
          ctx.lineTo(x + l / 9, 0); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    _paintStartLine(ctx, k, roadW, surfaceMode) {
      if (surfaceMode) return;
      const nd = this.nodes[0];
      ctx.save();
      ctx.translate(nd.x * k, nd.y * k);
      ctx.rotate(Math.atan2(nd.dy, nd.dx));
      const cols = 10, cw = roadW / cols, rows = 3, ch = 13 * k;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = ((r + c) % 2) ? '#ffffff' : '#1a1a1a';
          ctx.fillRect(-rows * ch / 2 + r * ch, -roadW / 2 + c * cw, ch, cw);
        }
      }
      ctx.restore();
    }

    /* ---------------- 오브젝트 ---------------- */
    _buildProps() {
      const N = this.nodes.length;
      // 아이템 박스: 트랙을 따라 5줄
      this.itemBoxRows = [];
      const rows = [0.20, 0.52, 0.82];
      for (const t of rows) {
        const nd = this.nodeAtT(t);
        const row = [];
        for (let i = -2; i <= 2; i++) {
          const off = i * (this.width * 0.19);
          row.push({ x: nd.x + nd.nx * off, y: nd.y + nd.ny * off, t });
        }
        this.itemBoxRows.push(row);
      }
      this.itemBoxes = this.itemBoxRows.flat().map(b => ({ x: b.x, y: b.y, respawn: 0 }));

      // 장식물(빌보드)
      this.decor = [];
      const push = (t, side, type, scale, minOff, z) => {
        const nd = this.nodeAtT(t);
        const off = (this.width * 0.5 + (minOff || 70) + Math.random() * 150) * side;
        this.decor.push({ x: nd.x + nd.nx * off, y: nd.y + nd.ny * off, type, scale: scale || 1, z: z || 0 });
      };
      if (this.theme === 'circuit') {
        for (let i = 0; i < 46; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, Math.random() < 0.45 ? 'piranha' : 'tree', 0.8 + Math.random() * 0.5);
        for (let i = 0; i < 24; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'crowd', 1, 120);
        for (let i = 0; i < 14; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'sign', 0.9);
      } else if (this.theme === 'bowser') {
        for (let i = 0; i < 30; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'pillar', 0.9 + Math.random() * 0.6);
        for (let i = 0; i < 18; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'lavafall', 1.2, 230);
        for (let i = 0; i < 10; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'statue', 1.1);
      } else {
        // 소행성은 트랙에서 멀리 떨어뜨려 허공에 띄운다
        for (let i = 0; i < 30; i++) push(Math.random(), Math.random() < 0.5 ? 1 : -1, 'staroid',
          0.7 + Math.random() * 0.8, 150 + Math.random() * 260, 40 + Math.random() * 200);
      }

      // 쿠파 성 쿵쿵이(Thwomp)
      this.thwomps = [];
      if (this.def.hazard === 'thwomp') {
        [0.14, 0.38, 0.62, 0.86].forEach((t, i) => {
          const nd = this.nodeAtT(t);
          const off = (i % 3 - 1) * this.width * 0.26;
          this.thwomps.push({
            x: nd.x + nd.nx * off, y: nd.y + nd.ny * off,
            phase: Math.random() * 3, h: 120, state: 'up', timer: 0, shake: 0
          });
        });
      }

      // 스타트 그리드 위치
      this.startSlots = [];
      for (let i = 0; i < 8; i++) {
        const back = 70 + Math.floor(i / 2) * 62;
        const side = (i % 2 ? 1 : -1) * this.width * 0.22;
        const nd = this.projectAlong(-back);
        this.startSlots.push({ x: nd.x + nd.nx * side, y: nd.y + nd.ny * side, angle: Math.atan2(nd.dy, nd.dx) });
      }
    }

    projectAlong(dist) {
      const N = this.nodes.length;
      const i = Math.round(dist / (this.length / N));
      return this.nodeAt(i);
    }

    updateThwomps(dt) {
      for (const t of this.thwomps) {
        t.phase += dt;
        const cyc = 2.6;
        const p = (t.phase % cyc) / cyc;
        if (p < 0.62) { t.h = 120 * (0.6 + 0.4 * Math.sin(p / 0.62 * Math.PI - Math.PI / 2)); t.state = 'up'; }
        else if (p < 0.70) { t.h = 120 * (1 - (p - 0.62) / 0.08); if (t.h < 12 && t.state === 'up') { t.state = 'slam'; t.shake = 1; } }
        else { t.h = 0; t.state = 'down'; }
        if (p < 0.62) t.state = 'up';
        t.shake = Math.max(0, t.shake - dt * 2.4);
      }
    }
  }

  const cache = {};
  function get(id) {
    if (!cache[id]) {
      const def = D.TRACKS.find(t => t.id === id) || D.TRACKS[0];
      cache[id] = new Track(def);
    }
    return cache[id];
  }

  global.TrackSystem = { Track, get, WORLD };
})(window);
