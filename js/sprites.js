/* =============================================================
 * sprites.js - 캐릭터 + 카트 빌보드 스프라이트 절차적 생성
 *   로컬 3D 좌표(x=우, y=전방, z=상)를 시야각만큼 회전 후
 *   의사 원근 투영하여 24방향 빌보드를 미리 구워둔다.
 * ============================================================= */
(function (global) {
  'use strict';

  const ANGLES = 24;
  const SIZE = 112;
  const TILT = 0.52;      // 카메라 부감 계수

  function rot(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }
  function proj(p, scale, cx, cy) {
    return { x: cx + p.x * scale, y: cy - p.z * scale + p.y * TILT * scale, d: p.y };
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** 3D 박스를 면 단위 깊이 정렬 렌더 */
  function box(ctx, o, sx, sy, sz, a, scale, cx, cy, color, topColor) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = [
      { x: -hx, y: -hy, z: -hz }, { x: hx, y: -hy, z: -hz }, { x: hx, y: hy, z: -hz }, { x: -hx, y: hy, z: -hz },
      { x: -hx, y: -hy, z: hz }, { x: hx, y: -hy, z: hz }, { x: hx, y: hy, z: hz }, { x: -hx, y: hy, z: hz }
    ].map(p => proj(rot({ x: p.x + o.x, y: p.y + o.y, z: p.z + o.z }, a), scale, cx, cy));
    const faces = [
      { i: [4, 5, 6, 7], col: topColor || shade(color, 34) },   // top
      { i: [0, 1, 2, 3], col: shade(color, -60) },              // bottom
      { i: [0, 1, 5, 4], col: shade(color, 12) },               // front(-y)
      { i: [2, 3, 7, 6], col: shade(color, -26) },              // back(+y)
      { i: [1, 2, 6, 5], col: shade(color, -8) },               // right
      { i: [3, 0, 4, 7], col: shade(color, -18) }               // left
    ];
    faces.forEach(f => { f.d = f.i.reduce((s, k) => s + c[k].d, 0) / 4; });
    faces.sort((p, q) => q.d - p.d);
    for (const f of faces) {
      ctx.beginPath();
      ctx.moveTo(c[f.i[0]].x, c[f.i[0]].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(c[f.i[k]].x, c[f.i[k]].y);
      ctx.closePath();
      ctx.fillStyle = f.col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 0.9; ctx.stroke();
    }
  }

  function ball(ctx, o, r, a, scale, cx, cy, color, hi) {
    const p = proj(rot(o, a), scale, cx, cy);
    const rr = r * scale;
    const g = ctx.createRadialGradient(p.x - rr * 0.3, p.y - rr * 0.35, rr * 0.1, p.x, p.y, rr);
    g.addColorStop(0, hi || shade(color, 48));
    g.addColorStop(1, shade(color, -26));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 6.28); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.9; ctx.stroke();
    return p;
  }

  function wheel(ctx, o, r, w, a, scale, cx, cy, tire, rim) {
    const p = proj(rot(o, a), scale, cx, cy);
    const rr = r * scale;
    const side = Math.abs(Math.cos(a));       // 측면에서 볼수록 원형
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = tire;
    ctx.beginPath();
    ctx.ellipse(0, 0, rr * (0.42 + 0.58 * (1 - side)) + w * scale * side * 0.5, rr, 0, 0, 6.28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(0, 0, rr * 0.36 * (0.42 + 0.58 * (1 - side)), rr * 0.38, 0, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 캐릭터 ---------------- */
  function drawCharacter(ctx, ch, a, scale, cx, cy, seat) {
    const col = ch.colors;
    const heavy = ch.cls === 'heavy', light = ch.cls === 'light';
    const bodyR = heavy ? 10 : (light ? 6.6 : 8);
    const headR = heavy ? 8.6 : (light ? 7.4 : 7.2);
    const z0 = seat;

    // 어깨/몸통
    box(ctx, { x: 0, y: -1, z: z0 + bodyR * 0.5 }, bodyR * 1.85, bodyR * 1.25, bodyR * 1.1, a, scale, cx, cy, col.vest);

    if (ch.id === 'bowser') {
      // 등껍질 + 흰 뿔 (그을린 끝부분)
      const sp = proj(rot({ x: 0, y: 5.5, z: z0 + bodyR * 0.75 }, a), scale, cx, cy);
      ctx.fillStyle = '#3f8f3f';
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 12 * scale, 10 * scale, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#1f5f22'; ctx.lineWidth = 1.2; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const ang = -0.6 + i * 0.3;
        const px = sp.x + Math.cos(ang) * 8 * scale, py = sp.y - 3 * scale + Math.sin(ang) * 5 * scale;
        ctx.fillStyle = i % 2 ? '#efe6cf' : '#d8c9a8';
        ctx.beginPath(); ctx.moveTo(px - 2.4 * scale, py + 2.6 * scale);
        ctx.lineTo(px, py - 4.2 * scale); ctx.lineTo(px + 2.4 * scale, py + 2.6 * scale); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(60,40,30,0.55)';
        ctx.beginPath(); ctx.moveTo(px - 0.9 * scale, py - 1.6 * scale); ctx.lineTo(px, py - 4.2 * scale); ctx.lineTo(px + 0.9 * scale, py - 1.6 * scale); ctx.closePath(); ctx.fill();
      }
      // 징 박힌 가죽 팔찌
      [-1, 1].forEach(s => {
        const w = proj(rot({ x: s * bodyR * 0.95, y: -3.4, z: z0 + bodyR * 0.55 }, a), scale, cx, cy);
        ctx.fillStyle = '#6b4a2a';
        ctx.beginPath(); ctx.arc(w.x, w.y, 3.1 * scale, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#d8d8d8';
        for (let k = 0; k < 4; k++) {
          const ang = k * 1.57;
          ctx.beginPath(); ctx.arc(w.x + Math.cos(ang) * 2.4 * scale, w.y + Math.sin(ang) * 2.4 * scale, 0.9 * scale, 0, 6.28); ctx.fill();
        }
      });
    }

    // 머리
    const hp = ball(ctx, { x: 0, y: -1.4, z: z0 + bodyR * 1.15 + headR * 0.8 }, headR, a, scale, cx, cy, col.skin);
    const facing = Math.cos(a) < 0;   // 정면을 보고 있는가

    if (ch.id === 'toad' || ch.id === 'babymario' && false) { /* noop */ }

    if (ch.id === 'toad') {
      // 젤리 광택 양송이 캡 + 붉은 점무늬
      const cp = proj(rot({ x: 0, y: -1.4, z: z0 + bodyR * 1.15 + headR * 1.45 }, a), scale, cx, cy);
      const g = ctx.createRadialGradient(cp.x - 3 * scale, cp.y - 3 * scale, 1, cp.x, cp.y, headR * 1.75 * scale);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8e2d6');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cp.x, cp.y, headR * 1.75 * scale, headR * 1.25 * scale, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = col.spot;
      [[-0.62, 0.1], [0.62, 0.1], [0, -0.42]].forEach(o => {
        ctx.beginPath(); ctx.ellipse(cp.x + o[0] * headR * 1.5 * scale, cp.y + o[1] * headR * scale, headR * 0.42 * scale, headR * 0.34 * scale, 0, 0, 6.28); ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.ellipse(cp.x - headR * 0.7 * scale, cp.y - headR * 0.45 * scale, headR * 0.35 * scale, headR * 0.18 * scale, -0.4, 0, 6.28); ctx.fill();
    } else if (ch.id === 'bowser') {
      // 뿔 + 주둥이 + 화염 입자
      [-1, 1].forEach(s => {
        const h = proj(rot({ x: s * headR * 0.72, y: -1.4, z: z0 + bodyR * 1.15 + headR * 1.5 }, a), scale, cx, cy);
        ctx.fillStyle = '#efe6cf';
        ctx.beginPath(); ctx.moveTo(h.x - 1.8 * scale, h.y + 1.8 * scale); ctx.lineTo(h.x + s * 1.4 * scale, h.y - 4.4 * scale); ctx.lineTo(h.x + 1.8 * scale, h.y + 1.8 * scale); ctx.closePath(); ctx.fill();
      });
      if (facing) {
        const sn = proj(rot({ x: 0, y: -1.4 - headR * 0.85, z: z0 + bodyR * 1.15 + headR * 0.62 }, a), scale, cx, cy);
        ctx.fillStyle = shade(col.skin, 18);
        ctx.beginPath(); ctx.ellipse(sn.x, sn.y, headR * 0.72 * scale, headR * 0.48 * scale, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(sn.x - 2.4 * scale, sn.y + 1.4 * scale); ctx.lineTo(sn.x - 1.2 * scale, sn.y + 4 * scale); ctx.lineTo(sn.x - 0.2 * scale, sn.y + 1.4 * scale); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sn.x + 2.4 * scale, sn.y + 1.4 * scale); ctx.lineTo(sn.x + 1.2 * scale, sn.y + 4 * scale); ctx.lineTo(sn.x + 0.2 * scale, sn.y + 1.4 * scale); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = ['rgba(255,180,40,0.8)', 'rgba(255,90,20,0.7)', 'rgba(120,110,110,0.35)'][i % 3];
          ctx.beginPath(); ctx.arc(sn.x + (Math.random() - 0.5) * 6 * scale, sn.y + (2 + Math.random() * 5) * scale, (0.8 + Math.random() * 1.3) * scale, 0, 6.28); ctx.fill();
        }
      }
    } else {
      // 캡 (마리오/루이지/피치/DK 등)
      const cp = proj(rot({ x: 0, y: -1.4, z: z0 + bodyR * 1.15 + headR * 1.25 }, a), scale, cx, cy);
      ctx.fillStyle = col.cap;
      ctx.beginPath(); ctx.ellipse(cp.x, cp.y, headR * 1.05 * scale, headR * 0.78 * scale, 0, Math.PI, 0); ctx.fill();
      if (facing) {
        ctx.fillStyle = shade(col.cap, -22);
        ctx.beginPath(); ctx.ellipse(cp.x, cp.y + headR * 0.1 * scale, headR * 1.25 * scale, headR * 0.36 * scale, 0, 0, Math.PI); ctx.fill();
        if (ch.id === 'mario' || ch.id === 'luigi') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(cp.x, cp.y - headR * 0.18 * scale, headR * 0.3 * scale, 0, 6.28); ctx.fill();
          ctx.fillStyle = col.cap === '#e5322f' ? '#c0271f' : '#2a7a35';
          ctx.font = 'bold ' + (headR * 0.5 * scale) + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ch.id === 'mario' ? 'M' : 'L', cp.x, cp.y - headR * 0.16 * scale);
        }
      }
    }

    // 얼굴 (정면일 때만)
    if (facing) {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(hp.x - headR * 0.32 * scale, hp.y - headR * 0.05 * scale, headR * 0.14 * scale, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(hp.x + headR * 0.32 * scale, hp.y - headR * 0.05 * scale, headR * 0.14 * scale, 0, 6.28); ctx.fill();
      if (ch.id === 'mario' || ch.id === 'luigi') {
        ctx.fillStyle = '#4a2c17';
        ctx.beginPath(); ctx.ellipse(hp.x, hp.y + headR * 0.42 * scale, headR * 0.56 * scale, headR * 0.2 * scale, 0, 0, 6.28); ctx.fill();
      }
    }

    // 핸들을 쥔 두 손
    [-1, 1].forEach(s => {
      const w = proj(rot({ x: s * bodyR * 0.78, y: -bodyR * 0.95, z: z0 + bodyR * 0.95 }, a), scale, cx, cy);
      ctx.fillStyle = '#f4f4f4';
      ctx.beginPath(); ctx.arc(w.x, w.y, (heavy ? 2.9 : 2.3) * scale, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    });
  }

  /* ---------------- 카트 ---------------- */
  function drawKart(ctx, combo, a, scale, cx, cy) {
    const ch = combo.character, fr = combo.frame, wh = combo.wheel, gl = combo.glider;
    const heavy = ch.cls === 'heavy', light = ch.cls === 'light';
    const bw = heavy ? 27 : (light ? 21 : 24);       // 차폭
    const bl = heavy ? 34 : (light ? 28 : 31);       // 전장
    const wr = wh.id === 'monster' ? 8.5 : (wh.id === 'roller' ? 5.2 : 6.8);

    const parts = [];
    // 뒷바퀴(먼저 깊이 정렬 위해 직접 그림)
    const wheels = [
      { x: -bw * 0.52, y: -bl * 0.32 }, { x: bw * 0.52, y: -bl * 0.32 },
      { x: -bw * 0.56, y: bl * 0.34 }, { x: bw * 0.56, y: bl * 0.34 }
    ];
    const wproj = wheels.map(w => ({ w, d: rot({ x: w.x, y: w.y, z: wr }, a).y }));
    wproj.sort((p, q) => q.d - p.d);

    // 뒤쪽 바퀴 2개
    wproj.slice(0, 2).forEach(p => wheel(ctx, { x: p.w.x, y: p.w.y, z: wr }, wr, 4, a, scale, cx, cy, wh.tire, wh.rim));

    // 글라이더 (뒤쪽 윙)
    const gp = proj(rot({ x: 0, y: bl * 0.42, z: wr * 2.6 }, a), scale, cx, cy);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = gl.wing;
    ctx.beginPath();
    ctx.moveTo(gp.x - bw * 0.62 * scale, gp.y);
    ctx.lineTo(gp.x, gp.y - 4.5 * scale);
    ctx.lineTo(gp.x + bw * 0.62 * scale, gp.y);
    ctx.lineTo(gp.x, gp.y + 2.2 * scale);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();

    // 섀시
    box(ctx, { x: 0, y: 0, z: wr * 1.15 }, bw, bl, wr * 1.1, a, scale, cx, cy, fr.body);
    // 노즈콘
    box(ctx, { x: 0, y: -bl * 0.56, z: wr * 1.0 }, bw * 0.72, bl * 0.26, wr * 0.7, a, scale, cx, cy, shade(fr.body, -18));
    // 엔진/배기
    box(ctx, { x: 0, y: bl * 0.52, z: wr * 1.35 }, bw * 0.66, bl * 0.2, wr * 0.9, a, scale, cx, cy, '#3a3a42');

    // 캐릭터
    drawCharacter(ctx, ch, a, scale, cx, cy, wr * 1.7);

    // 앞쪽 바퀴 2개
    wproj.slice(2).forEach(p => wheel(ctx, { x: p.w.x, y: p.w.y, z: wr }, wr, 4, a, scale, cx, cy, wh.tire, wh.rim));
  }

  /** 24방향 빌보드 생성 */
  function build(combo, size) {
    const px = size || SIZE;
    const frames = [];
    for (let i = 0; i < ANGLES; i++) {
      const c = document.createElement('canvas');
      c.width = px; c.height = px;
      const g = c.getContext('2d');
      const a = (i / ANGLES) * Math.PI * 2;
      drawKart(g, combo, a, px / 112 * 1.28, px / 2, px * 0.62);
      frames.push(c);
    }
    return { frames, count: ANGLES, size: px };
  }

  /** 로비 프리뷰용 단일 프레임 직접 렌더 */
  function preview(ctx, combo, angle, scale, cx, cy) {
    drawKart(ctx, combo, angle, scale, cx, cy);
  }

  /* ---------------- 아이템 / 오브젝트 빌보드 ---------------- */
  const objCache = {};
  function obj(kind) {
    if (objCache[kind]) return objCache[kind];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.lineWidth = 2;
    switch (kind) {
      case 'itembox': {
        g.save(); g.translate(32, 32);
        const grd = g.createLinearGradient(-20, -20, 20, 20);
        grd.addColorStop(0, 'rgba(255,220,120,0.95)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.85)'); grd.addColorStop(1, 'rgba(160,230,255,0.9)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(0, -24); g.lineTo(22, -8); g.lineTo(22, 14); g.lineTo(0, 28); g.lineTo(-22, 14); g.lineTo(-22, -8); g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
        g.fillStyle = '#e03a3a'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', 0, 2);
        g.restore(); break;
      }
      case 'banana': {
        g.fillStyle = '#f2d13c';
        g.beginPath(); g.ellipse(32, 36, 20, 11, 0.35, 0, 6.28); g.fill();
        g.strokeStyle = '#b89a1e'; g.stroke();
        g.fillStyle = '#7a5c14'; g.fillRect(44, 22, 4, 9); break;
      }
      case 'greenshell': case 'redshell': case 'spiny': {
        const col = kind === 'greenshell' ? '#3fbf5f' : (kind === 'redshell' ? '#e03a3a' : '#3f6fd0');
        const grd = g.createRadialGradient(26, 26, 3, 32, 34, 24);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, col); grd.addColorStop(1, '#1a3a1a');
        g.fillStyle = grd;
        g.beginPath(); g.arc(32, 34, 22, Math.PI, 0); g.lineTo(54, 42); g.lineTo(10, 42); g.closePath(); g.fill();
        g.fillStyle = '#f7e6c8'; g.fillRect(10, 40, 44, 7);
        if (kind === 'spiny') {
          g.fillStyle = '#ffffff';
          for (let i = 0; i < 5; i++) {
            const ang = Math.PI + i * Math.PI / 4;
            const x = 32 + Math.cos(ang) * 20, y = 34 + Math.sin(ang) * 20;
            g.beginPath(); g.moveTo(x - 4, y + 3); g.lineTo(x + Math.cos(ang) * 8, y + Math.sin(ang) * 8); g.lineTo(x + 4, y + 3); g.closePath(); g.fill();
          }
        }
        break;
      }
      case 'bobomb': {
        g.fillStyle = '#2c2c36';
        g.beginPath(); g.arc(32, 36, 18, 0, 6.28); g.fill();
        g.fillStyle = '#e8e8f0'; g.beginPath(); g.arc(26, 32, 4, 0, 6.28); g.arc(38, 32, 4, 0, 6.28); g.fill();
        g.strokeStyle = '#f2c14e'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(32, 18); g.quadraticCurveTo(40, 8, 46, 12); g.stroke();
        g.fillStyle = '#ff9a1e'; g.beginPath(); g.arc(47, 11, 4, 0, 6.28); g.fill();
        break;
      }
      case 'coin': {
        const grd = g.createRadialGradient(28, 28, 2, 32, 32, 18);
        grd.addColorStop(0, '#fff3b0'); grd.addColorStop(1, '#d99b1a');
        g.fillStyle = grd; g.beginPath(); g.ellipse(32, 32, 13, 18, 0, 0, 6.28); g.fill();
        g.strokeStyle = '#a87410'; g.stroke(); break;
      }
      case 'thwomp': {
        g.fillStyle = '#6b7a90';
        g.fillRect(8, 6, 48, 52);
        g.strokeStyle = '#39465a'; g.lineWidth = 3; g.strokeRect(8, 6, 48, 52);
        g.fillStyle = '#e8eef5'; g.beginPath(); g.arc(24, 26, 6, 0, 6.28); g.arc(40, 26, 6, 0, 6.28); g.fill();
        g.fillStyle = '#1a1f2a'; g.beginPath(); g.arc(25, 27, 3, 0, 6.28); g.arc(41, 27, 3, 0, 6.28); g.fill();
        g.strokeStyle = '#1a1f2a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(20, 44); g.lineTo(44, 44); g.stroke();
        break;
      }
      case 'tree': {
        g.fillStyle = '#6b4a2a'; g.fillRect(28, 36, 8, 24);
        g.fillStyle = '#2f8f3f'; g.beginPath(); g.arc(32, 28, 18, 0, 6.28); g.fill();
        g.fillStyle = '#49b54f'; g.beginPath(); g.arc(27, 23, 11, 0, 6.28); g.fill();
        break;
      }
      case 'piranha': {
        g.fillStyle = '#2f8f3f'; g.fillRect(29, 30, 6, 30);
        g.fillStyle = '#e03a3a'; g.beginPath(); g.arc(32, 22, 14, 0, 6.28); g.fill();
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(22 + i * 4, 14 + (i % 2) * 3, 3, 0, 6.28); g.fill(); }
        break;
      }
      case 'crowd': {
        for (let i = 0; i < 10; i++) {
          const x = 6 + (i % 5) * 12, y = 20 + ((i / 5) | 0) * 16;
          g.fillStyle = ['#e8e8e8', '#f0d0d0', '#d8e8ff'][i % 3];
          g.beginPath(); g.arc(x, y, 5, 0, 6.28); g.fill();
          g.fillStyle = ['#e03a3a', '#3fbf5f', '#3f6fd0'][i % 3];
          g.beginPath(); g.arc(x, y - 3, 6, Math.PI, 0); g.fill();
        }
        g.strokeStyle = '#f4d03f'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(10, 52); g.lineTo(54, 52); g.stroke();
        break;
      }
      case 'sign': {
        g.fillStyle = '#8a6a3a'; g.fillRect(29, 34, 6, 26);
        g.fillStyle = '#f4f4f4'; g.fillRect(12, 10, 40, 26);
        g.strokeStyle = '#e03a3a'; g.lineWidth = 3; g.strokeRect(12, 10, 40, 26);
        g.fillStyle = '#e03a3a'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center';
        g.fillText('MK', 32, 28); break;
      }
      case 'pillar': {
        const grd = g.createLinearGradient(20, 0, 44, 0);
        grd.addColorStop(0, '#4a4038'); grd.addColorStop(0.5, '#6a5c50'); grd.addColorStop(1, '#312a24');
        g.fillStyle = grd; g.fillRect(20, 4, 24, 56);
        g.fillStyle = '#241d18'; g.fillRect(16, 0, 32, 8); g.fillRect(16, 54, 32, 8);
        break;
      }
      case 'lavafall': {
        const grd = g.createLinearGradient(0, 0, 0, 64);
        grd.addColorStop(0, '#ffd24a'); grd.addColorStop(0.5, '#ff7a1e'); grd.addColorStop(1, '#c0300a');
        g.fillStyle = grd; g.fillRect(18, 0, 28, 64);
        g.fillStyle = 'rgba(255,240,180,0.5)';
        for (let i = 0; i < 8; i++) g.fillRect(20 + Math.random() * 22, Math.random() * 60, 2, 8);
        break;
      }
      case 'statue': {
        g.fillStyle = '#4a4038'; g.beginPath(); g.moveTo(32, 4); g.lineTo(50, 60); g.lineTo(14, 60); g.closePath(); g.fill();
        g.fillStyle = '#ff7a1e'; g.beginPath(); g.arc(27, 30, 4, 0, 6.28); g.arc(38, 30, 4, 0, 6.28); g.fill();
        break;
      }
      case 'staroid': {
        g.fillStyle = '#ffe9a8';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 9 : 24, ang = i * Math.PI / 5 - Math.PI / 2;
          const x = 32 + Math.cos(ang) * r, y = 32 + Math.sin(ang) * r;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
        break;
      }
      case 'mushroom': case 'triplemush': {
        g.fillStyle = '#f7ecd8';
        g.beginPath(); g.ellipse(32, 46, 13, 13, 0, Math.PI, 0); g.fill();
        g.fillRect(19, 40, 26, 8);
        const mg = g.createRadialGradient(24, 22, 3, 32, 30, 26);
        mg.addColorStop(0, '#ff8a86'); mg.addColorStop(1, '#d0272c');
        g.fillStyle = mg;
        g.beginPath(); g.ellipse(32, 30, 26, 20, 0, Math.PI, 0); g.fill();
        g.fillStyle = '#fbf3e2';
        [[-14, 24], [12, 22], [0, 16]].forEach(o => {
          g.beginPath(); g.ellipse(32 + o[0], o[1], 6.5, 5.2, 0, 0, 6.28); g.fill();
        });
        g.fillStyle = '#3a2b22';
        g.beginPath(); g.ellipse(27, 44, 1.9, 2.6, 0, 0, 6.28); g.ellipse(37, 44, 1.9, 2.6, 0, 0, 6.28); g.fill();
        break;
      }
      case 'star': {
        const sg = g.createRadialGradient(28, 26, 2, 32, 32, 28);
        sg.addColorStop(0, '#fffbe0'); sg.addColorStop(0.6, '#ffd93c'); sg.addColorStop(1, '#e59a10');
        g.fillStyle = sg;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 11 : 27, a = i * Math.PI / 5 - Math.PI / 2;
          const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath(); g.fill();
        g.strokeStyle = '#b8760a'; g.lineWidth = 1.6; g.stroke();
        g.fillStyle = '#2a1c06';
        g.beginPath(); g.ellipse(26, 30, 2.4, 3.4, 0, 0, 6.28); g.ellipse(38, 30, 2.4, 3.4, 0, 0, 6.28); g.fill();
        break;
      }
      case 'lightning': {
        const lg = g.createLinearGradient(0, 4, 0, 60);
        lg.addColorStop(0, '#fffbb0'); lg.addColorStop(1, '#f0c414');
        g.fillStyle = lg;
        g.beginPath();
        g.moveTo(38, 4); g.lineTo(16, 34); g.lineTo(29, 34); g.lineTo(22, 60);
        g.lineTo(48, 26); g.lineTo(33, 26); g.closePath();
        g.fill();
        g.strokeStyle = '#a8790a'; g.lineWidth = 1.6; g.stroke();
        break;
      }
      case 'bulletbill': {
        const bg = g.createLinearGradient(0, 18, 0, 48);
        bg.addColorStop(0, '#5a5a66'); bg.addColorStop(0.5, '#2c2c36'); bg.addColorStop(1, '#15151c');
        g.fillStyle = bg;
        g.beginPath();
        g.moveTo(8, 22); g.lineTo(40, 22);
        g.arc(40, 32, 10, -Math.PI / 2, Math.PI / 2);
        g.lineTo(8, 42); g.closePath(); g.fill();
        g.fillStyle = '#f2f2f5';
        g.beginPath(); g.arc(41, 28, 4.2, 0, 6.28); g.arc(41, 37, 4.2, 0, 6.28); g.fill();
        g.fillStyle = '#15151c';
        g.beginPath(); g.arc(42, 28, 2.1, 0, 6.28); g.arc(42, 37, 2.1, 0, 6.28); g.fill();
        g.fillStyle = '#3a3a46';
        [16, 10].forEach((x, i) => { g.fillRect(x - 4, 24 - i * 2, 5, 16 + i * 4); });
        g.fillStyle = '#ffb03a';
        for (let i = 0; i < 5; i++) g.fillRect(2 - i, 28 + (i % 2) * 4, 5, 4);
        break;
      }
      default: {
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 16, 0, 6.28); g.fill();
      }
    }
    objCache[kind] = c;
    return c;
  }

  /** 아이템 id -> 절차적 아이콘 캔버스 (이모지 폰트에 의존하지 않는다) */
  const ITEM_ART = {
    banana: 'banana', greenshell: 'greenshell', redshell: 'redshell', spiny: 'spiny',
    bobomb: 'bobomb', coin: 'coin', mushroom: 'mushroom', triplemush: 'mushroom',
    star: 'star', lightning: 'lightning', bulletbill: 'bulletbill'
  };
  function itemArt(id) { return ITEM_ART[id] ? obj(ITEM_ART[id]) : null; }

  const urlCache = {};
  function itemArtURL(id) {
    if (!urlCache[id]) {
      const c = itemArt(id);
      urlCache[id] = c ? c.toDataURL() : '';
    }
    return urlCache[id];
  }

  global.Sprites = { build, preview, obj, drawKart, itemArt, itemArtURL, ANGLES };
})(window);
