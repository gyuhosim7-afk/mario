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

    /* ---------------- 서페이스 맵 (물리 노면 판정) ----------------
     * 3D 메시와 동일한 스플라인/폭으로 평면에 ID 색을 칠한 뒤 읽어들인다.
     * 보이는 도로와 물리 판정이 항상 일치한다.
     * ------------------------------------------------------------- */
    _buildTextures() {
      const k = SURF_RES / WORLD;
      const sc = document.createElement('canvas');
      sc.width = sc.height = SURF_RES;
      const ctx = sc.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const def = this.def;
      const roadW = this.width * k, kerbW = 13 * k;
      const shoulder = (def.shoulder || 0) * k;

      // 배경(오프로드 / 용암 / 허공)
      ctx.fillStyle = SURFACE_COLOR[def.voidOffroad ? S.VOID : (def.lavaOffroad ? S.LAVA : S.OFFROAD)];
      ctx.fillRect(0, 0, SURF_RES, SURF_RES);

      // 갓길
      if (shoulder > 0) {
        ctx.strokeStyle = SURFACE_COLOR[S.OFFROAD];
        ctx.lineWidth = roadW + (this.theme === 'rainbow' ? 0 : kerbW * 2) + shoulder * 2;
        this._path(ctx, k); ctx.stroke();
      }
      // 커브 둔턱
      if (this.theme !== 'rainbow') {
        ctx.strokeStyle = SURFACE_COLOR[S.KERB];
        ctx.lineWidth = roadW + kerbW * 2;
        this._path(ctx, k); ctx.stroke();
      }
      // 노면
      ctx.strokeStyle = SURFACE_COLOR[S.ROAD];
      ctx.lineWidth = roadW;
      this._path(ctx, k); ctx.stroke();

      // 부스터 발판
      for (const t of def.boosts) {
        const nd = this.nodeAtT(t);
        ctx.save();
        ctx.translate(nd.x * k, nd.y * k);
        ctx.rotate(Math.atan2(nd.dy, nd.dx));
        ctx.fillStyle = SURFACE_COLOR[S.BOOST];
        ctx.fillRect(-42 * k, -roadW * 0.33, 84 * k, roadW * 0.66);
        ctx.restore();
      }

      const sd = ctx.getImageData(0, 0, SURF_RES, SURF_RES).data;
      const map = new Uint8Array(SURF_RES * SURF_RES);
      for (let i = 0, p = 0; i < map.length; i++, p += 4) map[i] = Math.round(sd[p] / 40);
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
        const off = (this.width * 0.5 + (minOff || 120) + Math.random() * 240) * side;
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
