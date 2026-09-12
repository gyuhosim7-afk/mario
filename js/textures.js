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
    t.anisotropy = 8;
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* ---------------- 노면 ---------------- */
  function asphalt() {
    const S = 512, c = make(S, S), g = c.getContext('2d');
    g.fillStyle = '#4b4b53'; g.fillRect(0, 0, S, S);
    valueNoise(g, S, S, 64, 0.22);
    valueNoise(g, S, S, 9, 0.16);
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
    valueNoise(g, S, S, 96, 0.3, [0.7, 1.1, 0.6]);
    valueNoise(g, S, S, 16, 0.22, [0.6, 1.0, 0.5]);
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
    g.fillStyle = '#2e2723'; g.fillRect(0, 0, S, S);
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
    g.fillStyle = '#ff8a1e'; g.fillRect(0, 0, S, S);
    valueNoise(g, S, S, 48, 0.5, [1.2, 0.7, 0.2]);
    // 식은 표면 껍질
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 46;
      g.fillStyle = 'rgba(40,18,10,' + (0.25 + Math.random() * 0.45) + ')';
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * 6.28, 0, 6.28); g.fill();
    }
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 3 + Math.random() * 16;
      g.fillStyle = 'rgba(255,236,150,' + (0.2 + Math.random() * 0.5) + ')';
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 6.28, 0, 6.28); g.fill();
    }
    const em = make(S, S), eg = em.getContext('2d');
    eg.drawImage(c, 0, 0);
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

  /* ---------------- 하늘 ---------------- */
  function skyDome(theme) {
    const W = 1024, H = 512, c = make(W, H), g = c.getContext('2d');
    if (theme === 'circuit') {
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1d63b8'); grd.addColorStop(0.45, '#63b7f0');
      grd.addColorStop(0.72, '#bfe6ff'); grd.addColorStop(1, '#e9f6ff');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 46; i++) {
        const x = Math.random() * W, y = H * (0.30 + Math.random() * 0.36), s = 0.5 + Math.random();
        g.fillStyle = 'rgba(255,255,255,' + (0.55 + Math.random() * 0.4) + ')';
        for (let b = 0; b < 6; b++) {
          g.beginPath();
          g.ellipse(x + b * 22 * s - 60 * s, y + Math.sin(b) * 7 * s, (30 - Math.abs(b - 2.5) * 6) * s, (14 - Math.abs(b - 2.5) * 2) * s, 0, 0, 6.28);
          g.fill();
        }
      }
    } else if (theme === 'bowser') {
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#12060a'); grd.addColorStop(0.5, '#3a1008');
      grd.addColorStop(0.82, '#8a2a0c'); grd.addColorStop(1, '#c04a10');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * W, y = H * (0.2 + Math.random() * 0.55), r = 40 + Math.random() * 150;
        const rg = g.createRadialGradient(x, y, 2, x, y, r);
        rg.addColorStop(0, 'rgba(60,25,15,0.55)'); rg.addColorStop(1, 'rgba(30,10,6,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * W, y = H * (0.55 + Math.random() * 0.4);
        g.fillStyle = 'rgba(255,150,50,' + (0.1 + Math.random() * 0.3) + ')';
        g.beginPath(); g.arc(x, y, 1 + Math.random() * 2.4, 0, 6.28); g.fill();
      }
    } else {
      g.fillStyle = '#04030c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 40 + Math.random() * 190;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        const hue = 215 + Math.random() * 130;
        rg.addColorStop(0, 'hsla(' + hue + ',85%,58%,0.20)');
        rg.addColorStop(1, 'hsla(' + hue + ',85%,58%,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      for (let i = 0; i < 2600; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 1.5;
        const t = Math.random();
        g.fillStyle = t < 0.62 ? 'rgba(255,255,255,' + (0.4 + Math.random() * 0.6) + ')'
          : (t < 0.84 ? 'rgba(170,205,255,0.85)' : 'rgba(255,190,225,0.8)');
        g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(x, y, 1.6 + Math.random() * 1.4, 0, 6.28); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke();
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
