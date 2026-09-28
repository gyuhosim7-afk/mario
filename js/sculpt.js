/* =============================================================
 * sculpt.js - 거리장(SDF) 조각 모델러 + Surface Nets 메쉬화
 *
 * 도형을 '붙이는' 대신 거리장을 부드럽게 합쳐(smooth union) 한 덩어리의
 * 표면을 만든다. 머리와 주둥이, 허벅지와 엉덩이 사이 같은 경계가 이음새
 * 없이 살로 이어진다. 빼기(smooth subtraction)로 콧구멍·입꼬리 같은 파인
 * 디테일도 만든다.
 *
 *   const sc = new Sculpt.Scene()
 *     .add(Sculpt.ellipsoid([0, 4, 0], [5, 5.2, 4.8]), 0, '#8ac')     // 머리
 *     .add(Sculpt.roundCone([1, 3, 0], [6, 2.6, 0], 3.4, 2.6), 2, '#9bd') // 주둥이
 *     .sub(Sculpt.sphere([7.2, 4, 0.8], 0.4), 0.3);                    // 콧구멍
 *   const g = Sculpt.mesh(sc, { cell: 0.2 });
 *
 * 메쉬화는 Surface Nets 다. 마칭 큐브보다 삼각형이 고르고 매끈하다.
 * 법선은 삼각형이 아니라 거리장의 기울기에서 뽑아서 격자가 성겨도
 * 음영이 부드럽다. 정점은 한 번 표면으로 투영해 실루엣 오차를 줄인다.
 * 정점 색은 가장 가까운 도형 색을 부드럽게 섞고, 거리장으로 AO 를 굽는다.
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;

  /* ---------------- 기본 도형 ----------------
   * 각 도형은 { f(x,y,z) -> 거리, lo/hi: 경계 상자, c/r: 경계 구 } 이다.
   * 경계 상자는 멀리 있는 도형을 계산에서 빼는 데 쓴다 (아래 Scene.d). */

  function prim(f, lo, hi) {
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const r = Math.hypot(hi[0] - c[0], hi[1] - c[1], hi[2] - c[2]);
    return { f, lo, hi, c, r };
  }

  function sphere(c, r) {
    const [cx, cy, cz] = c;
    return prim((x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
      [cx - r, cy - r, cz - r], [cx + r, cy + r, cz + r]);
  }

  /** 타원체 (iq 근사식). 표면 근처에서는 거의 정확하다 */
  function ellipsoid(c, r) {
    const [cx, cy, cz] = c, [rx, ry, rz] = r;
    const irx = 1 / rx, iry = 1 / ry, irz = 1 / rz;
    return prim((x, y, z) => {
      // Math.hypot 은 V8 에서 sqrt 직접 계산보다 몇 배 느리다 (여기가 제일 뜨거운 곳)
      const ax = (x - cx) * irx, ay = (y - cy) * iry, az = (z - cz) * irz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax * irx, by = ay * iry, bz = az * irz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    }, [cx - rx, cy - ry, cz - rz], [cx + rx, cy + ry, cz + rz]);
  }

  /** 두 점을 잇고 양 끝 반지름이 다른 둥근 원뿔 (iq sdRoundCone) */
  function roundCone(a, b, r1, r2) {
    const [ax, ay, az] = a;
    const bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
    const l2 = bax * bax + bay * bay + baz * baz;
    const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    const srr = Math.sign(rr);
    const R = Math.max(r1, r2);
    return prim((x, y, z) => {
      const pax = x - ax, pay = y - ay, paz = z - az;
      const yv = pax * bax + pay * bay + paz * baz;
      const zv = yv - l2;
      const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2, z2 = zv * zv * l2;
      const k = srr * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
    }, [Math.min(ax, b[0]) - R, Math.min(ay, b[1]) - R, Math.min(az, b[2]) - R],
       [Math.max(ax, b[0]) + R, Math.max(ay, b[1]) + R, Math.max(az, b[2]) + R]);
  }

  /** 반지름이 같은 캡슐 */
  function capsule(a, b, r) { return roundCone(a, b, r, r * 0.9999); }

  /** 여러 점을 잇는 원뿔 사슬 (꼬리·귀처럼 휘는 부위). 반지름도 점마다 */
  function chain(pts, radii) {
    const parts = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const r1 = radii[i], r2 = radii[i + 1];
      parts.push(roundCone(pts[i], pts[i + 1], r1, Math.abs(r1 - r2) < 1e-4 ? r2 * 0.9999 : r2));
    }
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const p of parts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.lo[i]); hi[i] = Math.max(hi[i], p.hi[i]); }
    return prim((x, y, z) => {
      let d = 1e9;
      for (let i = 0; i < parts.length; i++) { const v = parts[i].f(x, y, z); if (v < d) d = v; }
      return d;
    }, lo, hi);
  }

  /** 도형을 회전·이동한다. q 는 [x, y, z] 오일러(XYZ) 라디안 */
  function xform(p, pos, rot) {
    const m = new T.Matrix4().compose(new T.Vector3(pos[0], pos[1], pos[2]),
      new T.Quaternion().setFromEuler(new T.Euler(rot[0], rot[1], rot[2])), new T.Vector3(1, 1, 1));
    const inv = m.clone().invert().elements;
    const f = p.f;
    const box = new T.Box3(new T.Vector3(...p.lo), new T.Vector3(...p.hi)).applyMatrix4(m);
    return prim((x, y, z) => f(
      inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
      inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
      inv[2] * x + inv[6] * y + inv[10] * z + inv[14]),
      box.min.toArray(), box.max.toArray());
  }

  function smin(a, b, k) {
    if (k <= 0) return a < b ? a : b;
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return (a < b ? a : b) - h * h * k * 0.25;
  }

  /* 점에서 경계 상자까지의 거리. 거리장의 하한이라 이보다 가까울 수 없다 */
  function boxDist(p, x, y, z) {
    const dx = Math.max(p.lo[0] - x, 0, x - p.hi[0]);
    const dy = Math.max(p.lo[1] - y, 0, y - p.hi[1]);
    const dz = Math.max(p.lo[2] - z, 0, z - p.hi[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* ---------------- 조각 장면 ---------------- */

  class Scene {
    constructor() { this.ops = []; this.paints = []; }
    /** 살 붙이기. k = 이어지는 부드러운 정도(월드 단위), sharp = 색 경계 선명도 */
    add(p, k, color, sharp) {
      this.ops.push({ kind: 0, p, k: k || 0, color: color != null ? new T.Color(color) : null, sharp: sharp || 3 });
      return this;
    }
    /** 파내기 (콧구멍 · 입꼬리 · 눈두덩) */
    sub(p, k) { this.ops.push({ kind: 1, p, k: k || 0 }); return this; }
    /** 모양은 그대로 두고 색만 칠한다 (배 · 주둥이 · 발바닥 무늬). 도형 안쪽일수록 진하다 */
    paint(p, color, sharp, bias) {
      this.paints.push({ p, color: new T.Color(color), sharp: sharp || 3, bias: bias || 0 });
      return this;
    }

    d(x, y, z) {
      let d = 1e9;
      const ops = this.ops;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i], p = o.p;
        if (o.kind === 0) {
          // 이 도형이 지금 값보다 k 이상 멀면 smin 결과에 영향이 없다
          if (d < 1e8 && boxDist(p, x, y, z) >= d + o.k) continue;
          d = smin(d, p.f(x, y, z), o.k);
        } else {
          // 빼기는 도형 안쪽(음수)일 때만 효과가 있다
          if (boxDist(p, x, y, z) >= o.k - d) continue;
          d = -smin(-d, p.f(x, y, z), o.k);
        }
      }
      return d;
    }

    /** 표면 색: 가장 가까운 '더하기' 도형 기준으로 부드럽게 섞고 칠하기를 얹는다 */
    color(x, y, z, out) {
      const ops = this.ops;
      let vmin = 1e9;
      const vs = this._vs || (this._vs = []);
      vs.length = 0;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.kind !== 0 || !o.color) continue;
        const v = o.p.f(x, y, z);
        vs.push(v);
        if (v < vmin) vmin = v;
      }
      let r = 0, g = 0, b = 0, ws = 0, j = 0;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.kind !== 0 || !o.color) continue;
        const v = vs[j++];
        const w = Math.exp(-o.sharp * Math.max(0, v - vmin));
        r += o.color.r * w; g += o.color.g * w; b += o.color.b * w; ws += w;
      }
      r /= ws; g /= ws; b /= ws;
      for (const pt of this.paints) {
        // 칠하기 도형 안쪽이면 1, 경계에서 부드럽게 0 으로
        const v = pt.p.f(x, y, z) - pt.bias;
        const a = 1 / (1 + Math.exp(pt.sharp * v * 2));
        r += (pt.color.r - r) * a; g += (pt.color.g - g) * a; b += (pt.color.b - b) * a;
      }
      out[0] = r; out[1] = g; out[2] = b;
    }

    /** 더하기 도형들의 경계 상자 (메쉬화 범위 기본값) */
    bounds(pad) {
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const o of this.ops) {
        if (o.kind !== 0) continue;
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.p.lo[i]); hi[i] = Math.max(hi[i], o.p.hi[i]); }
      }
      const pd = pad + Math.max(0, ...this.ops.map(o => o.k));
      return [lo.map(v => v - pd), hi.map(v => v + pd)];
    }

    /** AO 가림용 구 목록 (models.js 의 bakeAO 가 다른 파츠를 어둡게 할 때 쓴다) */
    occluders() {
      return this.ops.filter(o => o.kind === 0).map(o => ({ c: o.p.c.slice(), r: o.p.r * 0.72 }));
    }
  }

  /* ---------------- Surface Nets ---------------- */

  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  /**
   * opts: { cell, bmin, bmax, ao: 거리(0 이면 끔), aoStrength }
   */
  function mesh(sc, opts) {
    opts = opts || {};
    const cell = opts.cell;
    let bmin = opts.bmin, bmax = opts.bmax;
    if (!bmin || !bmax) { const b = sc.bounds(cell * 2); bmin = b[0]; bmax = b[1]; }
    const nx = Math.ceil((bmax[0] - bmin[0]) / cell);
    const ny = Math.ceil((bmax[1] - bmin[1]) / cell);
    const nz = Math.ceil((bmax[2] - bmin[2]) / cell);
    const sx = nx + 1, sy = ny + 1, sz = nz + 1;
    const vals = new Float32Array(sx * sy * sz);
    const I = (i, j, k) => i + sx * (j + sy * k);

    /* 좁은 띠 최적화: 4칸 간격 성긴 격자를 먼저 재고, 표면에서 먼 칸은
     * 성긴 값을 그대로 쓴다. 부호만 맞으면 되므로 결과가 똑같다. */
    const C4 = 4, cx = Math.ceil(sx / C4) + 1, cy = Math.ceil(sy / C4) + 1, cz = Math.ceil(sz / C4) + 1;
    const coarse = new Float32Array(cx * cy * cz);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      coarse[i + cx * (j + cy * k)] = sc.d(bmin[0] + i * C4 * cell, bmin[1] + j * C4 * cell, bmin[2] + k * C4 * cell);
    }
    const far = C4 * cell * 1.8;   // 성긴 칸 대각선보다 넉넉하게
    const ci = new Int32Array(sx);
    for (let i = 0; i < sx; i++) ci[i] = Math.round(i / C4);
    let w = 0;
    for (let k = 0; k < sz; k++) {
      const z = bmin[2] + k * cell, ck = Math.round(k / C4);
      for (let j = 0; j < sy; j++) {
        const y = bmin[1] + j * cell, row = cx * (Math.round(j / C4) + cy * ck);
        for (let i = 0; i < sx; i++, w++) {
          const cv = coarse[ci[i] + row];
          vals[w] = (cv > far || cv < -far) ? cv : sc.d(bmin[0] + i * cell, y, z);
        }
      }
    }

    const cellV = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [];
    const cv = new Float32Array(8);
    const sxy = sx * sy;
    const OFF = CO.map(o => o[0] + sx * o[1] + sxy * o[2]);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      let base = sx * (j + sy * k);
      for (let i = 0; i < nx; i++, base++) {
      // 빠른 거절: 모서리 두 개만 봐도 대부분의 빈 칸이 걸러진다
      const v0 = vals[base];
      if (v0 > cell * 2.5 || v0 < -cell * 2.5) continue;
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const q = vals[base + OFF[c]];
        cv[c] = q;
        if (q < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = ED[e][0], b = ED[e][1];
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        ax += CO[a][0] + t * (CO[b][0] - CO[a][0]);
        ay += CO[a][1] + t * (CO[b][1] - CO[a][1]);
        az += CO[a][2] + t * (CO[b][2] - CO[a][2]);
        n++;
      }
      cellV[i + nx * (j + ny * k)] = pos.length / 3;
      pos.push(bmin[0] + (i + ax / n) * cell, bmin[1] + (j + ay / n) * cell, bmin[2] + (k + az / n) * cell);
      }
    }
    const C = (i, j, k) => cellV[i + nx * (j + ny * k)];
    const idx = [];
    const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
    for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      if ((vals[I(i, j, k)] < 0) === (vals[I(i + 1, j, k)] < 0)) continue;
      quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k));
    }
    for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      if ((vals[I(i, j, k)] < 0) === (vals[I(i, j + 1, k)] < 0)) continue;
      quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1));
    }
    for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      if ((vals[I(i, j, k)] < 0) === (vals[I(i, j, k + 1)] < 0)) continue;
      quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k));
    }

    const nv = pos.length / 3;
    const P = new Float32Array(pos);
    const nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const h = cell * 0.35, tmp = [0, 0, 0];
    // 사면체 기울기 (iq): 중심차분 6번 대신 4번 평가로 같은 품질
    const grad = (x, y, z, o) => {
      const a = sc.d(x + h, y - h, z - h), b = sc.d(x - h, y - h, z + h);
      const c = sc.d(x - h, y + h, z - h), d = sc.d(x + h, y + h, z + h);
      o[0] = a - b - c + d; o[1] = -a - b + c + d; o[2] = -a + b - c + d;
      const l = Math.sqrt(o[0] * o[0] + o[1] * o[1] + o[2] * o[2]) || 1;
      o[0] /= l; o[1] /= l; o[2] /= l;
    };
    const aoD = opts.ao || 0, aoS = opts.aoStrength === undefined ? 0.9 : opts.aoStrength;
    const g = [0, 0, 0];
    for (let v = 0; v < nv; v++) {
      let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      // 표면으로 한 번 투영: 칸 평균 위치는 곡면 안쪽으로 살짝 파고든다
      grad(x, y, z, g);
      const dd = sc.d(x, y, z);
      const mv = Math.max(-cell * 0.5, Math.min(cell * 0.5, dd));
      x -= g[0] * mv; y -= g[1] * mv; z -= g[2] * mv;
      P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
      grad(x, y, z, g);
      nor[v * 3] = g[0]; nor[v * 3 + 1] = g[1]; nor[v * 3 + 2] = g[2];
      sc.color(x, y, z, tmp);
      // 거리장 AO: 법선 방향으로 몇 걸음 나가며 '열려 있어야 할 거리' 와
      // 실제 거리의 차이를 모은다. 목·겨드랑이·주둥이 밑이 자연스럽게 어두워진다.
      let ao = 1;
      if (aoD > 0) {
        let occ = 0, wsum = 0;
        for (let s = 1; s <= 5; s++) {
          const t = aoD * s / 5;
          const w = 1 / s;
          occ += w * Math.max(0, t - sc.d(x + g[0] * t, y + g[1] * t, z + g[2] * t)) / t;
          wsum += w;
        }
        ao = Math.max(0.35, 1 - aoS * occ / wsum);
      }
      col[v * 3] = tmp[0] * ao; col[v * 3 + 1] = tmp[1] * ao; col[v * 3 + 2] = tmp[2] * ao;
    }
    // 감는 방향을 기울기에 맞춘다
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const sx2 = nor[a] + nor[b] + nor[c], sy2 = nor[a + 1] + nor[b + 1] + nor[c + 1], sz2 = nor[a + 2] + nor[b + 2] + nor[c + 2];
      if (fx * sx2 + fy * sy2 + fz * sz2 < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(P, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(nv * 2), 2));
    geo.setIndex(nv > 65535 ? new T.BufferAttribute(new Uint32Array(idx), 1) : new T.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeBoundingSphere();
    return geo;
  }

  /** 표면까지 광선 진행 (눈썹을 머리 표면에 붙일 때 쓴다). 못 찾으면 null */
  function march(sc, o, dir, maxT) {
    let t = 0;
    for (let i = 0; i < 96 && t < maxT; i++) {
      const d = sc.d(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
      if (Math.abs(d) < 1e-3) return t;
      t += d;
    }
    return null;
  }

  /* 같은 캐릭터를 여러 번 만들 때(로비 썸네일 · 레이스 · 원경 LOD) 다시
   * 조각하지 않도록 지오메트리를 캐시한다. optimize() 는 복제해서 쓰므로
   * 원본을 공유해도 안전하다. */
  const cache = {};
  function cached(key, make) {
    if (!cache[key]) cache[key] = make();
    return cache[key];
  }

  /** 디버그: 캐시된 조각별 삼각형 수 */
  function stats() {
    const o = {};
    for (const k in cache) { const g = cache[k].g || cache[k]; o[k] = g.index ? g.index.count / 3 : 0; }
    return o;
  }

  function clear() { for (const k in cache) delete cache[k]; }

  global.Sculpt = { sphere, ellipsoid, roundCone, capsule, chain, xform, Scene, mesh, march, cached, smin, stats, clear };
})(window);
