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
  const WORLD = 5000;          // 월드 한 변 크기
  const SURF_RES = 2500;       // 서페이스 맵 해상도 (2 world unit / texel)
  const NODE_GAP = 9;          // 중심선 노드 간격 (world unit)
  const CTRL_GAP = 45;         // 레이아웃 트레이싱 간격
  const GRID = 128;            // 최근접 노드 조회 시드 그리드

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
      this._placeFeatures();
      this._buildTextures();
      this._buildProps();
    }

    /* ---------------- 중심선 ----------------
     * 트랙은 [직선 / 코너] 시퀀스로 정의된다.
     *   ['s', 길이]            직선
     *   ['r'|'l', 반경, 각도]  우/좌 코너
     * 1) 순회전이 정확히 360°가 되도록 코너 각도를 정규화
     * 2) 직선 길이를 가중 최소자승으로 조정해 폐곡선을 정확히 닫음
     *    (헤딩 고정 시 폐합 오차는 직선 길이에 대해 선형이라 해석적으로 풀린다)
     * 3) 균일 간격으로 트레이싱 -> Catmull-Rom 으로 노드 생성
     * ---------------------------------------------------------------- */
    _buildCenterline() {
      const def = this.def;
      const el = normalizeTurns(def.layout);
      const lens = solveClosure(el, def.heading || 0);
      const ctrl = traceLayout(el, lens, def.heading || 0, CTRL_GAP);
      centerInWorld(ctrl, WORLD);
      this.ctrl = ctrl;

      // Catmull-Rom 세분화
      const n = ctrl.length;
      const per = Math.max(2, Math.round(CTRL_GAP / NODE_GAP));
      const pts = [];
      for (let i = 0; i < n; i++) {
        const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
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
          dx: dx / d, dy: dy / d,
          nx: -dy / d, ny: dx / d,
          s: len, seg: d, curv: 0
        });
        len += d;
      }
      this.length = len;
      // 곡률 (AI 감속 / 연출용)
      const N = this.nodes.length;
      const w = Math.max(4, Math.round(60 / NODE_GAP));
      for (let i = 0; i < N; i++) {
        const a = this.nodes[(i - w + N) % N], b = this.nodes[(i + w) % N];
        let d = Math.atan2(b.dy, b.dx) - Math.atan2(a.dy, a.dx);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.nodes[i].curv = d;
        // 곡률 반경(world unit) — 레이아웃/노드간격과 무관한 절대 지표
        const arc = 2 * w * NODE_GAP;
        this.nodes[i].radius = Math.abs(d) > 1e-4 ? arc / Math.abs(d) : 1e6;
      }
      this.nodeGap = NODE_GAP;
    }

    /* --------- 최근접 노드 조회 --------- */
    _buildGrid() {
      const g = new Uint16Array(GRID * GRID);
      const cell = WORLD / GRID;
      const N = this.nodes.length;
      const step = Math.max(1, Math.round(N / 700));
      for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
          const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
          let best = 0, bd = Infinity;
          for (let i = 0; i < N; i += step) {
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

    /**
     * 월드 좌표 -> { index, node, lateral, progress, dist }
     * hint(직전 프레임 노드)를 주면 그 주변만 탐색한다. 코스가 접히는 구간에서
     * 다른 구간의 노드로 잘못 매칭되는 것을 막는다.
     */
    project(x, y, hint) {
      const N = this.nodes.length;
      let seed, span;
      if (hint === undefined || hint === null) {
        const gx = Math.max(0, Math.min(GRID - 1, (x / this._cell) | 0));
        const gy = Math.max(0, Math.min(GRID - 1, (y / this._cell) | 0));
        seed = this._grid[gy * GRID + gx];
        span = Math.max(24, Math.round(this._cell * 2 / NODE_GAP) + 12);
      } else {
        seed = hint;
        span = 64;
      }
      let best = seed, bd = Infinity;
      for (let k = -span; k <= span; k++) {
        const i = (seed + k + N) % N;
        const nd = this.nodes[i];
        const d = (nd.x - x) * (nd.x - x) + (nd.y - y) * (nd.y - y);
        if (d < bd) { bd = d; best = i; }
      }
      // 너무 멀면(텔레포트/리스폰 직후) 전체 재탐색
      if (bd > 640 * 640) {
        for (let i = 0; i < N; i += 3) {
          const nd = this.nodes[i];
          const d = (nd.x - x) * (nd.x - x) + (nd.y - y) * (nd.y - y);
          if (d < bd) { bd = d; best = i; }
        }
      }
      const nd = this.nodes[best];
      const lateral = (x - nd.x) * nd.nx + (y - nd.y) * nd.ny;
      return { index: best, node: nd, lateral, progress: nd.s / this.length, dist: Math.sqrt(bd) };
    }

    nodeAt(i) { return this.nodes[((i % this.nodes.length) + this.nodes.length) % this.nodes.length]; }
    nodeAtT(t) { return this.nodes[Math.floor(((t % 1) + 1) % 1 * this.nodes.length)]; }

    /* ------- 코스 특징 자동 배치 -------
     * 곡률이 낮은(= 직선인) 구간을 찾아 부스터 발판과 아이템 박스 줄을 놓는다.
     * 레이아웃을 바꿔도 배치가 알아서 따라온다.
     * ----------------------------------- */
    _placeFeatures() {
      const N = this.nodes.length;
      const win = Math.round(90 / NODE_GAP);
      const score = new Float32Array(N);          // 낮을수록 직선
      for (let i = 0; i < N; i++) {
        let a = 0;
        for (let k = -win; k <= win; k++) a += Math.abs(this.nodes[(i + k + N) % N].curv);
        score[i] = a;
      }
      const pickSpread = (count, minSepFrac, avoidStart) => {
        const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => score[a] - score[b]);
        const sep = N * minSepFrac, out = [];
        for (const i of order) {
          if (out.length >= count) break;
          if (avoidStart && Math.min(i, N - i) < N * 0.06) continue;
          if (out.every(j => { const d = Math.abs(i - j); return Math.min(d, N - d) > sep; })) out.push(i);
        }
        return out.sort((a, b) => a - b);
      };
      this.boostSpots = pickSpread(this.def.boostCount || 3, 0.16, true);
      // 도로를 가로지르는 게이트: 스타트 라인 + 직선 구간 2~3곳
      this.gantrySpots = [0].concat(
        pickSpread(3, 0.24, true).filter(i => Math.min(i, N - i) > N * 0.12));
      // 아이템 박스: 균등 t 위치를 근처 직선 구간으로 스냅
      const rows = this.def.boxRows || 4;
      this.boxSpots = [];
      for (let r = 0; r < rows; r++) {
        const base = Math.round(((r + 0.5) / rows) * N);
        let best = base, bs = Infinity;
        const rng = Math.round(N * 0.05);
        for (let k = -rng; k <= rng; k++) {
          const i = (base + k + N) % N;
          if (this.boostSpots.some(b => { const d = Math.abs(i - b); return Math.min(d, N - d) < N * 0.03; })) continue;
          if (score[i] < bs) { bs = score[i]; best = i; }
        }
        this.boxSpots.push(best);
      }
      // 점프대: 직선 구간에 배치하되 부스터 발판·아이템 박스와 겹치지 않게
      const rampN = this.def.rampCount === undefined ? 2 : this.def.rampCount;
      this.ramps = [];
      const nearAny = (arr, i, frac) => arr.some(b => {
        const d = Math.abs(i - b); return Math.min(d, N - d) < N * frac;
      });
      for (let r = 0; r < rampN; r++) {
        const base = Math.round(((r + 0.28) / rampN) * N);
        // 1차는 부스터·박스·게이트를 넉넉히 피해서 찾고, 그래도 자리가 없으면
        // 다른 점프대와만 겹치지 않게 완화해서 다시 찾는다. 한 번만 돌리면
        // 트랙에 따라 점프대가 통째로 사라진다 (실제로 2개 중 1개만 나왔다).
        let best = -1;
        for (const pass of [0, 1]) {
          let bs = Infinity;
          const rng = Math.round(N * (pass ? 0.13 : 0.08));
          const pad = pass ? 0.025 : 0.05;
          for (let k = -rng; k <= rng; k++) {
            const i = (base + k + N) % N;
            if (nearAny(this.boostSpots, i, pad) || nearAny(this.boxSpots, i, pad)) continue;
            if (nearAny(this.gantrySpots, i, pass ? 0.02 : 0.035)) continue;
            if (this.ramps.some(rp => {
              const d = Math.abs(i - rp.i); return Math.min(d, N - d) < N * (pass ? 0.09 : 0.14);
            })) continue;
            if (score[i] < bs) { bs = score[i]; best = i; }
          }
          if (best >= 0) break;
        }
        if (best < 0) continue;
        const nd = this.nodes[best];
        this.ramps.push({
          i: best, x: nd.x, y: nd.y,
          angle: Math.atan2(nd.dy, nd.dx),
          len: 108, half: 54          // 진행 방향 길이 (물리 판정과 메시가 공유)
        });
      }
      this._straightScore = score;
    }

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
      for (const bi of this.boostSpots) {
        const nd = this.nodes[bi];
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
      const lenK = this.length / 9000;            // 트랙 길이 비례 계수

      // 아이템 박스: 직선 구간에 5개씩 가로로
      this.itemBoxes = [];
      for (const bi of this.boxSpots) {
        const nd = this.nodes[bi];
        for (let i = -2; i <= 2; i++) {
          const off = i * (this.width * 0.19);
          this.itemBoxes.push({ x: nd.x + nd.nx * off, y: nd.y + nd.ny * off, respawn: 0 });
        }
      }
      this.boosts = this.boostSpots.map(i => i / N);

      // 장식물(3D 프롭)
      this.decor = [];
      const push = (t, side, type, scale, minOff, z) => {
        const nd = this.nodeAtT(t);
        const off = (this.width * 0.5 + (minOff || 120) + Math.random() * 240) * side;
        this.decor.push({ x: nd.x + nd.nx * off, y: nd.y + nd.ny * off, type, scale: scale || 1, z: z || 0 });
      };
      const rnd = () => Math.random();
      const n = (base) => Math.round(base * lenK);
      if (this.theme === 'circuit') {
        for (let i = 0; i < n(40); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, rnd() < 0.45 ? 'piranha' : 'tree', 0.8 + rnd() * 0.5);
        for (let i = 0; i < n(22); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'crowd', 1, 120);
        for (let i = 0; i < n(12); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'sign', 0.9);
      } else if (this.theme === 'bowser') {
        for (let i = 0; i < n(28); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'pillar', 0.9 + rnd() * 0.6);
        for (let i = 0; i < n(16); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'lavafall', 1.2, 230);
        for (let i = 0; i < n(10); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'statue', 1.1);
      } else {
        for (let i = 0; i < n(30); i++) push(rnd(), rnd() < 0.5 ? 1 : -1, 'staroid',
          0.7 + rnd() * 0.8, 150 + rnd() * 260, 40 + rnd() * 200);
      }

      // 마그마 성채 스톰퍼: 직선 구간 위주로
      this.thwomps = [];
      if (this.def.hazard === 'thwomp') {
        const spots = [];
        for (let r = 0; r < 4; r++) {
          const base = Math.round(((r + 0.4) / 4) * N);
          let best = base, bs = Infinity;
          for (let k = -Math.round(N * 0.04); k <= Math.round(N * 0.04); k++) {
            const i = (base + k + N) % N;
            if (this._straightScore[i] < bs) { bs = this._straightScore[i]; best = i; }
          }
          spots.push(best);
        }
        spots.forEach((i, k) => {
          const nd = this.nodes[i];
          const off = (k % 3 - 1) * this.width * 0.26;
          this.thwomps.push({
            x: nd.x + nd.nx * off, y: nd.y + nd.ny * off,
            phase: Math.random() * 3, h: 120, state: 'up', timer: 0, shake: 0
          });
        });
      }

      // 스타트 그리드
      this.startSlots = [];
      for (let i = 0; i < 8; i++) {
        const back = 90 + Math.floor(i / 2) * 78;
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

  /* =============================================================
   * 레이아웃 빌더
   * ============================================================= */
  function normalizeTurns(layout) {
    let net = 0;
    for (const e of layout) if (e[0] !== 's') net += e[2] * (e[0] === 'r' ? 1 : -1);
    const k = net !== 0 ? 360 / net : 1;
    return layout.map(e => e[0] === 's' ? { t: 's', len: e[1] } :
      { t: 'a', r: e[1], deg: e[2] * k, dir: e[0] });
  }

  function walkLayout(el, lens, heading) {
    let x = 0, y = 0, h = heading * Math.PI / 180, si = 0;
    const headings = [];
    for (const e of el) {
      if (e.t === 's') {
        const L = lens ? lens[si] : e.len;
        headings.push(h);
        x += Math.cos(h) * L; y += Math.sin(h) * L;
        si++;
      } else {
        const rad = e.deg * Math.PI / 180 * (e.dir === 'r' ? 1 : -1);
        const sg = Math.sign(rad) || 1;
        const cx = x - Math.sin(h) * e.r * sg, cy = y + Math.cos(h) * e.r * sg;
        const a0 = Math.atan2(y - cy, x - cx) + rad;
        x = cx + Math.cos(a0) * e.r; y = cy + Math.sin(a0) * e.r;
        h += rad;
      }
    }
    return { x, y, h, headings };
  }

  /** 직선 길이를 조정해 폐합 (가중 최소노름해를 반복 적용) */
  function solveClosure(el, heading) {
    const lens = el.filter(e => e.t === 's').map(e => e.len);
    for (let iter = 0; iter < 40; iter++) {
      const w = walkLayout(el, lens, heading);
      if (Math.hypot(w.x, w.y) < 0.01) break;
      const c = w.headings.map(Math.cos), s2 = w.headings.map(Math.sin);
      const wt = lens.map(L => Math.max(40, L));
      let a11 = 0, a12 = 0, a22 = 0;
      for (let i = 0; i < lens.length; i++) {
        a11 += wt[i] * c[i] * c[i]; a12 += wt[i] * c[i] * s2[i]; a22 += wt[i] * s2[i] * s2[i];
      }
      const det = a11 * a22 - a12 * a12;
      if (Math.abs(det) < 1e-9) break;
      const b1 = -w.x, b2 = -w.y;
      const l1 = (a22 * b1 - a12 * b2) / det, l2 = (-a12 * b1 + a11 * b2) / det;
      for (let i = 0; i < lens.length; i++) lens[i] = Math.max(60, lens[i] + wt[i] * (c[i] * l1 + s2[i] * l2));
    }
    return lens;
  }

  /** 균일 간격 트레이싱 (스플라인 오버슈트 방지) */
  function traceLayout(el, lens, heading, gap) {
    const pts = [];
    let x = 0, y = 0, h = heading * Math.PI / 180, si = 0;
    pts.push([x, y]);
    for (const e of el) {
      if (e.t === 's') {
        const L = lens[si++];
        const n = Math.max(1, Math.round(L / gap));
        for (let i = 0; i < n; i++) { x += Math.cos(h) * (L / n); y += Math.sin(h) * (L / n); pts.push([x, y]); }
      } else {
        const rad = e.deg * Math.PI / 180 * (e.dir === 'r' ? 1 : -1);
        const n = Math.max(3, Math.round(e.r * Math.abs(rad) / gap));
        const sg = Math.sign(rad) || 1;
        for (let i = 0; i < n; i++) {
          const cx = x - Math.sin(h) * e.r * sg, cy = y + Math.cos(h) * e.r * sg;
          const a1 = Math.atan2(y - cy, x - cx) + rad / n;
          x = cx + Math.cos(a1) * e.r; y = cy + Math.sin(a1) * e.r;
          h += rad / n;
          pts.push([x, y]);
        }
      }
    }
    pts.pop();
    return pts;
  }

  function centerInWorld(pts, world) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of pts) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
    }
    const ox = (world - (maxx - minx)) / 2 - minx, oy = (world - (maxy - miny)) / 2 - miny;
    for (const p of pts) { p[0] += ox; p[1] += oy; }
    return pts;
  }

  /** 텍스처 없이 중심선만 필요할 때 (로비 썸네일용) */
  const clCache = {};
  function centerline(def) {
    if (!clCache[def.id]) {
      const el = normalizeTurns(def.layout);
      const lens = solveClosure(el, def.heading || 0);
      const pts = traceLayout(el, lens, def.heading || 0, CTRL_GAP * 2);
      clCache[def.id] = centerInWorld(pts, WORLD);
    }
    return clCache[def.id];
  }

  const cache = {};
  function get(id) {
    if (!cache[id]) {
      const def = D.TRACKS.find(t => t.id === id) || D.TRACKS[0];
      cache[id] = new Track(def);
    }
    return cache[id];
  }

  global.TrackSystem = { Track, get, centerline, WORLD };
})(window);
