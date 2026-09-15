/* =============================================================
 * models.js - 절차적 3D 모델 (three.js)
 *   외부 모델 파일 없이 지오메트리 조합으로 캐릭터/카트/아이템/오브젝트를 만든다.
 *   좌표: three.js Y-up.  카트 모델은 +X 를 정면으로 삼는다.
 *   스케일: 카트 전장 ≈ 46, 트랙 폭 ≈ 130~160 world unit
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;

  /* ---------------- 공용 헬퍼 ---------------- */
  const geoCache = {};

  /**
   * 원경용 저폴리 모드.
   *
   * 멀리 있는 카트는 화면에서 몇 픽셀밖에 안 되는데 근경과 똑같이
   * 21,500 삼각형 / 44 드로우콜을 쓴다. LOD 가 켜지면 모든 회전체·구·원통의
   * 분할 수를 절반으로 줄이고, 관절 경계를 없애 통째로 병합한다.
   * geoCache 키에 접두사가 붙으므로 근경 지오메트리와 섞이지 않는다.
   */
  let LOD = 0;
  const seg = (n) => (LOD ? Math.max(4, Math.round(n * 0.45)) : n);
  const gkey = (k) => (LOD ? 'L' + k : k);
  function geo(key, factory) {
    if (!geoCache[key]) geoCache[key] = factory();
    return geoCache[key];
  }
  function mat(color, o) {
    o = o || {};
    const p = {
      color: new T.Color(color),
      roughness: o.rough === undefined ? 0.6 : o.rough,
      metalness: o.metal === undefined ? 0.05 : o.metal,
      flatShading: !!o.flat,
      emissive: new T.Color(o.emissive || 0x000000),
      emissiveIntensity: o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity,
      transparent: !!o.transparent,
      opacity: o.opacity === undefined ? 1 : o.opacity,
      side: o.side || T.FrontSide,
      // 환경맵 반사 세기. 씬에 environment 가 걸려야 의미가 있다.
      envMapIntensity: o.envI === undefined ? 1 : o.envI
    };
    // sheen 은 벨벳/플러시 특유의 가장자리 광택을 만든다 (CG 애니메이션 캐릭터 질감)
    if (o.sheen) {
      p.sheen = o.sheen;
      p.sheenRoughness = o.sheenRough === undefined ? 0.65 : o.sheenRough;
      p.sheenColor = new T.Color(o.sheenColor || '#ffffff');
      const sm = new T.MeshPhysicalMaterial(p);
      // 저사양에서 끌 수 있도록 등록해 둔다
      if (global.Surface) global.Surface.register(sm);
      return sm;
    }
    if (o.coat) {
      p.clearcoat = o.coat;
      p.clearcoatRoughness = o.coatRough === undefined ? 0.12 : o.coatRough;
      return new T.MeshPhysicalMaterial(p);
    }
    return new T.MeshStandardMaterial(p);
  }
  function mesh(g, m, x, y, z) {
    const s = new T.Mesh(g, m);
    s.position.set(x || 0, y || 0, z || 0);
    s.castShadow = true; s.receiveShadow = true;
    return s;
  }
  function sphere(r, m, x, y, z, s0) {
    const q = seg(s0 || 20);
    return mesh(geo(gkey('sph' + q + '_' + r.toFixed(2)),
      () => new T.SphereGeometry(r, q, Math.max(3, Math.round(q * 0.72)))), m, x, y, z);
  }
  function box(w, h, d, m, x, y, z) {
    return mesh(geo('box' + [w, h, d].join('_'), () => new T.BoxGeometry(w, h, d)), m, x, y, z);
  }
  function cyl(rt, rb, h, m, x, y, z, s0) {
    const q = seg(s0 || 16);
    return mesh(geo(gkey('cyl' + [rt, rb, h, q].join('_')), () => new T.CylinderGeometry(rt, rb, h, q)), m, x, y, z);
  }
  function cone(r, h, m, x, y, z, s0) {
    const q = seg(s0 || 12);
    return mesh(geo(gkey('cone' + [r, h, q].join('_')), () => new T.ConeGeometry(r, h, q)), m, x, y, z);
  }
  function capsule(r, len, m, x, y, z) {
    return mesh(geo(gkey('cap' + r + '_' + len),
      () => new T.CapsuleGeometry(r, len, seg(6), seg(14))), m, x, y, z);
  }
  function torus(r, tube, m, x, y, z, arc) {
    return mesh(geo(gkey('tor' + [r, tube, arc || 6.283].join('_')),
      () => new T.TorusGeometry(r, tube, seg(10), seg(26), arc || Math.PI * 2)), m, x, y, z);
  }
  function rounded(w, h, d, r, m) {
    // 베벨 처리된 판 형태 (ExtrudeGeometry)
    const key = gkey('rnd' + [w, h, d, r].join('_'));
    const g = geo(key, () => {
      const s = new T.Shape();
      const hw = w / 2 - r, hh = h / 2 - r;
      s.moveTo(-hw, -h / 2);
      s.lineTo(hw, -h / 2);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
      s.lineTo(w / 2, hh);
      s.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
      s.lineTo(-hw, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
      s.lineTo(-w / 2, -hh);
      s.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
      const gg = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: r * 0.4, bevelThickness: r * 0.4, bevelSegments: LOD ? 1 : 2, curveSegments: seg(6) });
      gg.translate(0, 0, -d / 2);
      gg.rotateX(Math.PI / 2);
      return gg;
    });
    return mesh(g, m);
  }
  /** 회전체(lathe): [[반지름, 높이], ...] 프로파일을 돌려 유기적인 덩어리를 만든다 */
  function lathe(profile, m, segs) {
    const q = seg(segs || 24);
    const key = gkey('lathe' + profile.map(p => p.join(',')).join('|') + q);
    const g = geo(key, () => {
      const pts = profile.map(p => new T.Vector2(Math.max(0.001, p[0]), p[1]));
      const gg = new T.LatheGeometry(pts, q);
      gg.computeVertexNormals();
      return gg;
    });
    return mesh(g, m);
  }

  /**
   * 끝으로 갈수록 가늘어지는 뼈대 (어깨 두껍고 손목 얇게).
   * 원통 + 양 끝 반구를 하나의 지오메트리로 구워 드로우콜을 늘리지 않는다.
   */
  function taperBone(len, r0, r1, m) {
    const key = gkey('tbone' + [len, r0, r1].map(v => v.toFixed(2)).join('_'));
    const g = geo(key, () => {
      const BGU = T.BufferGeometryUtils;
      const shaft = new T.CylinderGeometry(r1, r0, len, seg(20), 1, true);
      shaft.translate(0, len / 2, 0);
      if (!BGU || !BGU.mergeGeometries) return shaft;
      const capA = new T.SphereGeometry(r0, seg(20), seg(12));
      const capB = new T.SphereGeometry(r1, seg(20), seg(12));
      capB.translate(0, len, 0);
      const parts = [shaft, capA, capB].map(x => {
        const nx = x.index ? x.toNonIndexed() : x;
        if (!nx.attributes.uv) nx.setAttribute('uv', new T.BufferAttribute(new Float32Array(nx.attributes.position.count * 2), 2));
        return nx;
      });
      try { return BGU.mergeGeometries(parts, false) || shaft; } catch (e) { return shaft; }
    });
    return mesh(g, m);
  }

  function starShape(points, outer, inner, depth, m) {
    const g = geo('star' + [points, outer, inner, depth].join('_'), () => {
      const s = new T.Shape();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = i * Math.PI / points - Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? s.lineTo(x, y) : s.moveTo(x, y);
      }
      s.closePath();
      const gg = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.35, bevelThickness: depth * 0.3, bevelSegments: 1 });
      gg.center();
      return gg;
    });
    return mesh(g, m);
  }

  /* =============================================================
   * 캐릭터 — 오리지널 캐스트 8종 (착좌 관절 리그)
   *
   *   pelvis ─┬─ torso ─┬─ head
   *           │         ├─ armL(upper → fore → hand)
   *           │         └─ armR
   *           ├─ legL(thigh → shin → foot)
   *           └─ legR
   *
   *   각 관절은 userData.joint = true 로 표시되어 지오메트리 병합 시
   *   관절 단위로만 합쳐진다(관절끼리는 합치지 않음 -> 런타임 포즈 가능).
   *   정면은 +X, 원점은 좌석 바닥.
   * ============================================================= */

  /** 관절 피벗: +Y 방향으로 길이 len 만큼 뻗는 캡슐을 자식으로 갖는다 */
  function bone(len, r0, r1, m, name) {
    const j = new T.Object3D();
    j.userData.joint = true;
    j.name = name || '';
    j.add(taperBone(len, r0, r1 === undefined ? r0 * 0.78 : r1, m));
    j.userData.len = len;
    return j;
  }
  function joint(x, y, z, name) {
    const j = new T.Object3D();
    j.position.set(x || 0, y || 0, z || 0);
    j.userData.joint = true;
    j.name = name || '';
    return j;
  }
  function emissiveMat(color, glow, intensity) {
    const m = mat(color, { emissive: glow, emissiveIntensity: intensity || 2, rough: 0.5 });
    m.__keepEmissive = true;
    return m;
  }

  /** 관성으로 흔들리는 부위(귀·꼬리·스카프·안테나)용 스프링 관절 */
  function wobbleJoint(parent, x, y, z, cfg, list) {
    const j = joint(x, y, z, 'wobble');
    j.userData.joint = true;
    parent.add(j);
    list.push({
      node: j, ax: 0, az: 0, vx: 0, vz: 0,
      gx: cfg.gx || 0, gz: cfg.gz || 0,
      stiff: cfg.stiff || 70, damp: cfg.damp || 9, max: cfg.max || 0.55
    });
    return j;
  }

  function null_face() { return { lids: [], brows: [] }; }

  function buildCharacter(ch) {
    // assets/manifest.json 에 등록된 외부 모델이 있으면 그걸 쓴다
    const ext = global.Assets && global.Assets.character(ch.id);
    if (ext) { ext.userData.external = true; return ext; }

    const c = ch.colors;
    const heavy = ch.cls === 'heavy', light = ch.cls === 'light';
    const S = heavy ? 1.18 : (light ? 0.88 : 1.0);

    // 무광 확산광만 있으면 점토처럼 보인다. 부위별로 반사 성질을 다르게 준다.
    const body = mat(c.body, { rough: 0.52, envI: 0.85, sheen: 0.95, sheenRough: 0.42,
      sheenColor: new T.Color(c.body).lerp(new T.Color('#ffffff'), 0.7).getStyle() });
    const belly = mat(c.belly, { rough: 0.58, envI: 0.75, sheen: 0.85, sheenRough: 0.5,
      sheenColor: new T.Color(c.belly).lerp(new T.Color('#ffffff'), 0.7).getStyle() });
    const accent = mat(c.accent, { rough: 0.3, envI: 1.15, coat: 0.55, coatRough: 0.14 });
    const trim = mat(c.trim, { rough: 0.32, metal: 0.55, envI: 1.2 });
    const detail = mat(c.detail, { rough: 0.34, envI: 1.1 });
    const white = mat('#f8f8fb', { rough: 0.38, envI: 0.95 });
    const dark = mat('#1c1c24', { rough: 0.34, metal: 0.25, envI: 1.1 });
    const shoeMat = mat(c.trim, { rough: 0.5, envI: 0.85 });
    // 미세 표면 결: 이게 없으면 하이라이트가 고르게 번져서 매끈한 점토로 보인다
    const SD = global.Surface;
    if (SD) {
      SD.detail(body, { scale: 1.5, rough: 0.30, tint: 0.055 });   // 털/플러시
      SD.detail(belly, { scale: 1.7, rough: 0.28, tint: 0.05 });
      SD.detail(accent, { scale: 2.6, rough: 0.13, tint: 0.02 });  // 매끈한 플라스틱
      SD.detail(shoeMat, { scale: 2.2, rough: 0.24, tint: 0.04 }); // 고무
      SD.detail(white, { scale: 1.6, rough: 0.24, tint: 0.035 });
    }

    /* ---- 치수 ---- */
    const torsoR = 4.3 * S, torsoLen = 6.6 * S;
    const pelvisY = 0;                       // 좌석 바닥
    const torsoPivot = 2.6 * S;              // 골반 위 척추 시작점
    const chestY = 5.2 * S;                  // torso 로컬 기준 가슴 중심
    const shoY = 9.4 * S, shZ = 4.4 * S;     // torso 로컬 어깨
    const neckY = 12.4 * S;
    const headR = (heavy ? 6.2 : 5.6) * S;
    const headLocalY = 5.4 * S + headR * 0.45;   // 목 위 머리 중심
    const front = headR * 0.95;
    const upperLen = 6.1 * S, foreLen = 5.7 * S;
    const thighLen = 7.6 * S, shinLen = 7.0 * S;

    const root = new T.Group();
    const wobblers = [];      // 관성으로 따라 흔들리는 부위

    /* ---------- 골반 ---------- */
    const pelvis = joint(0, pelvisY, 0, 'pelvis');
    pelvis.userData.joint = false;   // 정적 -> 카트 본체와 함께 병합
    root.add(pelvis);
    // 골반: 아래가 넓고 위로 좁아지는 회전체
    const hips = lathe([
      [0.2, -0.6], [torsoR * 0.62, -0.2], [torsoR * 0.95, 1.0],
      [torsoR * 0.88, 2.4], [torsoR * 0.66, 3.2], [0.2, 3.4]
    ].map(v => [v[0], v[1] * S]), body, 28);
    hips.scale.set(1, 1, 1.06);
    pelvis.add(hips);

    /* ---------- 다리 (착좌: 허벅지 앞으로, 정강이 아래로, 발은 페달) ---------- */
    const legs = [];
    [-1, 1].forEach(sd => {
      const hip = joint(0.6 * S, 1.4 * S, sd * 3.3 * S, 'hip');
      pelvis.add(hip);
      const thigh = bone(thighLen, 2.55 * S, 1.95 * S, body, 'thigh');
      thigh.rotation.z = -Math.PI / 2 + 0.18;      // 앞으로 거의 수평
      thigh.rotation.x = sd * -0.10;
      hip.add(thigh);

      const knee = joint(0, thighLen, 0, 'knee');
      thigh.add(knee);
      const shin = bone(shinLen, 1.95 * S, 1.45 * S, body, 'shin');
      shin.rotation.z = -1.15;                     // 무릎에서 아래로 꺾임
      knee.add(shin);

      const ankle = joint(0, shinLen, 0, 'ankle');
      shin.add(ankle);
      // 신발: 둥근 몸통 + 앞코
      const foot = sphere(2.3 * S, shoeMat, 0, 0, 0, 12);
      foot.scale.set(1.05, 0.85, 1.9);
      foot.rotation.y = 0;
      foot.position.set(0.9 * S, 0.2 * S, 0);
      foot.rotation.z = 1.35;
      ankle.add(foot);
      const toe = sphere(1.7 * S, shoeMat, 0, 0, 0, 10);
      toe.scale.set(1.0, 0.8, 1.5);
      toe.position.set(1.5 * S, -1.9 * S, 0);
      ankle.add(toe);
      [hip, thigh, knee, shin, ankle].forEach(n => { n.userData.joint = false; });
      legs.push({ hip, thigh, knee, shin, ankle });
    });

    /* ---------- 몸통 ---------- */
    const torso = joint(0, torsoPivot, 0, 'torso');
    pelvis.add(torso);
    // 몸통: 허리에서 가슴으로 부풀었다가 어깨에서 목으로 좁아지는 회전체
    const chest = lathe([
      [0.2, -1.4], [torsoR * 0.74, -0.9], [torsoR * 0.92, 1.2],
      [torsoR * 0.88, 3.0], [torsoR * 1.0, 5.2], [torsoR * 0.93, 7.0],
      [torsoR * 0.66, 8.6], [torsoR * 0.34, 9.4], [0.2, 9.6]
    ].map(v => [v[0], v[1] * S]), body, 28);
    chest.position.y = chestY - 3.4 * S;
    chest.scale.set(1.0, 1, 0.9);
    torso.add(chest);
    // 배: 앞쪽에만 얹는 밝은 패치
    const bellyM = sphere(torsoR * 0.8, belly, torsoR * 0.46, chestY - 1.2 * S, 0, 14);
    bellyM.scale.set(0.62, 1.2, 0.9);
    torso.add(bellyM);
    // 어깨 볼륨
    [-1, 1].forEach(sd => {
      const shb = sphere(2.95 * S, body, 0.3 * S, shoY, sd * shZ, 12);
      shb.scale.set(1, 0.92, 1.05);
      torso.add(shb);
    });
    // 목: 아래가 굵고 위가 가는 형태
    torso.add(taperBone(3.2 * S, 2.05 * S, 1.6 * S, body).translateY(neckY - 1.4 * S));

    /* ---------- 머리 ---------- */
    const headJ = joint(0, neckY + 1.2 * S, 0, 'head');
    torso.add(headJ);
    const hY = headLocalY - (neckY + 1.2 * S) + neckY * 0;   // headJ 로컬에서의 머리 중심
    const hc = 4.4 * S;                                       // 머리 중심 오프셋
    if (ch.id === 'volt') {
      const hd = rounded(8.2 * S, 8.0 * S, 8.0 * S, 1.6 * S, mat(c.body, { rough: 0.35, metal: 0.75 }));
      hd.position.y = hc; hd.rotation.x = Math.PI / 2;
      headJ.add(hd);
    } else if (ch.id === 'magma') {
      const hd = mesh(new T.IcosahedronGeometry(headR * 1.05, 0), mat(c.body, { rough: 0.95, flat: true }));
      hd.position.y = hc; hd.rotation.set(0.3, 0.6, 0.1);
      headJ.add(hd);
    } else {
      const hd = sphere(headR, body, 0, hc, 0, 32);
      hd.scale.set(1, 1.03, 0.96);
      headJ.add(hd);
      // 턱: 아래쪽 앞으로 살짝 나온 볼륨
      const jawV = sphere(headR * 0.72, body, headR * 0.22, hc - headR * 0.52, 0, 24);
      jawV.scale.set(1.05, 0.72, 0.95);
      headJ.add(jawV);
    }

    /* ---------- 팔 (IK 로 핸들을 잡는다) ---------- */
    const arms = [];
    [-1, 1].forEach(sd => {
      const shoulder = joint(0.5 * S, shoY - 0.3 * S, sd * shZ, 'shoulder');
      shoulder.userData.joint = false;   // 메시 없는 순수 피벗
      torso.add(shoulder);
      const upper = bone(upperLen, 1.95 * S, 1.45 * S, body, 'upperarm');
      upper.rotation.z = -1.52;                 // 기본 착좌 포즈: 팔을 앞으로
      shoulder.add(upper);
      const elbow = joint(0, upperLen, 0, 'elbow');
      elbow.userData.joint = false;
      upper.add(elbow);
      const fore = bone(foreLen, 1.5 * S, 1.15 * S, body, 'forearm');
      fore.rotation.z = 0.34;                   // 팔꿈치 살짝 굽힘
      elbow.add(fore);
      const glove = sphere(2.25 * S, ch.id === 'volt' ? mat(c.trim, { metal: 0.6, rough: 0.4 }) : white, 0, foreLen, 0, 12);
      glove.scale.set(1.0, 0.88, 0.78);        // 주먹 형태로 살짝 눌러줌
      fore.add(glove);
      // 손 끝 기준점은 빈 피벗으로 둔다. 메시는 병합 시 제거되므로 참조가 끊긴다
      const handTip = new T.Object3D();
      handTip.position.set(0, foreLen, 0);
      fore.add(handTip);
      arms.push({ shoulder, upper, elbow, fore, hand: handTip, side: sd, a: upperLen, b: foreLen });
    });

    /* ---------- 눈 · 눈꺼풀 · 눈썹 ---------- */
    // 표정이 고정돼 있으면 아무리 잘 렌더해도 인형으로 보인다.
    // 눈꺼풀과 눈썹을 따로 관절로 달아 주행 중 상태에 따라 움직이게 한다 (js/rig.js).
    const face = null_face();
    if (ch.id !== 'volt') {
      // 눈은 젖은 표면이다. 여기에 또렷한 하이라이트가 하나 박히면 즉시 살아 있는 캐릭터로 읽힌다
      const eyeMat = mat('#ffffff', { rough: 0.05, envI: 2.2, coat: 1, coatRough: 0.02 });
      const pupilMat = mat(c.eye, { rough: 0.06, envI: 2.0, coat: 1, coatRough: 0.03 });
      // 눈썹은 표정을 가장 강하게 드러내는 부위다. 또렷하게 보이도록 어둡고 굵게.
      const browMat = mat(c.eye, { rough: 0.55, envI: 0.6 });
      const eyeR = 1.95 * S;
      [-1, 1].forEach(sd => {
        const ex = front * 0.74, ey = hc + headR * 0.14, ez = sd * headR * 0.4;
        const e = sphere(eyeR, eyeMat, ex, ey, ez, 12);
        e.scale.set(0.55, 1.05, 1); headJ.add(e);
        const pu = sphere(0.95 * S, pupilMat, front * 0.94, hc + headR * 0.12, sd * headR * 0.42, 10);
        pu.scale.set(0.55, 1.05, 1); headJ.add(pu);
        headJ.add(sphere(0.42 * S, mat('#ffffff', { rough: 0.1 }), front * 1.02, hc + headR * 0.34, sd * headR * 0.5, 8));

        // 눈꺼풀: 눈알을 감싸는 위쪽 반구 껍질. 눈 중심을 축으로 돌려 덮는다
        const lidJ = joint(ex, ey, ez, 'lid');
        lidJ.userData.joint = true;               // 병합 경계 (움직여야 하므로)
        headJ.add(lidJ);
        const lid = mesh(geo('lid' + eyeR.toFixed(2), () =>
          new T.SphereGeometry(eyeR * 1.13, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), body);
        lid.scale.set(0.56, 1.05, 1.02);
        lidJ.add(lid);
        // +z 가 눈을 덮는 방향이다 (렌더로 확인). 기본은 살짝 열린 눈매
        lidJ.rotation.z = -0.10;

        // 눈썹
        const browJ = joint(front * 0.86, ey + headR * 0.30, ez, 'brow');
        browJ.userData.joint = true;
        headJ.add(browJ);
        // rounded() 는 마지막에 rotateX(90도) 를 하므로 인자는 (x, z, y) 순으로 먹는다.
        // 눈썹은 좌우로 길고 앞뒤·위아래로 얇아야 한다.
        const brow = rounded(1.15 * S, 4.2 * S, 1.05 * S, 0.42 * S, browMat);
        brow.rotation.x = sd * 0.18;              // 기본: 바깥쪽이 살짝 처진 순한 눈썹
        browJ.add(brow);

        face.lids.push({ node: lidJ, side: sd, rest: -0.10 });
        face.brows.push({ node: browJ, side: sd, baseY: browJ.position.y });
      });
    }

    /* ---------- 캐릭터별 특징 ---------- */
    const H = (y) => hc + y;                    // 머리 로컬 y
    const B = (y) => chestY + y;                // 몸통 로컬 y
    switch (ch.id) {
      case 'bbiyak': {
        const beak = cone(2.2 * S, 4.4 * S, detail, front * 1.02, H(-headR * 0.30), 0, 8);
        beak.rotation.z = -Math.PI / 2; headJ.add(beak);
        const strap = cyl(headR * 0.98, headR * 0.98, 1.6 * S, dark, 0, H(headR * 0.52), 0, 16);
        strap.rotation.x = Math.PI / 2; strap.rotation.z = Math.PI / 2; strap.scale.set(1, 1, 0.82);
        headJ.add(strap);
        [-1, 1].forEach(sd => {
          const ring = torus(2.1 * S, 0.6 * S, trim, front * 0.52, H(headR * 0.6), sd * headR * 0.42);
          ring.rotation.y = Math.PI / 2; headJ.add(ring);
          const lens = sphere(1.8 * S, mat('#9fd8ff', { rough: 0.15, metal: 0.3 }), front * 0.56, H(headR * 0.6), sd * headR * 0.42, 10);
          lens.scale.set(0.4, 1, 1); headJ.add(lens);
        });
        const sc = torus(3.3 * S, 1.4 * S, trim, 0, B(neckY - chestY - 0.6 * S), 0);
        sc.rotation.x = Math.PI / 2; torso.add(sc);
        const scarfJ = wobbleJoint(torso, -2 * S, B(neckY - chestY - 1.4 * S), 1.4 * S,
          { gx: 0.055, gz: 0.9, stiff: 55, damp: 7, max: 0.8 }, wobblers);
        scarfJ.add(limb(0, 0, 0, -6 * S, 3.4 * S, 3.2 * S, 1.3 * S, trim));
        const tailJ = wobbleJoint(torso, -torsoR * 0.9, B(0.6 * S), 0,
          { gx: 0.04, gz: 0.6, stiff: 75, damp: 8, max: 0.5 }, wobblers);
        [-1, 0, 1].forEach(i => {
          const f = cone(1.5 * S, 5.2 * S, accent, 0, i * 1.4 * S, i * 2.2 * S, 6);
          f.rotation.z = 1.9; f.rotation.x = i * 0.24; tailJ.add(f);
        });
        [-1, 1].forEach(sd => {
          const w = sphere(3.1 * S, accent, -0.6 * S, B(0.2 * S), sd * (torsoR + 0.6 * S), 10);
          w.scale.set(0.9, 1.25, 0.35); torso.add(w);
        });
        break;
      }
      case 'momo': {
        [-1, 1].forEach(sd => {
          const earJ = wobbleJoint(headJ, sd * headR * 0.34, H(headR * 0.7), 0,
            { gx: 0.05, gz: 1.1, stiff: 48, damp: 6.5, max: 0.85 }, wobblers);
          earJ.add(limb(0, 0, 0, sd * headR * 0.6, headR * 1.8, -headR * 0.75, 1.55 * S, body));
          earJ.add(limb(0, 0.1 * S, 0.5 * S, sd * headR * 0.56, headR * 1.65, -headR * 0.45, 0.85 * S, detail));
        });
        headJ.add(sphere(1.15 * S, detail, front * 0.98, H(-headR * 0.2), 0, 10));
        [-1, 1].forEach(sd => {
          for (let i = -1; i <= 1; i++) {
            const wk = box(3.4 * S, 0.22 * S, 0.22 * S, white, front * 0.85, H(-headR * 0.18 + i * 0.7 * S), sd * headR * 0.42);
            wk.rotation.y = sd * 0.4; wk.rotation.z = i * 0.16; headJ.add(wk);
          }
        });
        pelvis.add(sphere(2.8 * S, white, -torsoR * 1.0, 1.4 * S, 0, 12));
        break;
      }
      case 'volt': {
        const visor = rounded(5.6 * S, 3.0 * S, 7.4 * S, 0.9 * S, mat('#141a26', { rough: 0.15, metal: 0.5 }));
        visor.position.set(front * 0.66, H(headR * 0.10), 0); visor.rotation.x = Math.PI / 2;
        headJ.add(visor);
        const glow = rounded(3.4 * S, 1.4 * S, 5.8 * S, 0.5 * S, emissiveMat(c.detail, c.detail, 3.4));
        glow.position.set(front * 0.86, H(headR * 0.10), 0); glow.rotation.x = Math.PI / 2;
        glow.castShadow = false; headJ.add(glow);
        const antJ = wobbleJoint(headJ, -1.2 * S, H(headR * 0.9), 0,
          { gx: 0.07, gz: 1.4, stiff: 40, damp: 5.5, max: 0.9 }, wobblers);
        antJ.add(cyl(0.35 * S, 0.35 * S, 5.4 * S, trim, 0, 3.1 * S, 0, 6));
        const bulb = sphere(1.15 * S, emissiveMat(c.accent, c.detail, 3.4), 0, 6.2 * S, 0, 10);
        bulb.castShadow = false; antJ.add(bulb);
        const panel = rounded(5.2 * S, 4.4 * S, 1.4 * S, 0.6 * S, mat(c.trim, { rough: 0.3, metal: 0.7 }));
        panel.position.set(torsoR * 0.82, B(-0.4 * S), 0); panel.rotation.z = Math.PI / 2;
        torso.add(panel);
        for (let i = 0; i < 3; i++) {
          const bar = box(0.6 * S, 3.0 * S, 0.9 * S, emissiveMat(c.detail, c.detail, 2.6), torsoR * 0.95, B(-0.4 * S), (i - 1) * 1.3 * S);
          bar.castShadow = false; torso.add(bar);
        }
        [-1, 1].forEach(sd => {
          const sh = rounded(3.8 * S, 3.0 * S, 2.6 * S, 0.7 * S, mat(c.trim, { rough: 0.35, metal: 0.6 }));
          sh.position.set(0.2 * S, shoY + 0.6 * S, sd * (shZ + 0.4 * S)); torso.add(sh);
        });
        break;
      }
      case 'koko': {
        const snout = capsule(2.9 * S, 2.6 * S, body, front * 0.72, H(-headR * 0.22), 0);
        snout.rotation.z = Math.PI / 2; headJ.add(snout);
        [-1, 1].forEach(sd => headJ.add(sphere(0.55 * S, dark, front * 1.32, H(-headR * 0.1), sd * 1.35 * S, 8)));
        [0, 1, 2].forEach(i => {
          const sp = cone(1.5 * S - i * 0.22 * S, 4.6 * S - i * 0.7 * S, detail, -torsoR * 0.72, B(2.4 * S - i * 3.0 * S), 0, 6);
          sp.rotation.z = 0.55; torso.add(sp);
        });
        const kokoTail = wobbleJoint(pelvis, -torsoR * 0.9, 1.6 * S, 0,
          { gx: 0.045, gz: 0.8, stiff: 60, damp: 7.5, max: 0.6 }, wobblers);
        kokoTail.add(limb(0, 0, 0, -torsoR * 1.7, -1.4 * S, 0, 1.9 * S, body));
        break;
      }
      case 'tango': {
        const helm = mesh(new T.SphereGeometry(headR * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), trim);
        helm.position.y = H(headR * 0.06); headJ.add(helm);
        [-1, 1].forEach(sd => {
          const ear = cone(1.7 * S, 4.4 * S, body, -headR * 0.1, H(headR * 1.15), sd * headR * 0.6, 7);
          ear.rotation.x = sd * 0.32; headJ.add(ear);
          const tip = cone(1.0 * S, 1.7 * S, dark, -headR * 0.1, H(headR * 1.72), sd * headR * 0.68, 7);
          tip.rotation.x = sd * 0.32; headJ.add(tip);
        });
        const snout = capsule(2.3 * S, 2.8 * S, body, front * 0.78, H(-headR * 0.26), 0);
        snout.rotation.z = Math.PI / 2; headJ.add(snout);
        headJ.add(sphere(2.0 * S, detail, front * 1.28, H(-headR * 0.3), 0, 10));
        headJ.add(sphere(0.95 * S, dark, front * 1.5, H(-headR * 0.22), 0, 8));
        const foxTail = wobbleJoint(pelvis, -torsoR * 1.0, 1.2 * S, 0,
          { gx: 0.05, gz: 1.0, stiff: 45, damp: 6, max: 0.8 }, wobblers);
        for (let i = 0; i < 4; i++) {
          foxTail.add(sphere((3.2 - i * 0.5) * S, i === 3 ? white : accent, -torsoR * i * 0.62, i * 1.5 * S, 0, 10));
        }
        break;
      }
      case 'luna': {
        [-1, 1].forEach(sd => {
          const ear = cone(2.0 * S, 4.3 * S, body, -headR * 0.05, H(headR * 1.05), sd * headR * 0.52, 7);
          ear.rotation.x = sd * 0.26; headJ.add(ear);
          const inner = cone(1.05 * S, 2.4 * S, detail, headR * 0.12, H(headR * 1.02), sd * headR * 0.52, 7);
          inner.rotation.x = sd * 0.26; headJ.add(inner);
        });
        const muzzle = sphere(2.5 * S, belly, front * 0.85, H(-headR * 0.3), 0, 12);
        muzzle.scale.set(0.7, 0.75, 1.2); headJ.add(muzzle);
        const nose = cone(0.95 * S, 1.3 * S, detail, front * 1.14, H(-headR * 0.16), 0, 6);
        nose.rotation.z = -Math.PI / 2; headJ.add(nose);
        [-1, 1].forEach(sd => {
          for (let i = -1; i <= 1; i++) {
            const wk = box(3.6 * S, 0.22 * S, 0.22 * S, white, front * 0.82, H(-headR * 0.24 + i * 0.72 * S), sd * headR * 0.44);
            wk.rotation.y = sd * 0.42; wk.rotation.z = i * 0.18; headJ.add(wk);
          }
        });
        const sc = torus(3.4 * S, 1.3 * S, trim, 0, B(neckY - chestY - 0.8 * S), 0);
        sc.rotation.x = Math.PI / 2; torso.add(sc);
        const catTail = wobbleJoint(pelvis, -torsoR * 1.1, 1.2 * S, 0,
          { gx: 0.06, gz: 1.2, stiff: 42, damp: 5.8, max: 0.9 }, wobblers);
        for (let i = 0; i < 4; i++) {
          catTail.add(sphere((1.9 - i * 0.22) * S, body, -Math.sin(i * 0.5) * 1.4 * S, i * 3.0 * S, 0, 9));
        }
        break;
      }
      case 'bumper': {
        const snout = sphere(3.7 * S, body, front * 0.72, H(-headR * 0.3), 0, 14);
        snout.scale.set(1.05, 0.8, 1.05); headJ.add(snout);
        const horn = cone(2.8 * S, 10.5 * S, trim, front * 1.15, H(-headR * 0.02), 0, 10);
        horn.rotation.z = -1.15; headJ.add(horn);
        const horn2 = cone(1.5 * S, 4.2 * S, trim, front * 0.62, H(headR * 0.66), 0, 8);
        horn2.rotation.z = -0.85; headJ.add(horn2);
        [-1, 1].forEach(sd => {
          // 코뿔소 귀도 관성으로 펄럭이게 (중량급도 2차 모션이 있어야 뻣뻣해 보이지 않는다)
          const earJ = wobbleJoint(headJ, -headR * 0.55, H(headR * 0.62), sd * headR * 0.72,
            { gx: 0.035, gz: 0.7, stiff: 66, damp: 8, max: 0.5 }, wobblers);
          const ear = sphere(1.6 * S, body, 0, 1.5 * S, 0, 8);
          ear.scale.set(0.45, 1.35, 0.75); ear.rotation.x = sd * 0.3; earJ.add(ear);
          const pl = rounded(6.4 * S, 4.6 * S, 3.4 * S, 1.2 * S, mat(c.accent, { rough: 0.55, metal: 0.45 }));
          pl.position.set(0.2 * S, shoY + 1.2 * S, sd * (shZ + 0.9 * S)); pl.rotation.z = sd * 0.12;
          torso.add(pl);
          for (let i = 0; i < 3; i++) torso.add(sphere(0.6 * S, trim, 2.4 * S, shoY + 2.4 * S, sd * (shZ + 0.9 * S) + (i - 1) * 1.6 * S, 6));
        });
        break;
      }
      case 'magma': {
        const crack = emissiveMat(c.detail, c.detail, 2.8);
        [-1, 1].forEach(sd => {
          const h = cone(2.7 * S, 6.0 * S, mat(c.trim, { rough: 0.95, flat: true }), -headR * 0.15, H(headR * 1.02), sd * headR * 0.58, 6);
          h.rotation.z = 0.16; h.rotation.x = sd * 0.34; headJ.add(h);
          const tip = cone(1.2 * S, 2.0 * S, mat('#141014', { rough: 1, flat: true }), -headR * 0.15 - 0.6 * S, H(headR * 1.02 + 3.0 * S), sd * headR * 0.58 + sd * 1.1 * S, 6);
          tip.rotation.z = 0.16; tip.rotation.x = sd * 0.34; headJ.add(tip);
        });
        [[front * 0.82, H(headR * 0.52), headR * 0.24, 0.5],
         [front * 0.86, H(-headR * 0.3), -headR * 0.34, -0.7]].forEach(k => {
          const b = box(1.15 * S, 5.0 * S, 1.15 * S, crack, k[0], k[1], k[2]);
          b.rotation.z = k[3]; b.castShadow = false; headJ.add(b);
        });
        [[torsoR * 0.95, B(1.0 * S), 1.8 * S, 0.6],
         [torsoR * 0.95, B(-3.2 * S), -2.2 * S, -0.4],
         [torsoR * 0.3, B(-0.6 * S), torsoR * 0.92, 0.2]].forEach(k => {
          const b = box(1.15 * S, 5.0 * S, 1.15 * S, crack, k[0], k[1], k[2]);
          b.rotation.z = k[3]; b.castShadow = false; torso.add(b);
        });
        const core = sphere(2.3 * S, emissiveMat(c.accent, c.detail, 3.2), torsoR * 0.82, B(-1.2 * S), 0, 12);
        core.castShadow = false; torso.add(core);
        [-1, 1].forEach(sd => {
          const rock = mesh(new T.IcosahedronGeometry(3.9 * S, 0), mat(c.belly, { rough: 0.95, flat: true }));
          rock.position.set(0.4 * S, shoY + 1.0 * S, sd * (shZ + 0.8 * S));
          rock.rotation.set(sd * 0.5, 0.8, 0.3); torso.add(rock);
        });
        const jaw = rounded(5.2 * S, 2.4 * S, 6.6 * S, 0.8 * S, mat(c.belly, { rough: 0.95, flat: true }));
        jaw.position.set(front * 0.5, H(-headR * 0.62), 0); jaw.rotation.x = Math.PI / 2;
        headJ.add(jaw);
        // 정수리 불꽃 갈기 - 속도가 붙으면 뒤로 흩날린다
        const flameJ = wobbleJoint(headJ, -headR * 0.42, H(headR * 0.78), 0,
          { gx: 0.062, gz: 1.15, stiff: 46, damp: 6, max: 0.9 }, wobblers);
        [[0, 0, 3.2, 1.5], [-1.3 * S, 1.1 * S, 2.4, 1.1], [1.2 * S, 0.7 * S, 2.0, 0.9]]
          .forEach((f, i) => {
            const fl = cone(f[3] * S, f[2] * S, emissiveMat(i ? c.detail : c.accent, c.detail, 3.0),
              f[0], f[1] + f[2] * 0.5 * S, 0, 6);
            fl.rotation.z = 0.2 + i * 0.1; fl.castShadow = false; flameJ.add(fl);
          });
        break;
      }
    }

    root.userData.scaleClass = S;
    root.userData.rig = {
      pelvis, torso, head: headJ, arms, legs, wobblers, face,
      restTorso: { x: 0, z: 0 }, S,
      shoulderLocal: arms.map(a => a.shoulder.position.clone())
    };
    return root;
  }

  /** 두 점을 잇는 캡슐 (꼬리·귀 등 고정 부위용) */
  function limb(ax, ay, az, bx, by, bz, r, m) {
    const a = new T.Vector3(ax, ay, az), b = new T.Vector3(bx, by, bz);
    const dir = new T.Vector3().subVectors(b, a);
    const len = dir.length();
    const mm = mesh(new T.CapsuleGeometry(r, Math.max(0.2, len - r * 2), 5, 12), m);
    mm.position.copy(a).addScaledVector(dir, 0.5);
    mm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
    return mm;
  }

  /* =============================================================
   * 카트
   * ============================================================= */
  function buildKart(combo) {
    const g = new T.Group();
    const fr = combo.frame, wh = combo.wheel, gl = combo.glider, ch = combo.character;
    const heavy = ch.cls === 'heavy', light = ch.cls === 'light';
    const L = heavy ? 50 : (light ? 42 : 46);       // 전장
    const W = heavy ? 32 : (light ? 26 : 29);       // 차폭
    const wr = wh.id === 'monster' ? 9.6 : (wh.id === 'roller' ? 6.2 : 7.8);
    const ww = wh.id === 'monster' ? 6.5 : (wh.id === 'slick' ? 6 : 4.6);

    // 스탠다드 프레임은 캐릭터 시그니처 컬러를 입는다
    const bodyColor = fr.id === 'standard' ? ch.colors.accent : fr.body;
    // 자동차 도색: 금속이 아니라 '유전체 + 투명 클리어코트' 다.
    // metalness 를 올리면 확산광이 죽고 반사가 도색 색으로 물들어 플라스틱처럼 보인다.
    const bodyMat = new T.MeshPhysicalMaterial({
      color: new T.Color(bodyColor), roughness: 0.38, metalness: 0.04,
      clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25
    });
    const accentMat = new T.MeshPhysicalMaterial({
      color: new T.Color(ch.colors.trim || '#f4d03f'), roughness: 0.3, metalness: 0.25,
      clearcoat: 0.85, clearcoatRoughness: 0.1, envMapIntensity: 1.25
    });
    const darkMat = mat('#25252c', { rough: 0.38, metal: 0.35, envI: 1.1 });
    const chromeMat = mat('#dfe4ec', { rough: 0.1, metal: 1, envI: 1.5 });
    // 타이어: 완전 무광이면 검은 점토가 된다. 고무는 옆면에 은은한 광이 돈다
    const tireMat = mat(wh.tire, { rough: 0.68, metal: 0, envI: 0.55,
      sheen: 0.35, sheenRough: 0.85, sheenColor: '#7a808c' });
    const rimMat = mat(wh.rim, { rough: 0.24, metal: 0.85, envI: 1.2 });
    const SDK = global.Surface;
    if (SDK) {
      SDK.detail(bodyMat, { scale: 0.9, rough: 0.10, tint: 0.022 });   // 도색 오렌지필
      SDK.detail(accentMat, { scale: 1.1, rough: 0.10, tint: 0.02 });
      SDK.detail(tireMat, { scale: 3.4, rough: 0.26, tint: 0.06 });    // 고무 결
      SDK.detail(darkMat, { scale: 1.6, rough: 0.18, tint: 0.035 });
    }

    /* 섀시 */
    const chassis = rounded(L, W, 7.5, 6, bodyMat);
    chassis.position.y = wr + 1.2;
    g.add(chassis);

    // 사이드 포드
    [-1, 1].forEach(side => {
      const pod = rounded(L * 0.56, W * 0.22, 8.5, 3.2, bodyMat);
      pod.position.set(-L * 0.04, wr + 4.4, side * W * 0.42);
      g.add(pod);
    });

    // 노즈콘
    const nose = cone(W * 0.34, L * 0.30, bodyMat, L * 0.52, wr + 2.4, 0, 14);
    nose.rotation.z = -Math.PI / 2;
    nose.scale.set(1, 1, 0.72);
    g.add(nose);

    // 프론트 범퍼 + 스플리터 + 헤드라이트
    const bumper = rounded(5, W * 0.86, 4.5, 2, darkMat);
    bumper.position.set(L * 0.44, wr - 1.2, 0);
    g.add(bumper);
    const splitter = rounded(9, W * 1.02, 1.6, 1.2, darkMat);
    splitter.position.set(L * 0.5, wr - 3.4, 0);
    g.add(splitter);
    const lampMat = mat('#fff6d8', { emissive: '#ffe9a0', emissiveIntensity: 0.9, rough: 0.2 });
    [-1, 1].forEach(side => {
      const lamp = sphere(2.3, lampMat, L * 0.46, wr + 3.2, side * W * 0.26, 10);
      lamp.scale.set(0.6, 0.8, 1);
      lamp.castShadow = false;
      g.add(lamp);
    });
    // 사이드 스트라이프
    [-1, 1].forEach(side => {
      const stripe = rounded(L * 0.5, 3.2, 1.2, 1, accentMat);
      stripe.position.set(-L * 0.02, wr + 3.0, side * (W * 0.52 + 0.6));
      stripe.rotation.x = Math.PI / 2;
      g.add(stripe);
    });

    // 시트
    const seat = rounded(13, W * 0.5, 3, 2, darkMat);
    seat.position.set(-L * 0.06, wr + 5.2, 0);
    g.add(seat);
    const seatBack = rounded(3.2, W * 0.5, 12, 1.6, darkMat);
    seatBack.position.set(-L * 0.19, wr + 10, 0);
    seatBack.rotation.z = 0.16;
    g.add(seatBack);

    // 스티어링 휠
    const steer = torus(3.5, 0.75, darkMat, L * 0.07, wr + 11.6, 0);
    steer.rotation.y = Math.PI / 2;
    steer.rotation.z = 0.55;
    g.add(steer);
    steer.userData.dynamic = true;
    g.userData.steer = steer;

    // 엔진 / 배기
    const engine = rounded(9, W * 0.52, 8, 2.4, darkMat);
    engine.position.set(-L * 0.46, wr + 6.5, 0);
    g.add(engine);
    const exhausts = [];
    [-1, 1].forEach(side => {
      const pipe = cyl(1.9, 2.4, 8, chromeMat, -L * 0.54, wr + 5.4, side * W * 0.2, 10);
      pipe.rotation.z = Math.PI / 2;
      g.add(pipe);
      exhausts.push(new T.Vector3(-L * 0.60, wr + 5.4, side * W * 0.2));
    });
    g.userData.exhausts = exhausts;

    // 리어 윙 / 글라이더
    const wingMat = mat(gl.wing, { rough: 0.45, metal: 0.2 });
    const wing = rounded(7, W * 1.05, 1.4, 1.2, wingMat);
    wing.position.set(-L * 0.52, wr + 14.5, 0);
    wing.rotation.z = -0.22;
    g.add(wing);
    [-1, 1].forEach(side => {
      const strut = box(1.6, 8, 1.6, darkMat, -L * 0.5, wr + 10.4, side * W * 0.4);
      g.add(strut);
    });

    /* 바퀴 */
    const wheels = [];
    const wheelGeo = geo('wheel' + wr + '_' + ww + '_' + wh.id, () => {
      const base = new T.CylinderGeometry(wr, wr, ww, 22);
      base.rotateX(Math.PI / 2);
      if (wh.id !== 'monster' || !T.BufferGeometryUtils) return base;
      // 블록 트레드를 타이어에 구워 넣는다
      const parts = [base.toNonIndexed()];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        const blk = new T.BoxGeometry(2.6, 2.2, ww * 1.15);
        blk.rotateZ(a);
        blk.translate(Math.cos(a) * wr * 0.95, Math.sin(a) * wr * 0.95, 0);
        parts.push(blk.toNonIndexed());
      }
      parts.forEach(g2 => { if (!g2.attributes.uv) g2.setAttribute('uv', new T.BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2)); });
      try { return T.BufferGeometryUtils.mergeGeometries(parts, false) || base; } catch (e) { return base; }
    });
    const rimGeo = geo('rim' + wr + '_' + ww, () => {
      const gg = new T.CylinderGeometry(wr * 0.55, wr * 0.55, ww * 1.06, 14);
      gg.rotateX(Math.PI / 2);
      return gg;
    });
    const hubGeo = geo('hub' + wr, () => {
      const parts = [];
      const hub = new T.CylinderGeometry(wr * 0.2, wr * 0.2, ww * 1.3, 10);
      hub.rotateX(Math.PI / 2);
      parts.push(hub.toNonIndexed());
      for (let i = 0; i < 5; i++) {                 // 스포크
        const sp = new T.BoxGeometry(wr * 0.9, wr * 0.16, ww * 0.5);
        sp.rotateZ(i / 5 * Math.PI);
        parts.push(sp.toNonIndexed());
      }
      parts.forEach(g2 => { if (!g2.attributes.uv) g2.setAttribute('uv', new T.BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2)); });
      try { return T.BufferGeometryUtils.mergeGeometries(parts, false) || hub; } catch (e) { return hub; }
    });
    [[L * 0.34, 1, true], [L * 0.34, -1, true], [-L * 0.34, 1, false], [-L * 0.34, -1, false]]
      .forEach(w => {
        const grp = new T.Group();
        grp.position.set(w[0], wr, w[1] * (W * 0.5 + ww * 0.32));
        const tire = mesh(wheelGeo, tireMat);
        tire.castShadow = true;
        grp.add(tire);
        const rim = mesh(rimGeo, rimMat);
        grp.add(rim);
        const hub = mesh(hubGeo, chromeMat);
        grp.add(hub);
        grp.userData.front = w[2];
        grp.userData.dynamic = true;
        g.add(grp);
        wheels.push(grp);
      });
    g.userData.wheels = wheels;
    g.userData.frontWheels = wheels.filter(w => w.userData.front);

    /* 드라이버 */
    const driver = buildCharacter(ch);
    driver.position.set(-L * 0.05, wr + 5.4, 0);
    g.add(driver);
    g.userData.driver = driver;
    g.userData.rig = driver.userData.rig || null;

    // 페달 (발이 닿는 위치)
    [-1, 1].forEach(side => {
      const pedal = rounded(5.0, 3.0, 1.2, 0.5, darkMat);
      pedal.position.set(L * 0.30, wr - 1.0, side * 5.2);
      pedal.rotation.z = 0.35;
      g.add(pedal);
    });

    /* 서스펜션: 바퀴는 지면에 남기고 차체만 피치/롤 하도록 분리 */
    const bodyNode = new T.Object3D();
    bodyNode.userData.joint = true;
    bodyNode.name = 'body';
    const wheelSet = new Set(wheels);
    for (const child of g.children.slice()) {
      if (!wheelSet.has(child)) bodyNode.add(child);
    }
    g.add(bodyNode);
    g.userData.body = bodyNode;
    wheels.forEach(w => { w.userData.baseY = w.position.y; });

    g.userData.dims = { L, W, wr };
    if (LOD) {
      // 원경용: 관절 경계를 모두 없애 머티리얼 단위로만 병합한다.
      // 멀리서는 팔도 바퀴도 움직이지 않으므로 나눠둘 이유가 없다.
      // AO 도 굽지 않는다 (몇 픽셀짜리에 들일 비용이 아니다).
      g.traverse(o => { o.userData.joint = false; o.userData.dynamic = false; });
      optimize(g);
      g.userData.lod = true;
    } else {
      // 파츠 사이 틈을 어둡게 굽는다 (목/겨드랑이/바퀴집/시트 뒤)
      optimize(g, { ao: true });
    }
    return g;
  }

  /** 원경용 저폴리 카트. 분할 수를 절반으로 줄이고 통째로 병합한다. */
  function buildKartLOD(combo) {
    const prev = LOD;
    LOD = 1;
    try { return buildKart(combo); } finally { LOD = prev; }
  }

  /**
   * 지오메트리 병합으로 드로우콜을 줄인다.
   * userData.joint 가 붙은 노드는 '병합 경계'가 되어, 그 안의 메시들만 서로 합쳐진다.
   * 덕분에 관절은 런타임에 따로 움직일 수 있으면서 드로우콜은 최소로 유지된다.
   * userData.dynamic / external 이 붙은 서브트리는 손대지 않는다.
   */
  /* -------------------------------------------------------------
   * 근사 앰비언트 오클루전 (구 프록시 방식)
   *
   * 목/겨드랑이/바퀴집처럼 파묻힌 곳이 어두워지지 않으면 캐릭터가 하나의
   * 덩어리진 점토로 보인다. 파츠마다 바운딩 구를 뽑아, 정점에서 그 구들이
   * 가리는 입체각을 더해 가려짐을 구한다. 저폴리 뭉툭한 형태에 잘 맞고
   * 레이캐스팅 없이 즉시 계산된다. 결과는 정점 색에 넣어 확산광만 어둡게 한다.
   * ----------------------------------------------------------- */
  const _aoP = new T.Vector3(), _aoN = new T.Vector3(), _aoD = new T.Vector3();

  function collectOccluders(root) {
    const list = [];
    root.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (!bs || !(bs.radius > 0)) return;
      const c = bs.center.clone().applyMatrix4(o.matrixWorld);
      // 비균일 스케일은 최대 축 기준으로 근사한다
      const sc = new T.Vector3().setFromMatrixScale(o.matrixWorld);
      const r = bs.radius * Math.max(sc.x, sc.y, sc.z);
      list.push({ c, r, r2: r * r, cut: (r * 4.2) * (r * 4.2), owner: o });
    });
    return list;
  }

  function bakeAO(gg, ownerMatrix, occluders, self, strength, floor) {
    const pos = gg.attributes.position, nrm = gg.attributes.normal;
    if (!pos || !nrm) return;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const nMat = new T.Matrix3().getNormalMatrix(ownerMatrix);
    for (let i = 0; i < n; i++) {
      _aoP.fromBufferAttribute(pos, i).applyMatrix4(ownerMatrix);
      _aoN.fromBufferAttribute(nrm, i).applyMatrix3(nMat).normalize();
      let occ = 0;
      for (let j = 0; j < occluders.length; j++) {
        const s = occluders[j];
        if (s === self) continue;
        _aoD.subVectors(s.c, _aoP);
        const d2 = _aoD.lengthSq();
        if (d2 > s.cut) continue;                 // 멀면 기여가 없다
        const d = Math.sqrt(d2);
        if (d < 1e-4) continue;
        const cosT = _aoD.dot(_aoN) / d;
        if (cosT <= 0) continue;                  // 등 뒤의 구는 가리지 않는다
        // 구가 덮는 반구 입체각 비율 (정점이 구 안에 있으면 최대치로 클램프)
        const ratio = s.r2 / Math.max(d2, s.r2 * 1.0002);
        occ += 0.5 * (1 - Math.sqrt(1 - ratio)) * cosT;
      }
      // 캐릭터는 겹치는 프리미티브 수십 개로 이루어져 있어 단순 합산하면
      // 모든 정점이 바닥값에 눌러붙는다. 포화 곡선으로 눌러 대비를 살린다.
      const ao = Math.max(floor, 1 - strength * (occ / (occ + 0.85)));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    }
    gg.setAttribute('color', new T.BufferAttribute(col, 3));
  }

  function optimize(root, opts) {
    const BGU = T.BufferGeometryUtils;
    if (!BGU || !BGU.mergeGeometries) return root;
    root.updateMatrixWorld(true);
    opts = opts || {};
    const occluders = opts.ao ? collectOccluders(root) : null;
    const aoStrength = opts.aoStrength === undefined ? 0.68 : opts.aoStrength;
    const aoFloor = opts.aoFloor === undefined ? 0.34 : opts.aoFloor;
    const selfOf = new Map();
    if (occluders) for (const s of occluders) selfOf.set(s.owner, s);

    const buckets = new Map();          // ownerNode -> Map(material -> [geometry])
    const remove = [];
    const inv = new T.Matrix4(), tmp = new T.Matrix4();

    (function collect(node, owner, dynamic) {
      for (const child of node.children.slice()) {
        const dyn = dynamic || !!child.userData.dynamic || !!child.userData.external;
        const nextOwner = child.userData.joint ? child : owner;
        if (child.isSkinnedMesh) { collect(child, nextOwner, true); continue; }
        if (child.isMesh && !dyn) {
          let gg = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
          inv.copy(owner.matrixWorld).invert();
          gg.applyMatrix4(tmp.copy(inv).multiply(child.matrixWorld));
          for (const name of Object.keys(gg.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
              gg.deleteAttribute(name);
            }
          }
          if (!gg.attributes.uv) {
            gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
          }
          if (occluders) {
            bakeAO(gg, owner.matrixWorld, occluders, selfOf.get(child), aoStrength, aoFloor);
          }
          if (!buckets.has(owner)) buckets.set(owner, new Map());
          const bm = buckets.get(owner);
          if (!bm.has(child.material)) bm.set(child.material, []);
          bm.get(child.material).push(gg);
          remove.push(child);
        }
        collect(child, nextOwner, dyn);
      }
    })(root, root, false);

    for (const o of remove) if (o.parent) o.parent.remove(o);
    buckets.forEach((byMat, owner) => {
      byMat.forEach((geos, material) => {
        // 색 속성이 있는 것과 없는 것이 섞이면 병합이 실패한다. 없는 쪽은 흰색으로 채운다.
        if (geos.some(gg => gg.attributes.color)) {
          for (const gg of geos) {
            if (gg.attributes.color) continue;
            const cnt = gg.attributes.position.count;
            gg.setAttribute('color', new T.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
          }
        }
        let merged;
        try { merged = BGU.mergeGeometries(geos, false); } catch (e) { merged = null; }
        geos.forEach(gg => gg.dispose && gg.dispose());
        if (!merged) return;
        if (occluders && merged.attributes.color) material.vertexColors = true;
        const m = new T.Mesh(merged, material);
        m.castShadow = true; m.receiveShadow = true;
        owner.add(m);
      });
    });
    return root;
  }

  /* =============================================================
   * 아이템
   * ============================================================= */
  function questionTexture() {
    const c = global.Tex.make(128, 128), x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, '#ffe9a0'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#a8e4ff');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
    x.fillStyle = '#e03a3a';
    x.font = 'bold 84px system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('?', 64, 70);
    return global.Tex.tex(c);
  }

  function buildItem(id) {
    const g = new T.Group();
    switch (id) {
      case 'itembox': {
        const t = geoCache._qtex || (geoCache._qtex = questionTexture());
        const m = new T.MeshPhysicalMaterial({
          map: t, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0,
          transmission: 0.35, thickness: 4, emissive: new T.Color('#ffd54a'), emissiveIntensity: 0.35,
          emissiveMap: t, side: T.DoubleSide
        });
        const b = mesh(new T.BoxGeometry(20, 20, 20), m);
        b.castShadow = false;
        g.add(b);
        const core = sphere(6, mat('#ffffff', { emissive: '#ffe9a0', emissiveIntensity: 2, rough: 1 }), 0, 0, 0, 10);
        core.castShadow = false;
        g.add(core);
        break;
      }
      case 'banana': {
        const m = mat('#f2d13c', { rough: 0.45 });
        const b = torus(6.5, 2.6, m, 0, 0, 0, Math.PI * 0.9);
        b.rotation.z = Math.PI * 0.05;
        b.scale.set(1, 1, 0.72);
        g.add(b);
        g.add(cyl(0.9, 1.3, 3, mat('#7a5c14', { rough: 0.8 }), -5.2, 4.4, 0, 8));
        g.rotation.x = Math.PI / 2;
        break;
      }
      case 'greenshell': case 'redshell': case 'spiny': {
        const col = id === 'greenshell' ? '#3fbf5f' : (id === 'redshell' ? '#e03a3a' : '#3f6fd0');
        const shellMat = new T.MeshPhysicalMaterial({
          color: new T.Color(col), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, metalness: 0.1
        });
        const dome = mesh(new T.SphereGeometry(8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
        dome.scale.set(1, 0.82, 1);
        g.add(dome);
        const rim = torus(7.9, 1.5, mat('#f7e6c8', { rough: 0.55 }), 0, 0.2, 0);
        rim.rotation.x = Math.PI / 2;
        g.add(rim);
        const belly = mesh(new T.SphereGeometry(7.6, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f7e6c8', { rough: 0.6 }));
        belly.scale.set(1, 0.35, 1);
        g.add(belly);
        // 껍질 무늬
        const patch = mat(id === 'greenshell' ? '#2a8f43' : (id === 'redshell' ? '#b8241f' : '#2a4f9e'), { rough: 0.35 });
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          const p = sphere(2.1, patch, Math.cos(a) * 5, 4.2, Math.sin(a) * 5, 10);
          p.scale.set(1, 0.35, 1);
          g.add(p);
        }
        if (id === 'spiny') {
          const sm = mat('#ffffff', { rough: 0.35 });
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            const sp = cone(1.7, 4.6, sm, Math.cos(a) * 6.2, 3.4, Math.sin(a) * 6.2, 7);
            sp.rotation.z = -Math.cos(a) * 0.75;
            sp.rotation.x = Math.sin(a) * 0.75;
            g.add(sp);
          }
          g.add(cone(2.2, 6, sm, 0, 8.4, 0, 8));
        }
        break;
      }
      case 'bobomb': {
        const bodyM = mat('#23232c', { rough: 0.35, metal: 0.4 });
        g.add(sphere(8, bodyM, 0, 0, 0, 18));
        [-1, 1].forEach(s => {
          g.add(sphere(2.2, mat('#f2f2f5', { rough: 0.4 }), 6.4, 1.6, s * 2.8, 10));
          g.add(sphere(1.0, mat('#15151c'), 7.6, 1.6, s * 2.8, 8));
          const foot = sphere(2.4, mat('#f4c542', { rough: 0.5 }), 3.6, -7.6, s * 3.4, 10);
          foot.scale.set(1.3, 0.6, 1);
          g.add(foot);
        });
        const key = torus(2.6, 0.8, mat('#e8c14a', { metal: 0.8, rough: 0.25 }), -7.4, 3.6, 0);
        key.rotation.y = Math.PI / 2;
        g.add(key);
        const fuse = cyl(0.5, 0.5, 5, mat('#c8b48a', { rough: 0.9 }), 0, 10.5, 0, 6);
        g.add(fuse);
        const spark = sphere(1.9, mat('#fff0a0', { emissive: '#ff9a1e', emissiveIntensity: 3, rough: 1 }), 0, 13.4, 0, 10);
        spark.castShadow = false;
        g.add(spark);
        g.userData.spark = spark;
        break;
      }
      case 'coin': {
        const m = mat('#f0b929', { metal: 0.9, rough: 0.22, emissive: '#5a3c00', emissiveIntensity: 0.6 });
        const c = cyl(6, 6, 1.4, m, 0, 0, 0, 22);
        c.rotation.x = Math.PI / 2;
        g.add(c);
        const inner = cyl(4, 4, 1.9, mat('#ffd964', { metal: 0.85, rough: 0.18 }), 0, 0, 0, 20);
        inner.rotation.x = Math.PI / 2;
        g.add(inner);
        break;
      }
      case 'mushroom': case 'triplemush': {
        const stem = capsule(3.6, 2.2, mat('#f7ecd8', { rough: 0.6 }), 0, -1.5, 0);
        g.add(stem);
        const capM = mat('#d0272c', { rough: 0.4 });
        const cap = mesh(new T.SphereGeometry(7.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), capM);
        cap.position.y = 2.4;
        cap.scale.set(1, 0.85, 1);
        g.add(cap);
        const spotM = mat('#fbf3e2', { rough: 0.45 });
        [[0, 0], [2.2, 1.4], [-1.6, 2.4], [1.2, -2.2]].forEach((o, i) => {
          const sp = sphere(2.1 - i * 0.2, spotM, o[0] * 1.6, 6.2 - i * 0.5, o[1] * 1.6, 10);
          sp.scale.set(1, 0.5, 1);
          g.add(sp);
        });
        [-1, 1].forEach(s => g.add(sphere(0.6, mat('#3a2b22'), 3.2, -1.4, s * 1.6, 8)));
        break;
      }
      case 'star': {
        const m = mat('#ffd93c', { rough: 0.25, metal: 0.3, emissive: '#ffb020', emissiveIntensity: 1.6 });
        const s = starShape(5, 9, 3.8, 3, m);
        g.add(s);
        [-1, 1].forEach(side => {
          g.add(sphere(1.0, mat('#2a1c06'), 0, 1.2, side * 2.4, 8));
        });
        break;
      }
      case 'lightning': {
        const shape = new T.Shape();
        [[3, 9], [-3.6, 0.4], [0.4, 0.4], [-2.4, -9], [4.4, -0.6], [0.6, -0.6]]
          .forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
        shape.closePath();
        const gg = new T.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1 });
        gg.center();
        g.add(mesh(gg, mat('#f7e14c', { emissive: '#f0c414', emissiveIntensity: 1.8, rough: 0.3, metal: 0.2 })));
        g.scale.setScalar(1.2);
        break;
      }
      case 'bulletbill': {
        const m = mat('#2c2c36', { rough: 0.3, metal: 0.6 });
        const body = capsule(7, 12, m, 0, 0, 0);
        body.rotation.z = Math.PI / 2;
        g.add(body);
        const nose2 = sphere(7, m, 9, 0, 0, 16);
        nose2.scale.set(0.8, 1, 1);
        g.add(nose2);
        [-1, 1].forEach(s => {
          g.add(sphere(2.4, mat('#f2f2f5', { rough: 0.4 }), 9.5, 1.8, s * 3.2, 10));
          g.add(sphere(1.1, mat('#15151c'), 11.4, 1.8, s * 3.2, 8));
          const fin = rounded(7, 1.4, 6, 1, m);
          fin.position.set(-8, 0, s * 5);
          g.add(fin);
        });
        break;
      }
    }
    return g;
  }

  /* =============================================================
   * 트랙 오브젝트 / 배경
   * ============================================================= */
  function buildProp(type) {
    const ext = global.Assets && global.Assets.prop(type);
    if (ext) { ext.userData.external = true; return ext; }

    const g = new T.Group();
    switch (type) {
      case 'tree': {
        g.add(cyl(3.2, 4.6, 26, mat('#6b4a2a', { rough: 0.95 }), 0, 13, 0, 10));
        const fm = mat('#2f8f3f', { rough: 0.9, flat: true });
        const fm2 = mat('#49b54f', { rough: 0.9, flat: true });
        g.add(sphere(16, fm, 0, 34, 0, 12));
        g.add(sphere(11, fm2, -8, 42, 5, 10));
        g.add(sphere(9, fm2, 9, 39, -6, 10));
        break;
      }
      case 'piranha': {
        g.add(cyl(2.4, 3.2, 30, mat('#2f8f3f', { rough: 0.9 }), 0, 15, 0, 8));
        const head = sphere(12, mat('#e03a3a', { rough: 0.55 }), 0, 40, 0, 16);
        g.add(head);
        const spotM = mat('#ffffff', { rough: 0.5 });
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2, tilt = (i % 2) ? 0.5 : -0.3;
          const sp = sphere(3, spotM, Math.cos(a) * 10.5, 40 + tilt * 8, Math.sin(a) * 10.5, 8);
          sp.scale.set(1, 0.6, 1);
          g.add(sp);
        }
        [-1, 1].forEach(s => {
          const leaf = sphere(6, mat('#3fa14a', { rough: 0.9 }), s * 8, 16, 0, 8);
          leaf.scale.set(1.5, 0.4, 0.8);
          leaf.rotation.z = s * 0.5;
          g.add(leaf);
        });
        break;
      }
      case 'crowd': {
        const stand = box(60, 16, 26, mat('#c8ccd4', { rough: 0.9 }), 0, 8, 0);
        g.add(stand);
        g.add(box(62, 3, 28, mat('#e04a3a', { rough: 0.8 }), 0, 17, 0));
        const cols = ['#f2f2f2', '#ffd0d0', '#d8e8ff', '#ffe9a8'];
        const caps = ['#e03a3a', '#3fbf5f', '#3f6fd0', '#f4c542'];
        for (let i = 0; i < 22; i++) {
          const x = -26 + (i % 11) * 5.2, z = ((i / 11) | 0) * 9 - 4;
          const y = 20 + ((i / 11) | 0) * 4;
          g.add(sphere(2.6, mat(cols[i % 4], { rough: 0.8 }), x, y, z, 8));
          const cap = sphere(3.0, mat(caps[i % 4], { rough: 0.8 }), x, y + 1.6, z, 8);
          cap.scale.set(1, 0.55, 1);
          g.add(cap);
        }
        break;
      }
      case 'sign': {
        g.add(cyl(1.6, 1.6, 26, mat('#8a6a3a', { rough: 0.95 }), 0, 13, 0, 8));
        const board = rounded(30, 20, 2.4, 3, mat('#f4f4f4', { rough: 0.6 }));
        board.position.y = 34;
        board.rotation.x = Math.PI / 2;
        board.rotation.y = Math.PI / 2;
        g.add(board);
        const ring = torus(11, 1.6, mat('#e03a3a', { rough: 0.5 }), 0, 34, 1.6);
        g.add(ring);
        break;
      }
      case 'pillar': {
        const m = mat('#4a4038', { rough: 0.95, flat: true });
        g.add(cyl(9, 11, 90, m, 0, 45, 0, 10));
        g.add(box(26, 8, 26, mat('#241d18', { rough: 0.95 }), 0, 4, 0));
        g.add(box(24, 7, 24, mat('#241d18', { rough: 0.95 }), 0, 90, 0));
        const fire = sphere(6, mat('#ff8a1e', { emissive: '#ff6a10', emissiveIntensity: 3, rough: 1 }), 0, 98, 0, 10);
        fire.castShadow = false;
        g.add(fire);
        g.userData.flicker = fire;
        break;
      }
      case 'lavafall': {
        const t = global.Tex.get('lava', global.Tex.lavaField, 2, 4);
        const m = new T.MeshStandardMaterial({
          map: t.color, emissive: new T.Color('#ff6a10'), emissiveMap: t.emissive,
          emissiveIntensity: 1.5, roughness: 0.7, side: T.DoubleSide
        });
        const p = mesh(new T.PlaneGeometry(70, 200, 1, 1), m, 0, 100, 0);
        p.castShadow = false;
        g.add(p);
        g.userData.scroll = m;
        break;
      }
      case 'statue': {
        const m = mat('#3a332e', { rough: 0.95, flat: true });
        g.add(box(34, 14, 34, m, 0, 7, 0));
        const head = sphere(18, m, 0, 34, 0, 12);
        g.add(head);
        [-1, 1].forEach(s => {
          const horn = cone(4, 12, mat('#d8cfc4', { rough: 0.7 }), -4, 48, s * 10, 7);
          horn.rotation.x = s * 0.3;
          g.add(horn);
        });
        [-1, 1].forEach(s => {
          const eye = sphere(3.4, mat('#ff7a1e', { emissive: '#ff5a0a', emissiveIntensity: 2.6, rough: 1 }), 14, 38, s * 7, 8);
          eye.castShadow = false;
          g.add(eye);
        });
        break;
      }
      case 'staroid': {
        const m = mat('#ffe9a8', { emissive: '#ffc93c', emissiveIntensity: 1.4, rough: 0.4, metal: 0.2 });
        const s = starShape(5, 22, 9, 7, m);
        s.castShadow = false;
        g.add(s);
        break;
      }
      case 'thwomp': {
        const m = mat('#6b7a90', { rough: 0.9, flat: true });
        const body = rounded(46, 46, 34, 5, m);
        body.rotation.x = Math.PI / 2;
        g.add(body);
        const face = mat('#8f9db0', { rough: 0.85 });
        const plate = box(2, 34, 34, face, 24, 0, 0);
        g.add(plate);
        [-1, 1].forEach(s => {
          g.add(sphere(5.2, mat('#e8eef5', { rough: 0.5 }), 25, 7, s * 9, 10));
          g.add(sphere(2.4, mat('#1a1f2a'), 27.5, 6, s * 9, 8));
        });
        g.add(box(2, 4, 22, mat('#1a1f2a'), 26, -9, 0));
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2;
          g.add(cone(3.4, 7, mat('#39465a', { rough: 0.8 }), -24, Math.cos(a) * 16, Math.sin(a) * 16, 6));
        }
        break;
      }
    }
    return g;
  }

  /* ---------------- 트랙 위 게이트 / 배경 세트 ---------------- */

  /** 도로를 가로지르는 게이트(갠트리). 코스가 '설계된' 느낌을 준다 */
  function buildGantry(theme, roadW, kind) {
    const g = new T.Group();
    const span = roadW + 90;
    if (theme === 'rainbow') {
      // 네온 링: 도로가 고리 안을 통과한다
      const ringMat = new T.MeshBasicMaterial({ color: new T.Color(kind === 'start' ? '#ffd54a' : '#7ef9ff'), fog: false });
      const ring = mesh(new T.TorusGeometry(span * 0.62, 4.5, 8, 40), ringMat);
      ring.position.y = span * 0.42;
      ring.rotation.y = Math.PI / 2;
      ring.castShadow = false;
      g.add(ring);
      const inner = mesh(new T.TorusGeometry(span * 0.55, 1.6, 6, 40),
        new T.MeshBasicMaterial({ color: new T.Color('#ff7ae0'), fog: false }));
      inner.position.y = span * 0.42; inner.rotation.y = Math.PI / 2; inner.castShadow = false;
      g.add(inner);
    } else if (theme === 'bowser') {
      const stone = mat('#332a24', { rough: 0.95, flat: true });
      [-1, 1].forEach(sd => {
        g.add(cyl(13, 17, 105, stone, 0, 52, sd * span * 0.5, 8));
        g.add(box(34, 12, 34, stone, 0, 108, sd * span * 0.5));
        const fire = sphere(6.5, mat('#ff8a1e', { emissive: '#ff6a10', emissiveIntensity: 3, rough: 1 }), 0, 120, sd * span * 0.5, 10);
        fire.castShadow = false;
        g.add(fire);
      });
      const beam = box(26, 22, span + 40, stone, 0, 118, 0);
      g.add(beam);
      for (let i = -3; i <= 3; i++) g.add(cone(7, 16, stone, 0, 136, i * span * 0.16, 5));
    } else {
      const steel = mat('#d8dde6', { rough: 0.4, metal: 0.6 });
      const panel = mat(kind === 'start' ? '#e03a3a' : '#2f6fd0', { rough: 0.6 });
      [-1, 1].forEach(sd => {
        g.add(box(11, 92, 11, steel, 0, 46, sd * span * 0.5));
        g.add(box(20, 6, 20, steel, 0, 4, sd * span * 0.5));
      });
      g.add(box(12, 10, span + 22, steel, 0, 94, 0));
      const board = rounded(span + 10, 26, 4, 3, panel);
      board.position.set(0, 112, 0);
      board.rotation.x = Math.PI / 2;
      board.rotation.y = Math.PI / 2;
      g.add(board);
      if (kind === 'start') {
        const chk = global.Tex.tex(global.Tex.startGrid(), 8, 1);
        const strip = new T.Mesh(new T.PlaneGeometry(span + 10, 12),
          new T.MeshStandardMaterial({ map: chk, roughness: 0.7, side: T.DoubleSide }));
        strip.position.set(0, 94, 0);
        strip.rotation.y = Math.PI / 2;
        g.add(strip);
      }
    }
    return g;
  }

  /** 테마별 대형 배경물 세트: [{obj, x, z, y, rot, scale, anim}] */
  /**
   * 지평선 산줄기.
   *
   * 지면 평면이 하늘과 만나는 자리가 직선으로 뚝 끊기면 배경이 대번에 싸구려로
   * 보인다. 거리가 다른 커튼 세 겹을 둘러 그 선을 가리고, 멀수록 안개색에 가깝게
   * 정점 색을 구워 공기원근(aerial perspective)을 만든다. 한 겹이 128 세그먼트짜리
   * 삼각형 띠라 통째로도 몇백 폴리곤이다.
   */
  function buildHorizon(theme, world) {
    if (theme === 'rainbow') return null;          // 우주에는 지평선이 없다
    const C = world / 2;
    const L = theme === 'bowser'
      ? [{ r: 3900, h: 640, amp: 0.80, sharp: 1, col: '#1d0e0a', haze: '#4a1c0d', hz: 0.34, seed: 1.3 },
         { r: 4700, h: 980, amp: 0.85, sharp: 1, col: '#26120c', haze: '#6b2810', hz: 0.54, seed: 2.7 },
         { r: 5500, h: 1420, amp: 0.72, sharp: 1, col: '#33180f', haze: '#8a3614', hz: 0.74, seed: 4.1 }]
      : [{ r: 3900, h: 520, amp: 0.62, sharp: 0, col: '#568049', haze: '#c8e0ee', hz: 0.30, seed: 1.3 },
         { r: 4700, h: 820, amp: 0.70, sharp: 0, col: '#5d7f8c', haze: '#d6eaf6', hz: 0.52, seed: 2.7 },
         { r: 5500, h: 1200, amp: 0.58, sharp: 0, col: '#8fb0c6', haze: '#e6f2fa', hz: 0.74, seed: 4.1 }];

    const g = new T.Group();
    const N = 128;
    const lo = new T.Color(), hi = new T.Color(), base = new T.Color(), hz = new T.Color();

    for (let li = 0; li < L.length; li++) {
      const d = L[li];
      base.set(d.col); hz.set(d.haze);
      // 아래쪽(지평선에 붙은 부분)이 더 뿌옇다
      lo.copy(base).lerp(hz, Math.min(1, d.hz * 0.9 + 0.12));
      hi.copy(base).lerp(hz, d.hz * 0.42);

      const height = (i) => {
        const a = (i % N) / N * Math.PI * 2;
        // 정수 배수 주파수라야 한 바퀴 돌아 이어진다
        let v = Math.sin(a * 3 + d.seed) * 0.50
              + Math.sin(a * 7 + d.seed * 2.1) * 0.27
              + Math.sin(a * 13 + d.seed * 3.4) * 0.14
              + Math.sin(a * 23 + d.seed * 1.6) * 0.09;
        if (d.sharp) v = Math.sign(v) * Math.pow(Math.abs(v), 0.62);   // 화산 능선은 뾰족하게
        return Math.max(0.12, 0.56 + v * d.amp * 0.5) * d.h;
      };

      const pos = new Float32Array(N * 6 * 3);
      const col = new Float32Array(N * 6 * 3);
      let p = 0, q = 0;
      const push = (x, y, z, c) => {
        pos[p++] = x; pos[p++] = y; pos[p++] = z;
        col[q++] = c.r; col[q++] = c.g; col[q++] = c.b;
      };
      // 해 쪽을 향한 능선은 밝고 반대쪽은 어둡다. 조명을 안 받는 면이라
      // 이걸 정점 색에 구워 넣지 않으면 오려붙인 종이처럼 평평해 보인다.
      const SUN_AZ = Math.atan2(260, -380);
      const t0c = new T.Color(), t1c = new T.Color();
      const shade = (out, src, a, up) => {
        let da = a - SUN_AZ;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        // 해 방향 +14% ~ 반대편 -16%, 능선 위쪽이 빛을 더 받는다
        const k = 1 + Math.cos(da) * 0.15 * (0.55 + up * 0.45)
                    + Math.sin(a * 5 + d.seed * 2.3) * 0.035;
        out.copy(src).multiplyScalar(k);
      };
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
        const x0 = Math.cos(a0) * d.r, z0 = Math.sin(a0) * d.r;
        const x1 = Math.cos(a1) * d.r, z1 = Math.sin(a1) * d.r;
        const h0 = height(i), h1 = height(i + 1);
        shade(t0c, hi, a0, 1); shade(t1c, hi, a1, 1);
        const b0 = t0c.clone().lerp(lo, 0.82), b1 = t1c.clone().lerp(lo, 0.82);
        // 바닥을 조금 내려 지면과 겹치게 해서 틈이 생기지 않게 한다
        push(x0, -160, z0, b0); push(x1, -160, z1, b1); push(x1, h1, z1, t1c);
        push(x0, -160, z0, b0); push(x1, h1, z1, t1c); push(x0, h0, z0, t0c);
      }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(pos, 3));
      gg.setAttribute('color', new T.BufferAttribute(col, 3));
      gg.computeVertexNormals();
      // 조명을 받지 않는 먼 실루엣이다. 안개는 받아서 하늘에 녹아들게 한다.
      const m = new T.MeshBasicMaterial({ vertexColors: true, fog: true, side: T.DoubleSide });
      const mesh = new T.Mesh(gg, m);
      mesh.renderOrder = -1 + li * 0.01;
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    g.position.set(C, 0, C);
    return g;
  }

  function buildBackdrop(theme, world) {
    const items = [];
    const C = world / 2;
    const put = (obj, x, z, y, rot, scale, anim) => {
      obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      items.push({ obj, x, z, y: y || 0, rot: rot || 0, scale: scale || 1, anim: anim || null });
    };
    const ring = (n, r, f) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        f(C + Math.cos(a) * r, C + Math.sin(a) * r, a, i);
      }
    };

    if (theme === 'circuit') {
      // 피트 빌딩
      const pit = new T.Group();
      const wallM = mat('#eceff4', { rough: 0.85 });
      pit.add(box(760, 120, 130, wallM, 0, 60, 0));
      pit.add(box(790, 16, 150, mat('#3f6fd0', { rough: 0.7 }), 0, 128, 0));
      for (let i = -5; i <= 5; i++) {
        pit.add(box(56, 54, 6, mat('#2a3a55', { rough: 0.3, metal: 0.4 }), i * 66, 66, 66));
        pit.add(box(60, 8, 20, mat(i % 2 ? '#e03a3a' : '#f4d03f', { rough: 0.7 }), i * 66, 100, 70));
      }
      put(pit, C - 1450, C - 1750, 0, 0.15);

      // 관중 타워
      const towerTpl = new T.Group();
      towerTpl.add(cyl(46, 54, 190, mat('#dfe4ec', { rough: 0.9 }), 0, 95, 0, 10));
      towerTpl.add(cyl(58, 58, 14, mat('#e03a3a', { rough: 0.7 }), 0, 196, 0, 10));
      towerTpl.add(cyl(4, 4, 60, mat('#8a94a6', { rough: 0.5, metal: 0.5 }), 0, 232, 0, 6));
      for (let i = 0; i < 3; i++) {
        put(towerTpl.clone(true), C - 1900 + i * 1500, C + 1900, 0, 0, 0.9 + i * 0.15);
      }

      // 원경 언덕 위 나무숲
      // 원경 숲: 나무 70그루를 한 오브젝트로 묶어 머티리얼 단위 병합 (드로우콜 4개)
      const treeTpl = buildProp('tree');
      const forest = new T.Group();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.4, r = 2650;
        for (let k = 0; k < 5; k++) {
          const t = treeTpl.clone(true);
          t.position.set(Math.cos(a) * r + (Math.random() - 0.5) * 320, 0,
                         Math.sin(a) * r + (Math.random() - 0.5) * 320);
          t.scale.setScalar(1.6 + Math.random() * 1.4);
          t.rotation.y = Math.random() * 6.28;
          forest.add(t);
        }
      }
      put(forest, C, C, 0, 0);

      // 열기구 (부유 애니메이션)
      const balloonColors = ['#e05a5a', '#f4c542', '#4fc3ff', '#8ef2a8', '#c264ff'];
      for (let i = 0; i < 5; i++) {
        const b = new T.Group();
        const cm = mat(balloonColors[i], { rough: 0.65 });
        const env = sphere(58, cm, 0, 0, 0, 18);
        env.scale.set(1, 1.18, 1);
        b.add(env);
        b.add(cone(52, 44, mat('#f4f4f4', { rough: 0.7 }), 0, -66, 0, 16));
        b.add(box(30, 26, 30, mat('#8a6a3a', { rough: 0.9 }), 0, -104, 0));
        const a = i / 5 * Math.PI * 2;
        put(b, C + Math.cos(a) * 1750, C + Math.sin(a) * 1750, 620 + i * 90, 0, 1, 'float');
      }
    } else if (theme === 'rainbow') {
      // 떠 있는 크리스털 섬
      for (let i = 0; i < 16; i++) {
        const isl = new T.Group();
        const cm = new T.MeshPhysicalMaterial({
          color: new T.Color('hsl(' + (i * 47 % 360) + ',70%,60%)'),
          roughness: 0.1, metalness: 0.2, transmission: 0.35, thickness: 30,
          emissive: new T.Color('hsl(' + (i * 47 % 360) + ',80%,40%)'), emissiveIntensity: 0.5
        });
        // 아래로 뾰족한 결정 덩어리 + 위로 솟은 프리즘들
        const baseR = 60 + Math.random() * 50;
        const core = mesh(new T.ConeGeometry(baseR, baseR * 2.2, 6), cm);
        core.rotation.x = Math.PI;
        core.position.y = -baseR * 0.7;
        isl.add(core);
        const cap = mesh(new T.IcosahedronGeometry(baseR * 0.92, 0), cm);
        cap.scale.set(1, 0.55, 1);
        isl.add(cap);
        for (let k = 0; k < 4; k++) {
          const h = 90 + Math.random() * 130;
          const sp = mesh(new T.ConeGeometry(9 + Math.random() * 8, h, 6), cm);
          const a2 = Math.random() * 6.28, rr = Math.random() * baseR * 0.7;
          sp.position.set(Math.cos(a2) * rr, h * 0.42, Math.sin(a2) * rr);
          sp.rotation.z = (Math.random() - 0.5) * 0.4;
          sp.rotation.x = (Math.random() - 0.5) * 0.4;
          isl.add(sp);
        }
        const a = Math.random() * Math.PI * 2, r = 1500 + Math.random() * 1900;
        put(isl, C + Math.cos(a) * r, C + Math.sin(a) * r, -280 + Math.random() * 1300, Math.random() * 3, 1, 'spin');
      }
      // 행성 두 개 + 위성
      [['#6a8fd8', 380, -2700, -2300, 1500], ['#d87a5a', 250, 2900, -1900, 1900]].forEach(pd => {
        const pl = new T.Group();
        pl.add(sphere(pd[1], mat(pd[0], { rough: 0.9, emissive: pd[0], emissiveIntensity: 0.12 }), 0, 0, 0, 26));
        const rg = mesh(new T.RingGeometry(pd[1] * 1.4, pd[1] * 2.1, 48),
          new T.MeshBasicMaterial({ color: new T.Color('#e8d2a8'), transparent: true, opacity: 0.4, side: T.DoubleSide }));
        rg.rotation.x = -Math.PI / 2.3; rg.rotation.z = 0.5;
        pl.add(rg);
        put(pl, C + pd[2], C + pd[3], pd[4], 0, 1, 'spin');
      });
      // 혜성
      const comet = new T.Group();
      comet.add(sphere(26, new T.MeshBasicMaterial({ color: new T.Color('#ffffff') }), 0, 0, 0, 12));
      const tail = mesh(new T.ConeGeometry(20, 420, 10),
        new T.MeshBasicMaterial({ color: new T.Color('#9fd8ff'), transparent: true, opacity: 0.35 }));
      tail.rotation.z = Math.PI / 2; tail.position.x = -210;
      comet.add(tail);
      put(comet, C + 1900, C - 2600, 1750, 0.6);
    } else {
      // 화산
      for (let i = 0; i < 4; i++) {
        const v = new T.Group();
        const rockM = mat('#2a1a14', { rough: 1, flat: true });
        const h = 620 + Math.random() * 420;
        v.add(cone(520, h, rockM, 0, h / 2, 0, 9));
        const crater = mesh(new T.CylinderGeometry(120, 90, 60, 9),
          mat('#ff5a10', { emissive: '#ff7a10', emissiveIntensity: 2.6, rough: 1 }));
        crater.position.y = h - 20;
        v.add(crater);
        const a = i / 4 * Math.PI * 2 + 0.7, r = 2500 + Math.random() * 700;
        put(v, C + Math.cos(a) * r, C + Math.sin(a) * r, -60, a);
      }
      // 수호 석상 (머티리얼 공유를 위해 복제)
      const statueTpl = buildProp('statue');
      for (let i = 0; i < 6; i++) {
        const st = statueTpl.clone(true);
        st.scale.setScalar(4.2);
        const a = i / 6 * Math.PI * 2 + 0.2, r = 1750;
        put(st, C + Math.cos(a) * r, C + Math.sin(a) * r, 0, a + Math.PI);
      }
      // 성벽 실루엣 (5면을 한 오브젝트로 묶는다)
      const wm = mat('#1e1512', { rough: 1, flat: true });
      const glowM = mat('#ff7a1e', { emissive: '#ff5a0a', emissiveIntensity: 2.2, rough: 1 });
      const walls = new T.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4, r = 2150;
        const w = new T.Group();
        w.add(box(900, 240, 90, wm, 0, 120, 0));
        for (let j = -6; j <= 6; j++) w.add(box(46, 40, 100, wm, j * 68, 258, 0));
        for (let j = -2; j <= 2; j++) w.add(box(28, 44, 12, glowM, j * 180, 140, 48));
        w.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        w.rotation.y = a + Math.PI / 2;
        walls.add(w);
      }
      put(walls, C, C, 0, 0);
    }
    return items;
  }

  /** 배경 랜드마크 (성 / 요새 / 토성) */
  function buildLandmark(theme) {
    const g = new T.Group();
    if (theme === 'circuit') {
      const wall = mat('#eae4d8', { rough: 0.9 });
      const roof = mat('#e04a3a', { rough: 0.7 });
      g.add(box(300, 200, 220, wall, 0, 100, 0));
      g.add(box(140, 300, 140, wall, 0, 150, 0));
      const towers = [[-150, 150, -110], [150, 150, -110], [-150, 150, 110], [150, 150, 110], [0, 330, 0]];
      towers.forEach((t, i) => {
        const h = i === 4 ? 90 : 210;
        g.add(cyl(34, 38, h, wall, t[0], t[1] + h / 2 - (i === 4 ? 40 : 60), t[2], 14));
        g.add(cone(46, 90, roof, t[0], t[1] + h - (i === 4 ? 0 : 15), t[2], 14));
      });
      const glass = mat('#3a6fbf', { rough: 0.2, metal: 0.5, emissive: '#12306a', emissiveIntensity: 0.6 });
      const win = cyl(26, 26, 8, glass, 0, 250, 112, 18);
      win.rotation.x = Math.PI / 2;
      g.add(win);
    } else if (theme === 'bowser') {
      const wall = mat('#241a16', { rough: 0.95, flat: true });
      g.add(box(420, 260, 240, wall, 0, 130, 0));
      for (let i = 0; i < 9; i++) g.add(box(28, 34, 30, wall, -196 + i * 49, 275, 110));
      [[-210, 0], [210, 0]].forEach(t => {
        g.add(cyl(48, 56, 340, wall, t[0], 170, t[1], 12));
        g.add(cone(64, 110, mat('#5a1a10', { rough: 0.9 }), t[0], 395, t[1], 12));
      });
      const glow = mat('#ff7a1e', { emissive: '#ff5a0a', emissiveIntensity: 2.4, rough: 1 });
      for (let i = 0; i < 6; i++) {
        const w = box(22, 34, 6, glow, -140 + i * 56, 150, 122);
        w.castShadow = false;
        g.add(w);
      }
    } else {
      const planet = sphere(220, new T.MeshStandardMaterial({
        color: new T.Color('#d8a860'), roughness: 0.85,
        emissive: new T.Color('#3a2a10'), emissiveIntensity: 0.5
      }), 0, 0, 0, 32);
      planet.castShadow = false; planet.receiveShadow = false;
      g.add(planet);
      const ringM = new T.MeshBasicMaterial({
        color: new T.Color('#e8d2a8'), transparent: true, opacity: 0.55, side: T.DoubleSide
      });
      const ring = mesh(new T.RingGeometry(280, 420, 64), ringM);
      ring.rotation.x = -Math.PI / 2.5;
      ring.rotation.z = 0.4;
      ring.castShadow = false;
      g.add(ring);
      const ring2 = mesh(new T.RingGeometry(440, 500, 64), new T.MeshBasicMaterial({
        color: new T.Color('#c8b088'), transparent: true, opacity: 0.3, side: T.DoubleSide
      }));
      ring2.rotation.copy(ring.rotation);
      ring2.castShadow = false;
      g.add(ring2);
    }
    return g;
  }

  global.Models = { buildKart, buildKartLOD, optimize, buildGantry, buildBackdrop, buildHorizon, lathe, taperBone, buildCharacter, buildItem, buildProp, buildLandmark, mat, mesh, sphere, box, cyl, cone, rounded, starShape, torus, geo };
})(window);
