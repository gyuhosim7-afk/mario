/* =============================================================
 * render3d.js - three.js 기반 3D 렌더러
 *   게임 좌표 (x, y)=지면, z=높이  ->  three 좌표 (x, z, y)
 *   기존 렌더러와 동일한 API(camera.follow / spawn / render)를 유지한다.
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;
  const D = global.GameData;
  const S = D.SURFACE;

  /* ---------------- 동적 카메라 ---------------- */
  class Camera3D {
    constructor(aspect) {
      this.cam = new T.PerspectiveCamera(62, aspect, 1.2, 9000);
      this.x = 0; this.y = 0; this.h = 62;
      this.yaw = 0;
      this.dist = 128;
      this.fov = 62;
      this.shake = 0;
      this.lookAhead = 60;
      this.roll = 0; this._vr = 0;
      this.dip = 0; this._vd = 0;
      this._prevZ = 0;
      this._t = 0;
    }
    reset(k) {
      this.yaw = k.angle;
      this.x = k.x - Math.cos(k.angle) * this.dist;
      this.y = k.y - Math.sin(k.angle) * this.dist;
      this.apply(k);
    }
    follow(k, dt) {
      const boosting = k.boostTimer > 0 || k.state === 'BULLET';
      const sr = Math.max(0, Math.min(1.5, k.speedRatio));
      const tDist = 122 + sr * 26 + (boosting ? 22 : 0);
      const tFov = 60 + sr * 9 + (boosting ? 12 : 0);
      const tH = 53 + sr * 10 + k.z * 0.5;

      let yaw = k.angle;
      if (k.drifting) yaw += k.driftDir * 0.24;
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const lag = k.controllable ? 6.4 : 2.8;
      this.yaw += dy * Math.min(1, dt * lag);

      this.dist += (tDist - this.dist) * Math.min(1, dt * 3.5);
      this.fov += (tFov - this.fov) * Math.min(1, dt * 3.2);
      this.h += (tH - this.h) * Math.min(1, dt * 4.5);

      const tx = k.x - Math.cos(this.yaw) * this.dist;
      const ty = k.y - Math.sin(this.yaw) * this.dist;
      this.x += (tx - this.x) * Math.min(1, dt * 14);
      this.y += (ty - this.y) * Math.min(1, dt * 14);

      // 코너에서 카메라도 살짝 기운다 + 착지 시 아래로 꿀렁
      const st = (k.input && k.input.steer) || 0;
      const tRoll = -st * 0.055 - (k.drifting ? k.driftDir * 0.035 : 0);
      const ra = (tRoll - this.roll) * 45 - this._vr * 9;
      this._vr += ra * dt; this.roll += this._vr * dt;
      if (this._prevZ > 2.5 && k.z <= 0.5) this._vd -= 36;
      this._prevZ = k.z;
      const da = (0 - this.dip) * 80 - this._vd * 11;
      this._vd += da * dt; this.dip += this._vd * dt;

      this._t += dt;
      this.shake = Math.max(this.shake, k.shake);
      this.shake = Math.max(0, this.shake - dt * 2.1);
      this.apply(k);
    }
    apply(k) {
      // 흔들림: 프레임마다 난수를 쓰면 지직거리는 노이즈로 보인다.
      // 서로 안 맞아떨어지는 주파수의 사인을 겹쳐 '덜컹거림'으로 읽히게 한다.
      let sx = 0, sy = 0, sz = 0, sr = 0;
      if (this.shake > 0.004) {
        const s = this.shake * this.shake * 7, t = this._t;
        sx = (Math.sin(t * 31.3) + 0.55 * Math.sin(t * 53.9)) * s * 0.42;
        sy = (Math.sin(t * 27.7 + 1.3) + 0.55 * Math.sin(t * 44.1)) * s * 0.42;
        sz = (Math.sin(t * 35.9 + 2.4) + 0.55 * Math.sin(t * 61.3)) * s * 0.42;
        sr = Math.sin(t * 24.6 + 0.7) * this.shake * this.shake * 0.05;
      }
      this.cam.position.set(this.x + sx, this.h + sy + Math.max(-6, Math.min(6, this.dip)), this.y + sz);
      const la = this.lookAhead;
      this.cam.lookAt(
        k.x + Math.cos(k.angle) * la * 0.35 + sx * 0.35,
        21 + k.z * 0.85 + sy * 0.35,
        k.y + Math.sin(k.angle) * la * 0.35 + sz * 0.35
      );
      if (this.roll || sr) this.cam.rotateZ(this.roll + sr);
      if (Math.abs(this.cam.fov - this.fov) > 0.01) {
        this.cam.fov = this.fov;
        this.cam.updateProjectionMatrix();
      }
    }
  }

  /* 매 프레임 재사용하는 임시 객체. 프레임마다 new 하면 GC 스파이크가 된다. */
  const _m4 = new T.Matrix4(), _m4b = new T.Matrix4();
  const _q = new T.Quaternion(), _eul = new T.Euler();
  const _v3a = new T.Vector3(), _v3b = new T.Vector3();

  /* ---------------- 파티클 (단일 Points) ---------------- */
  const MAX_P = 1400;
  // 파티클은 객체 풀이다. 레인보우 트랙에서 카트 8대가 초당 400개 넘게 뿜는데
  // 매번 {} 를 새로 만들면 그게 전부 쓰레기가 되고, 1~2초마다 GC 가 돌면서
  // 프레임이 통째로 튄다. 풀에서 꺼내 쓰고 죽으면 자리만 맞바꾼다 (할당 0).
  class Particles {
    constructor(scene) {
      this.n = 0;
      this.pool = new Array(MAX_P);
      for (let i = 0; i < MAX_P; i++) {
        this.pool[i] = { x:0, y:0, z:0, vx:0, vy:0, vz:0, life:0, max:1,
                         size:4, smoke:false, r:1, g:1, b:1 };
      }
      this.live = 0;                  // pool[0 .. live-1] 이 살아 있는 파티클
      const g = new T.BufferGeometry();
      this.pos = new Float32Array(MAX_P * 3);
      this.col = new Float32Array(MAX_P * 3);
      this.siz = new Float32Array(MAX_P);
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new T.BufferAttribute(this.col, 3));
      g.setAttribute('size', new T.BufferAttribute(this.siz, 1));
      g.setDrawRange(0, 0);
      const tex = global.Tex.tex(global.Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)'));
      const m = new T.ShaderMaterial({
        uniforms: { map: { value: tex } },
        vertexShader: [
          'attribute float size;', 'varying vec3 vCol;',
          'void main(){ vCol = color;',
          '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
          '  gl_PointSize = size * (300.0 / -mv.z);',
          '  gl_Position = projectionMatrix * mv; }'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D map;', 'varying vec3 vCol;',
          'void main(){ vec4 t = texture2D(map, gl_PointCoord);',
          '  if (t.a < 0.02) discard;',
          '  gl_FragColor = vec4(vCol * t.a, t.a); }'
        ].join('\n'),
        transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, vertexColors: true
      });
      this.points = new T.Points(g, m);
      this.points.frustumCulled = false;
      this.geo = g;
      scene.add(this.points);
      this._c = new T.Color();
    }
    /**
     * color 는 0xrrggbb 정수를 권장한다. 문자열을 주면 three 가 매번 정규식으로
     * 파싱하면서 문자열 쓰레기를 만든다 (특히 'hsl(...)' 을 매 프레임 조립할 때).
     */
    spawn(x, y, z, vx, vy, vz, life, color, size, kind) {
      if (this.live >= MAX_P) return;
      this._c.set(color);
      const q = this.pool[this.live++];
      q.x = x; q.y = y; q.z = z;
      q.vx = vx; q.vy = vy; q.vz = vz;
      q.life = life; q.max = life;
      q.size = size || 4;
      q.smoke = kind === 'smoke';
      q.r = this._c.r; q.g = this._c.g; q.b = this._c.b;
    }
    clear() { this.live = 0; this.geo.setDrawRange(0, 0); }
    update(dt) {
      const pool = this.pool;
      const p = this.pos, c = this.col, s = this.siz;
      let n = this.live;
      for (let i = n - 1; i >= 0; i--) {
        const q = pool[i];
        q.life -= dt;
        if (q.life <= 0) {
          // 죽은 자리와 마지막 자리를 '교환'한다. pop 하지 않으므로 객체는
          // 풀에 그대로 남고, 다음 spawn 이 그 객체를 재사용한다.
          n--;
          pool[i] = pool[n]; pool[n] = q;
          continue;
        }
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.vz -= (q.smoke ? 18 : 240) * dt;
        if (q.z < 0) { q.z = 0; q.vz *= -0.26; q.vx *= 0.72; q.vy *= 0.72; }
        const damp = 1 - dt * (q.smoke ? 0.8 : 1.5);
        q.vx *= damp; q.vy *= damp;
      }
      this.live = n;
      for (let i = 0; i < n; i++) {
        const q = pool[i], a = q.life / q.max;
        const o = i * 3;
        p[o] = q.x; p[o + 1] = q.z; p[o + 2] = q.y;
        const f = q.smoke ? a * 0.5 : a;
        c[o] = q.r * f; c[o + 1] = q.g * f; c[o + 2] = q.b * f;
        s[i] = q.size * (q.smoke ? (2.2 - a) : (0.5 + a * 0.9));
      }
      this.geo.setDrawRange(0, n);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
    }
    get length() { return this.live; }
    set length(v) { if (v === 0) this.clear(); }
  }

  /* ---------------- 리본 지오메트리 헬퍼 ---------------- */
  function ribbon(nodes, innerOff, outerOff, y, uScale, closed, vertexHue) {
    const n = nodes.length;
    const count = n + 1;
    const pos = new Float32Array(count * 2 * 3);
    const uv = new Float32Array(count * 2 * 2);
    const nor = new Float32Array(count * 2 * 3);
    const col = vertexHue ? new Float32Array(count * 2 * 3) : null;
    const idx = [];
    let dist = 0;
    const c = new T.Color();
    for (let i = 0; i < count; i++) {
      const nd = nodes[i % n];
      if (i > 0) dist += nodes[(i - 1) % n].seg;
      const ax = nd.x + nd.nx * innerOff, ay = nd.y + nd.ny * innerOff;
      const bx = nd.x + nd.nx * outerOff, by = nd.y + nd.ny * outerOff;
      const o = i * 6;
      pos[o] = ax; pos[o + 1] = y; pos[o + 2] = ay;
      pos[o + 3] = bx; pos[o + 4] = y; pos[o + 5] = by;
      nor[o + 1] = 1; nor[o + 4] = 1;
      const u = dist / uScale;
      uv[i * 4] = u; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
      if (col) {
        c.setHSL(((i / n) * vertexHue) % 1, 0.85, 0.55);
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        col[o + 3] = c.r; col[o + 4] = c.g; col[o + 5] = c.b;
      }
      if (i < count - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    if (col) g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  /**
   * 템플릿 그룹을 InstancedMesh 로 복제 (드로우콜 절감).
   *
   * 인스턴싱은 '같은 메시를 여러 번'을 1콜로 줄여 줄 뿐, 템플릿이 몇 개의
   * 메시로 되어 있는지는 그대로 남는다. 나무 한 그루가 잎/줄기/그림자판
   * 4개 메시면 인스턴스로 만들어도 콜이 4개다. 그래서 먼저 머티리얼 단위로
   * 병합해서 잎 개수 자체를 줄인다.
   */
  function instantiate(template, transforms, scene, castShadow) {
    const leaves = [];
    if (global.Models && global.Models.optimize) global.Models.optimize(template);
    template.updateMatrixWorld(true);
    template.traverse(o => {
      if (o.isMesh) leaves.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone(), cast: o.castShadow });
    });
    const out = [];
    const tmp = new T.Matrix4();
    for (const leaf of leaves) {
      const im = new T.InstancedMesh(leaf.geo, leaf.mat, transforms.length);
      im.castShadow = castShadow !== false && leaf.cast;
      im.receiveShadow = castShadow !== false;
      transforms.forEach((tr, i) => {
        tmp.copy(tr).multiply(leaf.m);
        im.setMatrixAt(i, tmp);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      scene.add(im);
      out.push(im);
    }
    return out;
  }

  /* ---------------- 렌더러 ---------------- */
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.gl.shadowMap.enabled = true;
      this.gl.shadowMap.type = T.PCFSoftShadowMap;
      this.gl.toneMapping = T.ACESFilmicToneMapping;
      this.gl.toneMappingExposure = 1.02;
      this.gl.outputColorSpace = T.SRGBColorSpace;

      this.scene = new T.Scene();
      this.camera = new Camera3D(16 / 9);
      this.camera2 = null;        // 2인 분할 화면의 아래쪽 뷰
      this.split = false;
      this.particles = new Particles(this.scene);
      this.time = 0;
      this.flash = 0;
      this.flashColor = '255,255,255';
      this.trackGroup = null;
      this.kartNodes = new Map();
      this.hazardNodes = new Map();
      this._itemTpl = {};
      this._composerOn = true;
      // 품질은 기본값이 '최고 고정'이다.
      // 적응형(auto)은 단계가 바뀔 때마다 셰이더를 다시 컴파일하므로 레이스
      // 도중에 눈에 띄게 멈춘다. 그 멈춤이 낮은 프레임보다 더 거슬린다는
      // 판단이라 기본을 고정으로 두고, 필요하면 로비에서 '자동'을 고를 수 있게 한다.
      // 소프트웨어 렌더링만은 능력 판정이라 main.js 에서 고정값과 무관하게 내린다.
      this.quality = 3;
      this._envOn = true;          // 환경맵은 품질 2 이상에서만 (setQuality 가 갱신)
      this.onQualityChange = null;  // 자동 강등을 사용자에게 알리기 위한 콜백
      this.onPerfWarn = null;       // 고정 품질인데 프레임이 안 나올 때 1회 안내
      this.qualityMode = 3;             // 'auto' | 0~3 고정
      this._baseDpr = Math.min(2, window.devicePixelRatio || 1);
      this._perf = { acc: 0, frames: 0, good: 0, slow: 0, fps: 0, ms: 0 };
    }

    /** 실제로 어떤 GPU 위에서 도는지 조회 (하드웨어 가속 확인용) */
    gpuInfo() {
      if (this._gpu) return this._gpu;
      let vendor = '', renderer = '', maxTex = 0, ver = '';
      try {
        const gl = this.gl.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '';
        vendor = (dbg && gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || '';
        maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
        ver = gl.getParameter(gl.VERSION) || '';
      } catch (e) { /* 컨텍스트 접근 실패 */ }
      const software = /swiftshader|llvmpipe|software|basic render|microsoft basic|mesa offscreen/i.test(renderer + ' ' + vendor);
      this._gpu = {
        vendor, renderer, maxTex, ver, software,
        webgl2: !!(this.gl.capabilities && this.gl.capabilities.isWebGL2),
        // 이름이 가려진 경우(개인정보 보호 설정)에도 판별은 가능하도록
        masked: !renderer || /^(webkit)?webgl/i.test(renderer)
      };
      return this._gpu;
    }

    /** 사용자가 그래픽 품질을 직접 고정 ('auto' 는 프레임레이트 적응) */
    setQualityMode(mode) {
      this.qualityMode = mode;
      if (mode !== 'auto') this.setQuality(+mode);
      this._perf.good = 0;
    }

    stats() {
      const r = this.gl.info.render;
      return {
        fps: Math.round(this._perf.fps), ms: +this._perf.ms.toFixed(1),
        calls: this._lastCalls || r.calls, tris: this._lastTris || r.triangles,
        quality: this.quality, mode: this.qualityMode,
        dpr: +this.gl.getPixelRatio().toFixed(2),
        geo: this.gl.info.memory.geometries, tex: this.gl.info.memory.textures,
        particles: this.particles.length
      };
    }

    setQuality(q) {
      q = Math.max(0, Math.min(3, q));
      if (q === this.quality) return;
      this.quality = q;
      const dprScale = [0.7, 1, 1, this._baseDpr][q];
      let dpr = q === 3 ? this._baseDpr : Math.min(this._baseDpr, dprScale);
      // 실제 렌더 픽셀 수에 단계별 상한을 둔다.
      // 레티나/4K 는 devicePixelRatio 가 2~3 이라 픽셀 비율만 믿으면 같은 화면을
      // 4~9배 크기로 그리게 된다. 픽셀당 비용이 지배적이므로 가장 확실한 레버다.
      //   q0 0.9M(=1280x720) / q1 1.44M / q2 2.3M(=2048x1152) / q3 4.0M(=2560x1560)
      if (this.w && this.h) {
        const budget = [900000, 1440000, 2300000, 4000000][q];
        const px = this.w * this.h * dpr * dpr;
        if (px > budget) dpr *= Math.sqrt(budget / px);
      }
      this.gl.setPixelRatio(dpr);
      if (this.w) this.resize(this.w, this.h);
      this._composerOn = q >= 3 && !this.split;
      // 셰이더를 다시 컴파일해야 하는 설정이 실제로 바뀌었는지만 따진다.
      // 해상도만 달라졌는데 전체 머티리얼을 무효화하면 수백 개를 다시 컴파일하며
      // 화면이 통째로 멈춘다 (품질이 바뀔 때 멈춘다는 제보의 원인).
      const prev = this._shaderState || {};
      const shadows = q >= 1;
      this.gl.shadowMap.enabled = shadows;
      if (this.sun) {
        this.sun.castShadow = shadows;
        const size = q >= 3 ? 2048 : 1024;
        if (this.sun.shadow.mapSize.x !== size) {
          this.sun.shadow.mapSize.set(size, size);
          if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
        }
      }
      // 표면 디테일 셰이더 / 시언은 픽셀당 비용이 커서 저사양에서는 내려야 한다
      const surf = q >= 3 ? 2 : (q >= 2 ? 1 : 0);                                 // 2=전부 1=코트만 0=끔
      if (global.Surface && surf !== prev.surf) global.Surface.quality(surf);
      // 환경맵 샘플링도 저사양에서는 완전히 뺀다 (카트에만 걸려 있어도 비싸다)
      const envOn = q >= 2;
      if (envOn !== this._envOn) { this._envOn = envOn; this._refreshEnv(); }
      if (shadows !== prev.shadows || surf !== prev.surf || envOn !== prev.env) {
        this.scene.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });
      }
      this._shaderState = { shadows, surf, env: envOn };
      if (window.console) console.info('[render] quality level ->', q);
      if (this.onQualityChange) this.onQualityChange(q);
    }

    /**
     * 프레임레이트 적응.
     *
     *  · 떨어질 때는 빨리(0.6초 창), 올라갈 때는 천천히(1.6초 창 x 3회) 판단한다.
     *    빨리 못 내려가면 버벅이는 시간이 그대로 체감되고, 빨리 올라가면
     *    올렸다 내렸다를 반복하며 더 거슬린다.
     *  · 많이 모자라면 한 번에 여러 단계를 내린다. 20fps 인데 한 단계씩 내리면
     *    바닥에 닿을 때까지 몇 초를 버벅인다.
     *  · 목표는 60fps 다. 45fps 도 레이싱 게임에서는 끊겨 보이므로 강등한다.
     */
    _adapt(dt) {
      const p = this._perf;
      p.acc += dt; p.frames++;
      p.ms = p.ms * 0.9 + dt * 1000 * 0.1;
      const win = p.pending ? 0.6 : 1.6;
      if (p.acc < win) return;
      const fps = p.frames / p.acc;
      p.fps = fps;
      p.acc = 0; p.frames = 0;
      if (this.qualityMode !== 'auto') {
        // 고정 품질에서는 절대 단계를 건드리지 않는다. 대신 프레임이 계속
        // 모자라면 '자동'으로 바꾸는 방법을 한 번만 알려준다.
        if (fps < 34 && ++p.slow === 4 && this.onPerfWarn) this.onPerfWarn(fps);
        if (fps >= 34) p.slow = 0;
        return;
      }

      if (fps < 48 && this.quality > 0) {
        // 얼마나 모자라는지에 따라 한 번에 1~3단계 강등
        const drop = fps < 22 ? 3 : (fps < 34 ? 2 : 1);
        this.setQuality(this.quality - drop);
        p.good = 0; p.pending = true;               // 다음 판정을 짧은 창으로
      } else if (fps > 58 && this.quality < 3) {
        p.pending = false;
        if (++p.good >= 3) { this.setQuality(this.quality + 1); p.good = 0; }
      } else {
        p.good = 0; p.pending = false;
      }
    }

    /** 2인 분할 화면 on/off. 켜면 위=1P, 아래=2P 로 두 번 그린다. */
    setSplit(on) {
      this.split = !!on;
      if (on && !this.camera2) this.camera2 = new Camera3D(16 / 9);
      if (this.w) this.resize(this.w, this.h);
    }

    resize(w, h) {
      this.w = w; this.h = h;
      this.gl.setSize(w, h, false);
      // 분할 화면은 위아래로 나누므로 각 뷰의 종횡비가 두 배로 납작해진다
      const a = this.split ? w / (h / 2) : w / h;
      this.camera.cam.aspect = a;
      this.camera.cam.updateProjectionMatrix();
      if (this.camera2) { this.camera2.cam.aspect = a; this.camera2.cam.updateProjectionMatrix(); }
      if (this.composer) this.composer.setSize(w, h);
    }

    _setupComposer(theme) {
      if (!T.EffectComposer) { this._composerOn = false; return; }
      const c = new T.EffectComposer(this.gl);
      c.addPass(new T.RenderPass(this.scene, this.camera.cam));
      const cfg = theme === 'rainbow' ? [0.42, 0.6, 0.74]
        : (theme === 'bowser' ? [0.62, 0.65, 0.72] : [0.26, 0.5, 0.92]);
      const bloom = new T.UnrealBloomPass(new T.Vector2(this.w || 1280, this.h || 720), cfg[0], cfg[1], cfg[2]);
      c.addPass(bloom);
      c.addPass(new T.OutputPass());
      this.composer = c;
      this.bloom = bloom;
    }

    /* ============ 트랙 씬 구축 ============ */
    setTrack(track) {
      const sc = this.scene;
      if (this.trackGroup) { this._disposeGroup(this.trackGroup); sc.remove(this.trackGroup); }
      this.kartNodes.forEach(n => sc.remove(n.group));
      this.kartNodes.clear();
      if (global.Assets) global.Assets.clearMixers();
      this.hazardNodes.forEach(n => sc.remove(n));
      this.hazardNodes.clear();
      this.particles.clear();

      const g = new T.Group();
      this.trackGroup = g;
      sc.add(g);
      this.track = track;
      const def = track.def, theme = track.theme;
      const nodes = track.nodes;
      const half = track.width / 2;
      const kerbW = 13, shoulder = def.shoulder || 0;

      /* --- 안개 / 배경색 --- */
      const fogCol = new T.Color(def.fog);
      sc.background = null;
      if (theme === 'rainbow') sc.fog = new T.FogExp2(0x05030f, 0.00022);
      else sc.fog = new T.Fog(fogCol, theme === 'bowser' ? 1700 : 3000, theme === 'bowser' ? 6800 : 12000);

      /* --- 조명 --- */
      if (this.lights) this.lights.forEach(l => sc.remove(l));
      this.lights = [];
      const hemi = new T.HemisphereLight(
        theme === 'circuit' ? 0xcfe8ff : (theme === 'bowser' ? 0x6a2410 : 0x8aa8ff),
        theme === 'circuit' ? 0x4a7a3a : (theme === 'bowser' ? 0x3a1006 : 0x2a2050),
        // 환경맵이 하늘의 확산광을 이미 넣어주므로 반구광은 줄인다 (안 그러면 뿌옇게 뜬다)
        theme === 'circuit' ? 0.30 : (theme === 'bowser' ? 0.28 : 0.55)
      );
      sc.add(hemi); this.lights.push(hemi);
      const sun = new T.DirectionalLight(
        theme === 'circuit' ? 0xfff3dd : (theme === 'bowser' ? 0xffb078 : 0xd8e4ff),
        theme === 'circuit' ? 3.1 : (theme === 'bowser' ? 2.0 : 2.8)
      );
      sun.position.set(-380, 620, 260);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sh = sun.shadow.camera;
      sh.near = 80; sh.far = 1600;
      sh.left = -340; sh.right = 340; sh.top = 340; sh.bottom = -340;
      sun.shadow.bias = -0.0016;
      sun.shadow.normalBias = 0.7;
      sc.add(sun); sc.add(sun.target);
      this.lights.push(sun, sun.target);
      this.sun = sun;
      const amb = new T.AmbientLight(0xffffff, theme === 'circuit' ? 0.06 : (theme === 'bowser' ? 0.08 : 0.20));
      sc.add(amb); this.lights.push(amb);

      // 림 라이트: 해와 반대쪽에서 실루엣 가장자리만 밝힌다.
      // 3D 애니메이션이 캐릭터를 배경에서 떼어놓을 때 쓰는 그 빛이다. 그림자는 만들지 않는다.
      const rim = new T.DirectionalLight(
        theme === 'circuit' ? 0xbfe0ff : (theme === 'bowser' ? 0xff8a4a : 0xb0a0ff),
        theme === 'circuit' ? 1.5 : (theme === 'bowser' ? 1.25 : 1.6)
      );
      rim.position.set(420, 300, -520);
      sc.add(rim); sc.add(rim.target);
      this.lights.push(rim, rim.target);
      this.rim = rim;

      /* --- 하늘 돔 --- */
      const skyTex = global.Tex.tex(global.Tex.skyDome(theme), 1, 1);
      const sky = new T.Mesh(
        new T.SphereGeometry(8600, 40, 24),
        // depthWrite 를 끄면 하늘이 무엇도 가리지 않는다 (카메라가 돔 가까이 가도 안전)
        new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false,
                                  toneMapped: false, depthWrite: false })
      );
      sky.renderOrder = -2;
      sky.frustumCulled = false;
      g.add(sky);
      this.sky = sky;

      // 지평선 산줄기 — 지면이 하늘과 만나는 직선을 가리고 공기원근을 만든다
      const horizon = global.Models.buildHorizon(theme, track.world);
      if (horizon) g.add(horizon);

      // 환경맵(IBL). 이게 없으면 metalness/clearcoat 가 반사할 주변광이 없어서
      // 금속도 자동차 도색도 눈동자도 전부 무광 점토처럼 보인다.
      this._buildEnv(theme, skyTex);

      /* --- 지형 --- */
      if (theme === 'circuit') {
        const gt = global.Tex.get('grass', global.Tex.grass, 210, 210);
        const gm = new T.MeshStandardMaterial({ map: gt.color, normalMap: gt.normal, roughness: 1, vertexColors: true });
        const gg = new T.PlaneGeometry(16000, 16000, 120, 120);
        this._displace(gg, track, 620, 560);
        const ground = new T.Mesh(gg, gm);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(track.world / 2, -0.6, track.world / 2);
        ground.receiveShadow = true;
        g.add(ground);
      } else if (theme === 'bowser') {
        const lt = global.Tex.get('lavaground', global.Tex.lavaField, 92, 92);
        const lm = new T.MeshStandardMaterial({
          map: lt.color, emissive: new T.Color('#ff5a10'), emissiveMap: lt.emissive,
          emissiveIntensity: 1.35, roughness: 0.8, vertexColors: true
        });
        const bg2 = new T.PlaneGeometry(16000, 16000, 110, 110);
        this._displace(bg2, track, 520, 640, 0.55);
        const ground = new T.Mesh(bg2, lm);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(track.world / 2, -2.2, track.world / 2);
        g.add(ground);
        this.lavaMat = lm;
        this.lavaTex = lt;
      }

      /* --- 갓길 --- */
      if (shoulder > 0) {
        const sMat = theme === 'bowser'
          ? new T.MeshStandardMaterial({ color: new T.Color('#2a231f'), roughness: 0.95 })
          : new T.MeshStandardMaterial({
              color: new T.Color('#241d47'), roughness: 0.35, metalness: 0.4,
              emissive: new T.Color('#2a1f5a'), emissiveIntensity: 0.5
            });
        [[-1], [1]].forEach(s => {
          const a = s[0] * (half + (theme === 'rainbow' ? 0 : kerbW));
          const b = s[0] * (half + (theme === 'rainbow' ? 0 : kerbW) + shoulder);
          const m = new T.Mesh(ribbon(nodes, a, b, 0.35, 200, true), sMat);
          m.receiveShadow = true;
          g.add(m);
        });
      }

      /* --- 커브 둔턱 --- */
      if (theme !== 'rainbow') {
        const kc = theme === 'bowser' ? ['#efe6d4', '#241d1a'] : ['#f2f2f2', '#e02a2a'];
        const kt = global.Tex.tex(global.Tex.kerb(kc[0], kc[1]), 1, 1);
        const kMat = new T.MeshStandardMaterial({ map: kt, roughness: 0.6 });
        [-1, 1].forEach(s => {
          const a = s * half, b = s * (half + kerbW);
          const m = new T.Mesh(ribbon(nodes, a, b, 0.95, 46, true), kMat);
          m.receiveShadow = true; m.castShadow = true;
          g.add(m);
          // 둔턱 옆면 (두께감)
          const side = new T.Mesh(ribbon(nodes, b, b, 0.95, 46, true), kMat);
          g.add(side);
        });
      }

      /* --- 노면 --- */
      let roadMat;
      if (theme === 'rainbow') {
        const rt = global.Tex.get('rainbow', global.Tex.rainbowRoad, 34, 1);
        roadMat = new T.MeshPhysicalMaterial({
          map: rt.color, normalMap: rt.normal, vertexColors: true,
          roughness: 0.12, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06,
          emissive: new T.Color('#ffffff'), emissiveIntensity: 0.07, emissiveMap: rt.color
        });
      } else if (theme === 'bowser') {
        const st = global.Tex.get('stone', global.Tex.stone, 34, 2);
        roadMat = new T.MeshStandardMaterial({
          map: st.color, normalMap: st.normal, roughness: 0.92,
          emissive: new T.Color('#ff5a10'), emissiveIntensity: 0.05
        });
      } else {
        const at = global.Tex.get('asphalt', global.Tex.asphalt, 46, 2);
        roadMat = new T.MeshStandardMaterial({ map: at.color, normalMap: at.normal, roughness: 0.86 });
      }
      const road = new T.Mesh(
        ribbon(nodes, -half, half, 1.0, theme === 'rainbow' ? 320 : 260, true, theme === 'rainbow' ? 3 : 0),
        roadMat);
      road.receiveShadow = true;
      g.add(road);

      /* --- 프리즘 로드 네온 레일 --- */
      if (theme === 'rainbow') {
        const railMat = new T.MeshBasicMaterial({ color: new T.Color('#5fd0ff'), fog: false });
        [-1, 1].forEach(s => {
          const pts = nodes.filter((_, i) => i % 3 === 0).map(nd =>
            new T.Vector3(nd.x + nd.nx * s * (half + shoulder), 3.4, nd.y + nd.ny * s * (half + shoulder)));
          const curve = new T.CatmullRomCurve3(pts, true);
          const tube = new T.Mesh(new T.TubeGeometry(curve, pts.length, 1.25, 6, true), railMat);
          g.add(tube);
        });
        // 도로 아래로 흐르는 빛 띠
        const under = new T.Mesh(
          ribbon(nodes, -half - shoulder, half + shoulder, -14, 300, true, 3),
          new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.18, side: T.DoubleSide })
        );
        g.add(under);
      }

      /* --- 부스터 발판 --- */
      const bTex = global.Tex.tex(global.Tex.boostPad(
        theme === 'rainbow' ? '#1a1a2a' : (theme === 'bowser' ? '#2a1208' : '#2f2f36'),
        theme === 'rainbow' ? '#f5ff3a' : (theme === 'bowser' ? '#ff7a1e' : '#f5a623')), 1, 1);
      const bMat = new T.MeshStandardMaterial({
        map: bTex, emissive: new T.Color('#ffffff'), emissiveMap: bTex,
        emissiveIntensity: 1.25, roughness: 0.5, transparent: true,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      });
      this.boostMat = bMat;
      for (const bi of track.boostSpots) {
        const nd = track.nodes[bi];
        const pad = new T.Mesh(new T.PlaneGeometry(track.width * 0.66, 84), bMat);
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = -Math.atan2(nd.dy, nd.dx) + Math.PI / 2;
        pad.position.set(nd.x, 1.5, nd.y);
        g.add(pad);
      }

      /* --- 점프대 --- */
      for (const rp of (track.ramps || [])) {
        const rmp = global.Models.optimize(global.Models.buildRamp(theme, track.width));
        rmp.position.set(rp.x, 0, rp.y);
        rmp.rotation.y = -rp.angle;
        g.add(rmp);
      }

      /* --- 스타트 라인 --- */
      const sgTex = global.Tex.tex(global.Tex.startGrid(), 5, 1);
      const nd0 = nodes[0];
      const line = new T.Mesh(new T.PlaneGeometry(track.width, 34),
        new T.MeshStandardMaterial({ map: sgTex, roughness: 0.8 }));
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = -Math.atan2(nd0.dy, nd0.dx) + Math.PI / 2;
      line.position.set(nd0.x, 1.4, nd0.y);
      line.receiveShadow = true;
      g.add(line);

      /* --- 장식물 (InstancedMesh) --- */
      const byType = {};
      for (const d of track.decor) (byType[d.type] = byType[d.type] || []).push(d);
      this.propAnim = [];
      Object.keys(byType).forEach(type => {
        const tpl = global.Models.buildProp(type);
        const mats = byType[type].map(d => {
          const m = new T.Matrix4();
          const rotY = Math.atan2(2500 - d.y, 2500 - d.x);
          m.compose(
            new T.Vector3(d.x, d.z || 0, d.y),
            new T.Quaternion().setFromEuler(new T.Euler(0, rotY + Math.random() * 0.6, 0)),
            new T.Vector3(d.scale, d.scale, d.scale)
          );
          return m;
        });
        const ims = instantiate(tpl, mats, g, type !== 'staroid' && type !== 'lavafall');
        if (type === 'lavafall' && tpl.userData.scroll) this.propAnim.push(tpl.userData.scroll);
        if (type === 'staroid') this.staroids = { meshes: ims, mats, tpl };
      });

      /* --- 아이템 박스 --- */
      const boxTpl = global.Models.buildItem('itembox');
      this.boxTpl = boxTpl;
      this.boxMeshes = instantiate(boxTpl, track.itemBoxes.map(b => {
        const m = new T.Matrix4();
        m.setPosition(b.x, 26, b.y);
        return m;
      }), g, false);
      this._boxLeaves = [];
      boxTpl.updateMatrixWorld(true);
      boxTpl.traverse(o => { if (o.isMesh) this._boxLeaves.push(o.matrixWorld.clone()); });

      /* --- 스톰퍼 --- */
      // 스톰퍼는 통째로 움직이므로 내부 메시는 전부 병합해도 된다 (11 -> 2~3콜)
      this.thwompNodes = track.thwomps.map(t => {
        const n = global.Models.optimize(global.Models.buildProp('thwomp'));
        n.position.set(t.x, t.h + 40, t.y);
        g.add(n);
        return n;
      });

      /* --- 도로를 가로지르는 게이트 --- */
      (track.gantrySpots || []).forEach((ni, idx) => {
        const nd = track.nodes[ni];
        const gt = global.Models.optimize(global.Models.buildGantry(theme, track.width, idx === 0 ? 'start' : 'mid'));
        gt.position.set(nd.x, 0, nd.y);
        gt.rotation.y = -Math.atan2(nd.dy, nd.dx);
        g.add(gt);
      });

      /* --- 배경 랜드마크 --- */
      const lm = global.Models.optimize(global.Models.buildLandmark(theme));
      if (theme === 'rainbow') lm.position.set(-2200, 1300, -1700);
      else if (theme === 'bowser') lm.position.set(2500, 30, -2700);
      else lm.position.set(2500, 0, -2600);
      lm.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      g.add(lm);
      this.landmark = lm;

      /* --- 테마별 대형 배경물 --- */
      this.backdrop = [];
      for (const it of global.Models.buildBackdrop(theme, track.world)) {
        // 배경물은 머티리얼 단위로 병합해 드로우콜을 줄인다 (그림자도 안 만든다)
        global.Models.optimize(it.obj);
        it.obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        it.obj.position.set(it.x, it.y, it.z);
        it.obj.rotation.y = it.rot;
        it.obj.scale.setScalar(it.scale);
        it.baseY = it.y;
        it.phase = Math.random() * 6.28;
        g.add(it.obj);
        if (it.anim) this.backdrop.push(it);
      }

      // 환경맵은 씬 전체에 걸리므로 트랙/지형/배경까지 하늘빛을 그대로 받아 하얗게 뜬다.
      // 반사가 의미 있는 건 카트와 캐릭터뿐이므로 배경 쪽은 세기를 낮춘다.
      g.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (m.envMapIntensity === undefined || m.__envSet) continue;
          m.envMapIntensity = m.metalness > 0.5 ? 0.85 : 0.3;
          m.__envSet = true;
        }
      });

      this._setupComposer(theme);
      this.theme = theme;

      // 현재 품질 단계를 실제로 적용한다. setQuality 는 값이 같으면 조기 반환하므로
      // 생성자에서 정한 시작 단계가 반영되지 않은 채로 남는다 (해상도·그림자·
      // 환경맵·시언이 전부 최고 설정으로 켜져 있게 된다).
      const q0 = this.quality;
      this.quality = -1;
      this.setQuality(q0);
    }

    /**
     * 지면에 기복을 준다. 트랙 주변 flatR 안쪽은 평평하게 두고,
     * 멀어질수록 완만한 언덕이 솟는다 (2옥타브 값 노이즈).
     */
    _displace(geometry, track, maxH, flatR, rough) {
      const pos = geometry.attributes.position;
      const c = track.world / 2;
      const bound = track.world + 1400;
      const hash = (x, y) => {
        const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return n - Math.floor(n);
      };
      const vnoise = (x, y, cell) => {
        const gx = x / cell, gy = y / cell;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const tx = gx - x0, ty = gy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = hash(x0, y0), b = hash(x0 + 1, y0), d = hash(x0, y0 + 1), e = hash(x0 + 1, y0 + 1);
        return (a * (1 - sx) + b * sx) * (1 - sy) + (d * (1 - sx) + e * sx) * sy;
      };
      for (let i = 0; i < pos.count; i++) {
        const wx = c + pos.getX(i), wz = c + pos.getY(i);
        let d;
        if (wx < -bound || wx > bound || wz < -bound || wz > bound) d = 99999;
        else d = track.project(wx, wz).dist;
        let t = (d - flatR) / 2400;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        t = t * t * (3 - 2 * t);
        const n = vnoise(wx, wz, 900) * 0.65 + vnoise(wx, wz, 320) * 0.35;
        pos.setZ(i, t * maxH * (0.25 + 0.75 * n) * (rough === undefined ? 1 : rough) +
                    t * (rough ? vnoise(wx, wz, 140) * 90 : 0));
      }
      // 저주파 색 얼룩. 타일 텍스처를 넓은 면에 깔면 같은 무늬가 줄지어 보이는데,
      // 텍스처와 주기가 다른 큰 반점을 곱해주면 그 규칙성이 깨진다.
      // 동시에 풀밭에 밝고 어두운 기복이 생겨 원경이 밋밋하지 않다.
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const wx = c + pos.getX(i), wz = c + pos.getY(i);
        const m = vnoise(wx, wz, 1700) * 0.46 + vnoise(wx, wz, 640) * 0.27
                + vnoise(wx, wz, 300) * 0.17 + vnoise(wx, wz, 150) * 0.10;
        const v = 0.76 + m * 0.48;                       // 0.76 ~ 1.24
        col[i * 3] = v * 0.99; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.95;
      }
      geometry.setAttribute('color', new T.BufferAttribute(col, 3));
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      return geometry;
    }

    _disposeGroup(grp) {
      grp.traverse(o => {
        if (o.isMesh || o.isPoints) {
          if (o.geometry && !o.geometry.__shared) o.geometry.dispose();
        }
      });
    }

    /* ============ 카트 ============ */
    addKart(kart) {
      const model = global.Models.buildKart(kart.combo);
      // 레이스 컨텍스트에서도 외부 카트가 반드시 적용되도록 한 번 더 보장한다.
      // 로비 프리뷰와 레이스가 서로 다른 WebGL 컨텍스트를 사용해도 모델 교체가 유지된다.
      if (global.Assets && !model.userData.externalKart) {
        const externalKart = global.Assets.prop('kart');
        const driver = model.userData.driver;
        const body = model.userData.body;
        if (externalKart && driver && body) {
          body.remove(driver);
          model.add(driver);
          driver.position.set(-2.2, 13.2, 0);
          body.visible = false;
          externalKart.userData.external = true;
          model.add(externalKart);
          model.userData.externalKart = externalKart;
        }
      }
      const grp = new T.Group();
      grp.add(model);
      // 원경용 저폴리 모델. 지연 생성해서 로딩을 늘리지 않는다 (처음 멀어질 때 만든다).
      this.scene.add(grp);
      // 접지 그림자 보조 (블롭)
      const blob = new T.Mesh(
        new T.PlaneGeometry(64, 64),
        new T.MeshBasicMaterial({
          map: global.Tex.tex(global.Tex.shadowBlob()), transparent: true,
          depthWrite: false, opacity: 0.55, fog: false
        })
      );
      blob.rotation.x = -Math.PI / 2;
      this.scene.add(blob);
      this._applyEnv(model);
      const node = { group: grp, model, lod: null, lodOn: false, blob, kart, aura: null };
      this.kartNodes.set(kart, node);
      kart.model3d = node;
      return node;
    }

    _syncKart(node, dt) {
      const k = node.kart;
      const g = node.group;
      const camD = Math.hypot(k.x - this.camera.x, k.y - this.camera.y);

      /* ---- LOD: 멀어지면 저폴리 통합 모델로 갈아끼운다 ----
       * 근경 카트는 44 드로우콜 / 21,500 삼각형이다. 화면에서 몇 픽셀인
       * 원경 카트까지 그렇게 그릴 이유가 없다. 히스테리시스를 둬서
       * 경계에서 깜빡이지 않게 한다. */
      // 저사양에서는 내 카트만 고품질로 두고 나머지는 거리와 무관하게 LOD 로 간다.
      // 플레이어가 실제로 들여다보는 건 자기 카트뿐이다.
      const wantLod = (this.quality <= 1 && !k.isPlayer) || (this.quality < 3
        ? camD > (node.lodOn ? 300 : 340)
        : camD > (node.lodOn ? 480 : 540));
      if (wantLod && !node.lod) {
        try { node.lod = global.Models.buildKartLOD(k.combo); this._applyEnv(node.lod);
              g.add(node.lod); node.lod.visible = false; }
        catch (e) { node.lod = null; }
      }
      if (node.lod && wantLod !== node.lodOn) {
        node.lodOn = wantLod;
        node.model.visible = !wantLod;
        node.lod.visible = wantLod;
        node._cast = null;                 // 그림자 플래그를 새 모델에 다시 적용
      }
      const m = (node.lodOn && node.lod) ? node.lod : node.model;

      // 멀리 있는 카트는 그림자 캐스팅을 끈다 (섀도 패스 드로우콜 절감)
      const cast = camD < 620;
      if (node._cast !== cast) {
        node._cast = cast;
        m.traverse(o => { if (o.isMesh) o.castShadow = cast; });
      }
      g.position.set(k.x, k.z, k.y);
      g.rotation.y = -k.angle;
      const sc = k.scale;
      g.scale.setScalar(sc);

      // 스핀아웃 / 넉백 회전
      m.rotation.y = k.state === 'SPINOUT' ? k.spinAngle : (k.state === 'KNOCKBACK' ? k.spinAngle : 0);
      m.rotation.z = k.state === 'KNOCKBACK' ? Math.sin(k.spinAngle * 0.7) * 0.6 : 0;
      // 차체 피치/롤/히브는 Rig 의 서스펜션이 담당한다. 여기서는 홉만.
      const hop = k.hopT > 0 ? Math.sin((0.26 - k.hopT) / 0.26 * Math.PI) * 6 : 0;
      m.position.y = hop;
      if (!m.userData.rig) {
        const lean = k.drifting ? k.driftDir * 0.16 : -(k.input.steer || 0) * 0.05;
        m.rotation.x += ((k.airborne ? this._airPitch(k) : lean) - m.rotation.x) * Math.min(1, dt * 8);
      }

      // LOD 모델은 관절이 통째로 병합돼 있어 리그·바퀴를 돌려봐야 화면에
      // 반영되지 않는다. 계산 자체를 건너뛴다 (원경 카트의 CPU 비용 0).
      if (!node.lodOn) {
        if (global.Assets && m.userData.driver && m.userData.driver.userData.external) {
          global.Assets.setState(m.userData.driver, k);
        }
        // 드라이버 착좌 리그 (팔 IK · 상체 롤 · 머리) — 멀리 있는 카트는 생략
        if (global.Rig && m.userData.rig && camD < 700) global.Rig.update(m, k, dt, this.time);

        // 바퀴 회전 / 조향
        // 프레임당 회전각이 커지면 스포크가 역회전하는 것처럼 보인다(웨건휠).
        // 고속에서는 각속도를 부드럽게 포화시켜 잔상 대신 흐름으로 읽히게 한다.
        const raw = k.speed * dt * 0.14;
        const spin = raw < 0.34 ? raw : 0.34 + (raw - 0.34) * 0.18;
        for (const w of m.userData.wheels) w.rotation.z -= spin;
        const steerAng = (k.input.steer || 0) * 0.4 + (k.drifting ? k.driftDir * 0.25 : 0);
        for (const w of m.userData.frontWheels) w.rotation.y = -steerAng;
        if (m.userData.steer && !m.userData.rig) m.userData.steer.rotation.z = 0.55 + steerAng * 0.9;
      }

      // 무적 점멸 / 스타 오라
      const blink = k.invulnTimer > 0 && k.state !== 'RESPAWN' && Math.floor(this.time * 14) % 2 === 0;
      m.visible = !blink;
      if (k.starTimer > 0) {
        if (!node.aura) {
          node.aura = new T.PointLight(0xffffff, 0, 220);
          this.scene.add(node.aura);
        }
        const hue = (this.time * 1.6) % 1;
        node.aura.color.setHSL(hue, 1, 0.6);
        node.aura.intensity = 6;
        node.aura.position.set(k.x, k.z + 20, k.y);
        m.traverse(o => {
          if (o.isMesh && o.material.emissive) {
            o.material.emissive.setHSL(hue, 1, 0.35);
          }
        });
      } else if (node.aura) {
        this.scene.remove(node.aura);
        node.aura.dispose();
        node.aura = null;
        m.traverse(o => { if (o.isMesh && o.material.emissive && !o.material.__keepEmissive) o.material.emissive.setHex(0x000000); });
      }

      // 접지 그림자
      node.blob.position.set(k.x, 1.8, k.y);
      const lift = Math.min(1, k.z / 220);
      node.blob.scale.setScalar(sc * (1 - lift * 0.45));
      node.blob.material.opacity = 0.55 * (1 - lift) * (k.state === 'RESPAWN' ? 0.3 : 1);
      node.blob.visible = k.z < 320;
    }

    /* ============ 환경맵 (IBL) ============ */
    /**
     * 환경맵을 '반사가 의미 있는 오브젝트에만' 건다.
     *
     * scene.environment 는 씬의 모든 MeshStandardMaterial 에 걸린다. 그러면
     * 화면 대부분을 덮는 16000 짜리 지형 평면까지 픽셀마다 큐브맵을 샘플링한다.
     * 측정해보니 이것 하나가 프레임 시간의 82% 였다 (768ms -> 141ms).
     * 반사가 실제로 보이는 건 카트 도색·크롬·눈동자뿐이므로, scene.environment
     * 대신 해당 머티리얼에만 envMap 을 직접 꽂는다.
     */
    _applyEnv(root) {
      const tex = this._envOn && this._envRT ? this._envRT.texture : null;
      root.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) {
          if (m.envMap === tex) continue;
          m.envMap = tex;
          m.needsUpdate = true;                 // envMap 유무는 셰이더가 바뀐다
        }
      });
    }

    /** 품질 단계가 바뀌면 이미 만들어진 카트들에 다시 적용한다 */
    _refreshEnv() {
      this.kartNodes.forEach(n => {
        this._applyEnv(n.model);
        if (n.lod) this._applyEnv(n.lod);
      });
    }

    _buildEnv(theme, skyTex) {
      if (this._envRT) { this._envRT.dispose(); this._envRT = null; }
      this._envRT = global.Surface ? global.Surface.envMap(this.gl, theme, skyTex) : null;
      // 씬 전체에는 걸지 않는다. addKart 에서 카트에만 꽂는다.
      this.scene.environment = null;
      this._envOn = this.quality >= 2;

      // 실제 HDRI 가 있으면 그쪽을 우선한다 (비동기, 실패해도 무시).
      // manifest 에 지정이 없으면 관례 경로 assets/env/env.hdr 을 한 번 찔러본다.
      // 결과는 URL 단위로 캐시되므로 없는 파일도 세션당 404 한 번으로 끝난다.
      if (!global.Surface) return;
      const base = (global.Assets && global.Assets.base) || 'assets/';
      const man = global.Assets && global.Assets.manifest;
      const envDef = man && man.env;
      const file = envDef && (typeof envDef === 'string' ? envDef : (envDef[theme] || envDef.default));
      const url = file ? base + file : base + 'env/env.hdr';
      const want = theme;
      global.Surface.hdriMap(this.gl, url).then(rt => {
        if (!rt || this.theme !== want) return;
        if (this._envRT && this._envRT !== rt) this._envRT.dispose();
        this._envRT = rt;
        this._refreshEnv();
      });
    }

    /* ============ 투사체 ============ */
    _syncHazards(world, dt) {
      const seen = new Set();
      for (const h of world.hazards) {
        if (h.dead) continue;
        seen.add(h);
        let n = this.hazardNodes.get(h);
        if (!n) {
          const type = h.type === 'coin' ? 'coin' : h.type;
          if (!this._itemTpl[type]) this._itemTpl[type] = global.Models.buildItem(type);
          n = this._itemTpl[type].clone(true);
          n.scale.setScalar(h.type === 'banana' ? 1.15 : 1);
          this.scene.add(n);
          this.hazardNodes.set(h, n);
        }
        n.position.set(h.x, (h.z || 8) + 8, h.y);
        // 프레임 수가 아니라 시간에 비례해 돌린다 (프레임 드랍 때 속도가 변하지 않게)
        if (h.spin) n.rotation.y += dt * 7.2;
        else if (h.type === 'coin') n.rotation.y += dt * 4.6;
        else n.rotation.y = -Math.atan2(h.vy || 0, h.vx || 1);
        if (h.type === 'bobomb') {
          const p = 1 - Math.max(0, h.life) / 2.2;
          n.scale.setScalar(1 + Math.sin(this.time * (10 + p * 40)) * 0.08 * p);
        }
      }
      this.hazardNodes.forEach((n, h) => {
        if (!seen.has(h)) { this.scene.remove(n); this.hazardNodes.delete(h); }
      });
    }

    /**
     * 공중 자세: 올라갈 때 앞이 들리고 내려올 때 앞이 숙는다.
     * 뜬 내내 같은 각도로 굳어 있으면 발사체처럼 보인다.
     */
    _airPitch(k) {
      return Math.max(-0.34, Math.min(0.30, -(k.vz || 0) / 900));
    }

    /**
     * 고스트 카트.
     *
     * 물리 객체가 아니라 기록 재생기라서 world.karts 에 넣지 않는다. 대신
     * 카트와 똑같은 노드를 하나 만들고 머티리얼만 반투명으로 바꿔 쓴다.
     * 반투명이라 그림자는 만들지 않는다 - 고스트 그림자가 바닥에 찍히면
     * 실체가 있는 것처럼 보여서 헷갈린다.
     */
    _syncGhost(world, dt) {
      const g = world.ghost;
      if (!g) {
        if (this._ghostNode) { this._ghostNode.group.visible = false; this._ghostNode.blob.visible = false; }
        return;
      }
      if (!this._ghostNode) {
        const node = this.addKart(g);
        this.kartNodes.delete(g);            // 일반 카트 루프가 건드리지 않게 뺀다
        node.model.traverse(o => {
          if (!o.isMesh || !o.material) return;
          o.castShadow = false; o.receiveShadow = false;
          const list = Array.isArray(o.material) ? o.material : [o.material];
          o.material = list.map(m => {
            const c = m.clone();
            c.transparent = true;
            c.opacity = 0.34;
            c.depthWrite = false;            // 반투명끼리 앞뒤로 서로를 지우지 않게
            c.color.lerp(new T.Color('#9fe8ff'), 0.45);
            if (c.emissive) c.emissive.setHex(0x000000);
            return c;
          });
          if (o.material.length === 1) o.material = o.material[0];
        });
        node.blob.material = node.blob.material.clone();
        node.blob.material.opacity = 0.16;
        this._ghostNode = node;
      }
      const node = this._ghostNode;
      node.group.visible = true;
      // LOD 로 갈아끼우면 불투명 모델이 튀어나온다. 고스트는 항상 근경 모델.
      node.lodOn = false;
      if (node.lod) node.lod.visible = false;
      node.model.visible = true;
      this._syncGhostTransform(node, g, dt);
    }

    _syncGhostTransform(node, k, dt) {
      const m = node.model;
      node.group.position.set(k.x, k.z, k.y);
      node.group.rotation.y = -k.angle;
      node.group.scale.setScalar(k.scale || 1);
      m.rotation.y = 0; m.rotation.z = 0; m.position.y = 0;
      if (!m.userData.rig) {
        const lean = k.drifting ? k.driftDir * 0.16 : -(k.input.steer || 0) * 0.05;
        m.rotation.x += (lean - m.rotation.x) * Math.min(1, dt * 8);
      }
      if (global.Assets && m.userData.driver && m.userData.driver.userData.external) {
        global.Assets.setState(m.userData.driver, k);
      }
      if (global.Rig && m.userData.rig) global.Rig.update(m, k, dt, this.time);
      const raw = k.speed * dt * 0.14;
      const spin = raw < 0.34 ? raw : 0.34 + (raw - 0.34) * 0.18;
      for (const w of m.userData.wheels) w.rotation.z -= spin;
      const steerAng = (k.input.steer || 0) * 0.4 + (k.drifting ? k.driftDir * 0.25 : 0);
      for (const w of m.userData.frontWheels) w.rotation.y = -steerAng;
      node.blob.position.set(k.x, 1.8, k.y);
      node.blob.visible = k.z < 320;
    }

    /* ============ 프레임 ============ */
    render(world, dt, rawDt) {
      this.time += dt;
      // 성능 계측에는 반드시 클램프 전의 실제 경과 시간을 쓴다.
      // 메인 루프가 dt 를 0.05 로 자르기 때문에 그 값으로 재면 실제로 8fps 여도
      // 20fps 로 읽힌다 (F3 표시도, 자동 강등 판정도 전부 거짓이 된다).
      if (dt > 0) this._adapt(rawDt > 0 ? rawDt : dt);
      const cam = this.camera;

      // 카트 동기화
      for (const k of world.karts) {
        let node = this.kartNodes.get(k);
        if (!node) node = this.addKart(k);
        this._syncKart(node, dt || 0.016);
      }
      this._syncHazards(world, dt || 0.016);
      this._syncGhost(world, dt || 0.016);

      // 아이템 박스 (리스폰 중이면 축소).
      // 타임어택은 아이템이 나오지 않으므로 상자 자체를 숨긴다.
      // 먹히지도 않는 상자가 코스에 떠 있으면 고장난 것처럼 보인다.
      if (this.boxMeshes && world.timeAttack) {
        for (const im of this.boxMeshes) im.visible = false;
      } else if (this.boxMeshes) {
        for (const im of this.boxMeshes) im.visible = true;
        const boxes = this.track.itemBoxes;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const s = b.respawn <= 0 ? 1 : Math.max(0.001, 1 - b.respawn / 6.5) * 0.25;
          _eul.set(this.time * 0.6, this.time * 1.1 + i, 0);
          _q.setFromEuler(_eul);
          _v3a.set(b.x, 26 + Math.sin(this.time * 2 + i) * 4, b.y);
          _v3b.setScalar(s);
          for (let li = 0; li < this.boxMeshes.length; li++) {
            _m4.compose(_v3a, _q, _v3b).multiply(this._boxLeaves[li]);
            this.boxMeshes[li].setMatrixAt(i, _m4);
          }
        }
        this.boxMeshes.forEach(im => { im.instanceMatrix.needsUpdate = true; });
      }

      // 스톰퍼
      if (this.thwompNodes) {
        this.track.thwomps.forEach((t, i) => {
          const n = this.thwompNodes[i];
          n.position.y = t.h + 34;
          // 매 프레임 난수는 지직거림으로 보인다. 감쇠하는 진동으로 떨게 한다
          n.rotation.z = t.shake * Math.sin(this.time * 46) * 0.09;
          n.rotation.x = t.shake * Math.sin(this.time * 37 + 1.1) * 0.06;
        });
      }

      // 배경물 부유 / 회전
      for (const it of (this.backdrop || [])) {
        if (it.anim === 'float') it.obj.position.y = it.baseY + Math.sin(this.time * 0.4 + it.phase) * 26;
        else if (it.anim === 'spin') it.obj.rotation.y += dt * 0.06;
      }

      // 용암 / 폭포 스크롤
      if (this.lavaTex) {
        this.lavaTex.color.offset.y = this.time * 0.014;
        this.lavaTex.emissive.offset.y = this.time * 0.014;
      }
      for (const m of (this.propAnim || [])) {
        if (m.map) m.map.offset.y = -this.time * 0.5;
        if (m.emissiveMap) m.emissiveMap.offset.y = -this.time * 0.5;
      }
      if (this.boostMat && this.boostMat.map) this.boostMat.map.offset.x = -this.time * 1.4;
      if (this.staroids) {
        // 회전하는 별 소행성. 인스턴스 x 메시 이중 루프라 여기서 new 를 쓰면
        // 프레임마다 수십~수백 개의 Matrix4 가 쓰레기가 된다.
        const mats = this.staroids.mats, meshes = this.staroids.meshes;
        for (let j = 0; j < meshes.length; j++) {
          for (let i = 0; i < mats.length; i++) {
            _m4b.makeRotationY(this.time * 0.6 + i);
            _m4.copy(mats[i]).multiply(_m4b);
            meshes[j].setMatrixAt(i, _m4);
          }
          meshes[j].instanceMatrix.needsUpdate = true;
        }
      }

      // 외부 에셋 애니메이션
      if (global.Assets && dt > 0) global.Assets.update(dt);

      // 파티클
      this.particles.update(dt);

      // 카메라 & 그림자 추종
      const me = world.player;
      if (me && this.sun) {
        this.sun.position.set(me.x - 380, 620, me.y + 260);
        this.sun.target.position.set(me.x, 0, me.y);
        this.sun.target.updateMatrixWorld();
      }
      if (this.sky && me) this.sky.position.set(cam.x, 0, cam.y);

      // 렌더
      this.gl.info.autoReset = false;
      this.gl.info.reset();
      if (this.split && this.camera2) {
        // 분할 화면에서는 컴포저(블룸)를 쓰지 않는다. 컴포저는 화면 전체를
        // 하나의 타깃으로 처리해서 뷰포트를 둘로 나눌 수 없고, 어차피 장면을
        // 두 번 그리므로 비용도 두 배다.
        const gl = this.gl, W = this.w, H = this.h, h2 = H / 2;
        gl.setScissorTest(true);
        gl.setViewport(0, h2, W, h2); gl.setScissor(0, h2, W, h2);   // 위 = 1P
        gl.render(this.scene, cam.cam);
        gl.setViewport(0, 0, W, h2); gl.setScissor(0, 0, W, h2);     // 아래 = 2P
        gl.render(this.scene, this.camera2.cam);
        gl.setScissorTest(false);
        gl.setViewport(0, 0, W, H);
      } else if (this.composer && this._composerOn) {
        this.composer.render();
      } else {
        this.gl.render(this.scene, cam.cam);
      }
      this._lastCalls = this.gl.info.render.calls;
      this._lastTris = this.gl.info.render.triangles;
    }

    /* 파티클 API (기존 코드 호환) */
    spawn(x, y, z, vx, vy, vz, life, color, size, kind) {
      this.particles.spawn(x, y, z, vx, vy, vz, life, color, size, kind);
    }
    updateParticles() { /* render() 내부에서 처리 */ }
  }

  global.RenderSystem = { Renderer, Camera3D };
})(window);
