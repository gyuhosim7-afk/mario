/* =============================================================
 * textures.js - 절차적 텍스처 생성 (외부 이미지 에셋 0개)
 *   캔버스에 직접 그려 THREE.CanvasTexture 로 올린다.
 *   높이(height) 캔버스에서 Sobel 필터로 노멀맵도 함께 생성한다.
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;
  const cache = {};

  function make(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /** 값 노이즈 (부드러운 얼룩) */
  function valueNoise(ctx, w, h, cell, alpha, hue) {
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    const g = [];
    for (let y = 0; y < rows; y++) {
      g[y] = [];
      for (let x = 0; x < cols; x++) g[y][x] = Math.random();
    }
    // 타일링을 위해 가장자리 값 일치
    for (let y = 0; y < rows; y++) g[y][cols - 1] = g[y][0];
    for (let x = 0; x < cols; x++) g[rows - 1][x] = g[0][x];
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < h; y++) {
      const gy = y / cell, y0 = Math.floor(gy), ty = sm(gy - y0);
      for (let x = 0; x < w; x++) {
        const gx = x / cell, x0 = Math.floor(gx), tx = sm(gx - x0);
        const a = g[y0][x0], b = g[y0][x0 + 1], c = g[y0 + 1][x0], dd = g[y0 + 1][x0 + 1];
        const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + dd * tx) * ty;
        const i = (y * w + x) * 4;
        const k = (v - 0.5) * alpha * 255;
        d[i] = Math.max(0, Math.min(255, d[i] + k * (hue ? hue[0] : 1)));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + k * (hue ? hue[1] : 1)));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + k * (hue ? hue[2] : 1)));
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** 그레이스케일 높이 캔버스 -> 노멀맵 텍스처 */
  function normalFrom(heightCanvas, strength) {
    const w = heightCanvas.width, h = heightCanvas.height;
    const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    const out = make(w, h);
    const octx = out.getContext('2d');
    const img = octx.createImageData(w, h);
    const d = img.data;
    const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    const s = strength === undefined ? 1.25 : strength;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * s;
        const dy = (at(x, y + 1) - at(x, y - 1)) * s;
        let nx = -dx, ny = -dy, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * w + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  function tex(canvas, repeatX, repeatY, srgb) {
    const t = new T.CanvasTexture(canvas);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = 16;   // 하드웨어 최대치로 클램프된다. 원경 노면 어른거림을 줄인다
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- 노면 ---------------- */
  function asphalt() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    g.fillStyle = '#4b4b53'; g.fillRect(0, 0, S, S);
    // 큰 얼룩은 타일 경계가 격자로 드러나게 만든다. 결은 잘게 유지한다.
    valueNoise(g, S, S, 34, 0.11);
    valueNoise(g, S, S, 13, 0.14);
    valueNoise(g, S, S, 5, 0.13);
    for (let i = 0; i < 24000; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = Math.random() * 1.7;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      g.fillStyle = 'rgba(0,0,0,0.09)';
      g.beginPath(); g.ellipse(x, y, 3 + Math.random() * 12, 2 + Math.random() * 8, Math.random() * 6.28, 0, 6.28); g.fill();
    }
    const hgt = make(S, S), hg = hgt.getContext('2d');
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
    valueNoise(hg, S, S, 7, 0.9);
    return { color: c, height: hgt };
  }

  function grass() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    g.fillStyle = '#2f7a2a'; g.fillRect(0, 0, S, S);
    // 큰 얼룩을 타일 안에 넣으면 그 무늬가 그대로 되풀이돼 바닥이 격자로 보인다.
    // 큰 스케일 변화는 지형 정점 색(Renderer._displace)이 맡고, 여기서는 잔결만 만든다.
    valueNoise(g, S, S, 58, 0.13, [0.7, 1.1, 0.6]);
    valueNoise(g, S, S, 16, 0.20, [0.6, 1.0, 0.5]);
    valueNoise(g, S, S, 6, 0.16, [0.65, 1.05, 0.55]);
    for (let i = 0; i < 42000; i++) {
      const x = Math.random() * S, y = Math.random() * S, l = 2 + Math.random() * 6;
      const t = Math.random();
      g.strokeStyle = t < 0.4 ? 'rgba(126,206,92,0.55)' : (t < 0.7 ? 'rgba(48,124,42,0.55)' : 'rgba(18,72,26,0.5)');
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - l); g.stroke();
    }
    const hgt = make(S, S), hg = hgt.getContext('2d');
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
    valueNoise(hg, S, S, 5, 1.0);
    return { color: c, height: hgt };
  }

  function stone() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    g.fillStyle = '#3b332c'; g.fillRect(0, 0, S, S);
    valueNoise(g, S, S, 72, 0.26);
    valueNoise(g, S, S, 12, 0.18);
    // 석판 이음새
    g.strokeStyle = 'rgba(10,7,5,0.85)'; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = (i + 0.5) * S / 5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      for (let j = 0; j < 5; j++) {
        const x = (j + (i % 2 ? 0.5 : 0)) * S / 5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + S / 5); g.stroke();
      }
    }
    // 불규칙한 균열 + 틈새 마그마
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const glow = Math.random() < 0.22;
      g.strokeStyle = glow ? 'rgba(255,120,30,0.8)' : 'rgba(12,8,6,0.7)';
      g.lineWidth = glow ? 1.8 : 1.3;
      g.beginPath(); g.moveTo(x, y);
      let cx = x, cy = y;
      for (let s = 0; s < 5; s++) { cx += (Math.random() - 0.5) * 30; cy += (Math.random() - 0.5) * 30; g.lineTo(cx, cy); }
      g.stroke();
    }
    const hgt = make(S, S), hg = hgt.getContext('2d');
    hg.fillStyle = '#909090'; hg.fillRect(0, 0, S, S);
    valueNoise(hg, S, S, 10, 0.8);
    hg.strokeStyle = '#303030'; hg.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      const y = (i + 0.5) * S / 5;
      hg.beginPath(); hg.moveTo(0, y); hg.lineTo(S, y); hg.stroke();
      for (let j = 0; j < 5; j++) {
        const x = (j + (i % 2 ? 0.5 : 0)) * S / 5;
        hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x, y + S / 5); hg.stroke();
      }
    }
    return { color: c, height: hgt };
  }

  function lavaField() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    const em = make(S, S), eg = em.getContext('2d');

    // 온통 용암이면 화면 전체가 주황 하나로 떠서 성의 검은 실루엣이 죽는다.
    // 식어서 굳은 검은 암반을 바탕으로 깔고, 그 틈으로만 용암이 빛나게 한다.
    g.fillStyle = '#241512'; g.fillRect(0, 0, S, S);
    valueNoise(g, S, S, 52, 0.42, [1.05, 0.85, 0.8]);
    valueNoise(g, S, S, 9, 0.28, [1.0, 0.9, 0.85]);
    eg.fillStyle = '#000000'; eg.fillRect(0, 0, S, S);

    // 상하좌우로 이어지도록 3x3 으로 감싸 그린다 (타일 경계에서 균열이 끊기지 않게)
    const wrapXY = (fn) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          g.save(); eg.save();
          g.translate(dx * S, dy * S); eg.translate(dx * S, dy * S);
          fn();
          g.restore(); eg.restore();
        }
      }
    };

    // 용암 균열: 굽이치는 선을 따라 바깥쪽은 붉은 잔광, 안쪽은 흰 뜨거운 심
    const vein = (x0, y0, len, wide) => {
      const pts = [[x0, y0]];
      let a = Math.random() * 6.28;
      for (let k = 0; k < len; k++) {
        a += (Math.random() - 0.5) * 1.0;
        const last = pts[pts.length - 1];
        pts.push([last[0] + Math.cos(a) * 15, last[1] + Math.sin(a) * 15]);
      }
      const stroke = (ctx, w, col, blur) => {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (blur) { ctx.shadowColor = col; ctx.shadowBlur = blur; }
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        ctx.stroke();
        ctx.restore();
      };
      for (const ctx of [g, eg]) {
        stroke(ctx, wide * 3.4, 'rgba(120,26,6,0.40)', 16);
        stroke(ctx, wide * 1.9, 'rgba(236,86,12,0.72)', 10);
        stroke(ctx, wide * 0.9, 'rgba(255,196,92,0.92)', 6);
        stroke(ctx, wide * 0.34, 'rgba(255,244,214,0.95)', 0);
      }
    };
    wrapXY(() => {
      for (let i = 0; i < 9; i++) vein(Math.random() * S, Math.random() * S, 8 + (i % 5) * 3, 1.5 + (i % 3) * 0.9);
    });

    // 드문드문 끓는 용암 웅덩이
    wrapXY(() => {
      for (let i = 0; i < 4; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 16 + Math.random() * 26;
        for (const ctx of [g, eg]) {
          const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, 'rgba(255,238,178,0.95)');
          rg.addColorStop(0.45, 'rgba(244,118,20,0.78)');
          rg.addColorStop(1, 'rgba(96,22,6,0)');
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.4), 0, 0, 6.28); ctx.fill();
        }
      }
    });

    // 암반 위 잔부스러기 (색상 맵에만 — 빛나지 않는다)
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 7;
      g.fillStyle = 'rgba(18,10,9,' + (0.2 + Math.random() * 0.4) + ')';
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.6), Math.random() * 6.28, 0, 6.28); g.fill();
    }
    return { color: c, emissive: em };
  }

  function rainbowRoad() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    // 무지개 그라데이션 (U 방향 = 진행 방향)
    const grd = g.createLinearGradient(0, 0, 0, S);
    for (let i = 0; i <= 12; i++) grd.addColorStop(i / 12, 'hsl(' + (i / 12 * 360) + ',88%,56%)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // 육각 프리즘 각인
    g.globalCompositeOperation = 'overlay';
    const hs = 42;
    for (let y = -hs; y < S + hs; y += hs * 1.5) {
      for (let x = -hs; x < S + hs; x += hs * 1.732) {
        const ox = ((y / (hs * 1.5)) | 0) % 2 ? hs * 0.866 : 0;
        g.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = Math.PI / 3 * s;
          const px = x + ox + Math.cos(a) * hs * 0.5, py = y + Math.sin(a) * hs * 0.5;
          s ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.4; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    // 오팔 빛 반짝임
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = Math.random() * 2.2;
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + Math.random() * 0.5) + ')';
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }
    const hgt = make(S, S), hg = hgt.getContext('2d');
    hg.fillStyle = '#8a8a8a'; hg.fillRect(0, 0, S, S);
    hg.strokeStyle = '#c8c8c8'; hg.lineWidth = 3;
    for (let y = -hs; y < S + hs; y += hs * 1.5) {
      for (let x = -hs; x < S + hs; x += hs * 1.732) {
        const ox = ((y / (hs * 1.5)) | 0) % 2 ? hs * 0.866 : 0;
        hg.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = Math.PI / 3 * s;
          const px = x + ox + Math.cos(a) * hs * 0.5, py = y + Math.sin(a) * hs * 0.5;
          s ? hg.lineTo(px, py) : hg.moveTo(px, py);
        }
        hg.closePath(); hg.stroke();
      }
    }
    return { color: c, height: hgt };
  }

  /** 커브 둔턱 - V 방향(폭)으로 줄무늬, U 방향으로 반복 */
  function kerb(colA, colB) {
    const W = 64, H = 64, c = make(W, H), g = c.getContext('2d');
    g.fillStyle = colA; g.fillRect(0, 0, W, H);
    g.fillStyle = colB; g.fillRect(0, 0, W / 2, H);
    return c;
  }

  function startGrid() {
    const S = 256, c = make(S, S), g = c.getContext('2d');
    const n = 8, cs = S / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = ((x + y) % 2) ? '#f2f2f2' : '#161616';
        g.fillRect(x * cs, y * cs, cs, cs);
      }
    }
    return c;
  }

  function boostPad(base, glow) {
    // 배경은 투명하게 두고 화살표만 그린다 (노면 위에 자연스럽게 얹히도록)
    const W = 256, H = 128, c = make(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = base;
    g.globalAlpha = 0.5;
    g.fillRect(0, 8, W, H - 16);
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const x = i * (W / 3);
      const grd = g.createLinearGradient(x, 0, x + W / 3, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.15)');
      grd.addColorStop(1, glow);
      g.fillStyle = grd;
      g.globalAlpha = 0.55 + i * 0.18;
      g.beginPath();
      g.moveTo(x, 10); g.lineTo(x + W / 3.4, H / 2); g.lineTo(x, H - 10);
      g.lineTo(x + W / 9, H / 2); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  /* ---------------- 파티클 / 스프라이트 ---------------- */
  function radial(inner, outer) {
    const S = 128, c = make(S, S), g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.45, outer);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return c;
  }

  function smokePuff() {
    const S = 128, c = make(S, S), g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = S / 2 + (Math.random() - 0.5) * 40, y = S / 2 + (Math.random() - 0.5) * 40;
      const r = 14 + Math.random() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.30)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }
    return c;
  }

  function sparkStreak() {
    const W = 128, H = 32, c = make(W, H), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(W / 2, H / 2, W / 2, H / 3.4, 0, 0, 6.28); g.fill();
    return c;
  }

  function shadowBlob() {
    const S = 128, c = make(S, S), g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return c;
  }

  /* ---------------- 하늘 ----------------
   * 정거원통(equirectangular) 캔버스. 위쪽 절반이 하늘, 아래쪽 절반이 지면이다.
   *   · 캔버스 y=0    -> 천정(+Y)
   *   · 캔버스 y=H/2  -> 지평선
   *   · 캔버스 y=H    -> 발밑(-Y)
   * 하늘 돔에 입히는 동시에 환경맵(Surface.envMap)의 재료로도 쓰이므로,
   * 여기를 잘 그리면 차체에 비치는 반사까지 같이 좋아진다.
   * -------------------------------------- */

  // 키라이트 방향 (-380, 620, 260) 을 equirect UV 로 변환한 값.
  // 하늘에 그리는 해와 실제 그림자 방향을 일치시키기 위한 것.
  const SUN_U = 0.0956, SUN_V = 0.2033;

  /**
   * equirect 는 좌우 끝이 이어져 있다. 가장자리를 넘는 그림은 그냥 그리면
   * 잘려서 세로 이음매가 생기므로, -W / 0 / +W 세 번 그려 감싸준다.
   */
  function wrapX(g, W, fn) {
    for (const dx of [-W, 0, W]) {
      g.save(); g.translate(dx, 0); fn(); g.restore();
    }
  }

  /** 부드러운 원형 글로우 */
  function glow(g, x, y, r, color, a0, a1) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color.replace('%A%', a0));
    rg.addColorStop(0.45, color.replace('%A%', a0 * 0.32));
    rg.addColorStop(1, color.replace('%A%', a1 || 0));
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
  }

  /**
   * 뭉게구름 한 덩어리. 지평선에 가까울수록 납작하고 작게 그려서
   * 원근감을 만든다 (하늘 전체에 같은 크기로 뿌리면 벽지처럼 보인다).
   */
  function puff(g, x, y, s, flat, alpha, tint) {
    const lobes = 5 + Math.floor(Math.random() * 4);
    for (let b = 0; b < lobes; b++) {
      const t = b / (lobes - 1) - 0.5;
      const rw = (34 - Math.abs(t) * 30) * s;
      const rh = rw * (0.52 - flat * 0.3);
      if (rw < 1 || rh < 1) continue;
      // 아랫면은 그늘지고 윗면은 햇빛을 받는다
      const grd = g.createLinearGradient(0, y - rh, 0, y + rh);
      grd.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      grd.addColorStop(1, tint.replace('%A%', alpha * 0.72));
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x + t * 64 * s, y + Math.sin(b * 1.7) * 5 * s, rw, rh, 0, 0, 6.28);
      g.fill();
    }
  }

  function skyDome(theme) {
    const W = 1024, H = 512, c = make(W, H), g = c.getContext('2d');
    const HOR = H / 2;                     // 지평선 행

    if (theme === 'circuit') {
      // 하늘: 천정에서 지평선으로 갈수록 옅어지고, 지평선 근처는 따뜻하게 흐려진다
      const sky = g.createLinearGradient(0, 0, 0, HOR);
      sky.addColorStop(0, '#1a5cb4');
      sky.addColorStop(0.42, '#4f9fe0');
      sky.addColorStop(0.76, '#a8d8f4');
      sky.addColorStop(1, '#dfeef6');
      g.fillStyle = sky; g.fillRect(0, 0, W, HOR);

      // 지면(반사용). 화면에서는 지형에 가려 거의 안 보인다
      const grd = g.createLinearGradient(0, HOR, 0, H);
      grd.addColorStop(0, '#6f8a5c'); grd.addColorStop(1, '#33402c');
      g.fillStyle = grd; g.fillRect(0, HOR - 1, W, H - HOR + 1);

      // 해 + 글로우 (키라이트와 같은 방향). 코어는 좁게, 번짐은 은은하게
      const sx = SUN_U * W, sy = SUN_V * H;
      wrapX(g, W, () => {
        glow(g, sx, sy, 200, 'rgba(255,240,205,%A%)', 0.38);
        glow(g, sx, sy, 58, 'rgba(255,252,240,%A%)', 0.85);
        g.fillStyle = 'rgba(255,255,252,0.98)';
        g.beginPath(); g.arc(sx, sy, 15, 0, 6.28); g.fill();
      });

      // 지평선 헤이즈 — 먼 하늘이 뿌옇게 깔리는 층
      const haze = g.createLinearGradient(0, HOR - 95, 0, HOR);
      haze.addColorStop(0, 'rgba(255,247,232,0)');
      haze.addColorStop(1, 'rgba(255,247,232,0.55)');
      g.fillStyle = haze; g.fillRect(0, HOR - 95, W, 95);

      // 구름: 천정 쪽은 크고 둥글게, 지평선 쪽은 작고 납작하게
      for (let i = 0; i < 54; i++) {
        const t = Math.pow(Math.random(), 0.55);          // 지평선 쪽에 더 많이
        const y = 40 + t * (HOR - 70);
        const flat = t;                                   // 0=천정 1=지평선
        const s = (1.15 - t * 0.72) * (0.65 + Math.random() * 0.7);
        const cx = Math.random() * W, ca = 0.62 + Math.random() * 0.33;
        wrapX(g, W, () => puff(g, cx, y, s, flat, ca, 'rgba(178,200,224,%A%)'));
      }
      // 해 주변 구름은 역광으로 밝게 터진다
      g.globalCompositeOperation = 'lighter';
      wrapX(g, W, () => glow(g, sx, sy, 170, 'rgba(255,238,200,%A%)', 0.22));
      g.globalCompositeOperation = 'source-over';

    } else if (theme === 'bowser') {
      // 화산재 하늘: 위는 검고 지평선은 용암빛으로 달아오른다
      const sky = g.createLinearGradient(0, 0, 0, HOR);
      // 하늘 전체가 밝으면 '노을 진 사막' 이 된다. 이 트랙은 어두운 화산 요새다.
      // 지평선은 어둡게 깔고, 뜨거운 빛은 아래 화구 글로우로만 국소적으로 넣는다.
      sky.addColorStop(0, '#080406');
      sky.addColorStop(0.46, '#250d09');
      sky.addColorStop(0.82, '#551c0b');
      sky.addColorStop(1, '#8a330d');
      g.fillStyle = sky; g.fillRect(0, 0, W, HOR);
      const grd = g.createLinearGradient(0, HOR, 0, H);
      grd.addColorStop(0, '#3d180c'); grd.addColorStop(1, '#130806');
      g.fillStyle = grd; g.fillRect(0, HOR - 1, W, H - HOR + 1);

      // 지평선 여기저기서 올라오는 화구 불빛
      for (let i = 0; i < 7; i++) {
        const vx = (i / 7 + Math.random() * 0.09) * W;
        const vy = HOR - 6 + Math.random() * 20, vr = 120 + Math.random() * 190;
        wrapX(g, W, () => glow(g, vx, vy, vr, 'rgba(255,124,28,%A%)', 0.62));
      }
      // 연기 구름: 아래에서 용암빛을 받는다 (위가 어둡고 아래가 밝다)
      for (let i = 0; i < 40; i++) {
        const t = Math.pow(Math.random(), 0.5);
        const y = 34 + t * (HOR - 56);
        const s = (1.25 - t * 0.78) * (0.7 + Math.random() * 0.8);
        const lobes = 5 + Math.floor(Math.random() * 4), x = Math.random() * W;
        const top = 0.5 + Math.random() * 0.35;
        wrapX(g, W, () => {
          for (let b = 0; b < lobes; b++) {
            const q = b / (lobes - 1) - 0.5;
            const rw = (36 - Math.abs(q) * 31) * s, rh = rw * (0.5 - t * 0.28);
            if (rw < 1 || rh < 1) continue;
            const cg = g.createLinearGradient(0, y - rh, 0, y + rh);
            cg.addColorStop(0, 'rgba(26,14,12,' + top + ')');
            cg.addColorStop(1, 'rgba(188,74,20,' + (0.30 + t * 0.34) + ')');
            g.fillStyle = cg;
            g.beginPath(); g.ellipse(x + q * 68 * s, y + Math.sin(b * 1.7) * 5 * s, rw, rh, 0, 0, 6.28);
            g.fill();
          }
        });
      }
      // 떠오르는 불티
      for (let i = 0; i < 150; i++) {
        const y = HOR * (0.35 + Math.random() * 0.64);
        g.fillStyle = 'rgba(255,' + (140 + Math.random() * 80 | 0) + ',60,' + (0.15 + Math.random() * 0.45) + ')';
        g.beginPath(); g.arc(Math.random() * W, y, 0.8 + Math.random() * 2.2, 0, 6.28); g.fill();
      }

    } else {
      // 우주: 은하수 띠 + 성운 + 별
      g.fillStyle = '#04030c'; g.fillRect(0, 0, W, H);

      // 은하수 — 비스듬히 가로지르는 밝은 띠
      g.save();
      g.translate(W * 0.5, H * 0.42); g.rotate(-0.34);
      for (let i = 0; i < 130; i++) {
        const x = (Math.random() - 0.5) * W * 1.5;
        const y = (Math.random() - 0.5) * 150 * (1 - Math.abs(x) / (W * 0.9));
        const r = 30 + Math.random() * 120;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        const hue = 232 + Math.random() * 70;
        rg.addColorStop(0, 'hsla(' + hue + ',70%,72%,0.072)');
        rg.addColorStop(1, 'hsla(' + hue + ',70%,72%,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      g.restore();

      // 큰 성운
      for (let i = 0; i < 52; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 50 + Math.random() * 210;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        const hue = 215 + Math.random() * 130;
        rg.addColorStop(0, 'hsla(' + hue + ',85%,58%,0.125)');
        rg.addColorStop(1, 'hsla(' + hue + ',85%,58%,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      // 넓고 부드러운 성운 그라데이션은 8비트에서 띠지므로 미세 노이즈로 디더링한다
      valueNoise(g, W, H, 3, 0.05);

      // 잔별 — 은하수 띠 근처에 더 촘촘하게
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * W;
        let y = Math.random() * H;
        if (Math.random() < 0.45) {
          const band = H * 0.42 - (x - W * 0.5) * 0.35;
          y = band + (Math.random() - 0.5) * 160;
          if (y < 0 || y > H) continue;
        }
        const r = Math.random() * 1.5;
        const t = Math.random();
        g.fillStyle = t < 0.62 ? 'rgba(255,255,255,' + (0.4 + Math.random() * 0.6) + ')'
          : (t < 0.84 ? 'rgba(170,205,255,0.85)' : 'rgba(255,190,225,0.8)');
        g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      // 밝은 별 + 십자 섬광
      for (let i = 0; i < 44; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        glow(g, x, y, 16, 'rgba(200,225,255,%A%)', 0.5);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.beginPath(); g.arc(x, y, 1.6 + Math.random() * 1.4, 0, 6.28); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
      }
    }
    return c;
  }

  /* ---------------- 공개 API ---------------- */
  function get(name, builder, repX, repY) {
    if (!cache[name]) {
      const r = builder();
      const canvases = r.color ? r : { color: r };
      const out = { color: tex(canvases.color, repX, repY) };
      if (canvases.height) {
        out.normal = tex(normalFrom(canvases.height), repX, repY, false);
      }
      if (canvases.emissive) out.emissive = tex(canvases.emissive, repX, repY);
      cache[name] = out;
    }
    return cache[name];
  }

  global.Tex = {
    make, tex, normalFrom, valueNoise, get,
    asphalt, grass, stone, lavaField, rainbowRoad, kerb, startGrid, boostPad,
    radial, smokePuff, sparkStreak, shadowBlob, skyDome
  };
})(window);
