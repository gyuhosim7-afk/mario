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
  function geo(key, factory) {
    if (!geoCache[key]) geoCache[key] = factory();
    return geoCache[key];
  }
  function mat(color, o) {
    o = o || {};
    return new T.MeshStandardMaterial({
      color: new T.Color(color),
      roughness: o.rough === undefined ? 0.65 : o.rough,
      metalness: o.metal === undefined ? 0.05 : o.metal,
      flatShading: !!o.flat,
      emissive: new T.Color(o.emissive || 0x000000),
      emissiveIntensity: o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity,
      transparent: !!o.transparent,
      opacity: o.opacity === undefined ? 1 : o.opacity,
      side: o.side || T.FrontSide
    });
  }
  function mesh(g, m, x, y, z) {
    const s = new T.Mesh(g, m);
    s.position.set(x || 0, y || 0, z || 0);
    s.castShadow = true; s.receiveShadow = true;
    return s;
  }
  function sphere(r, m, x, y, z, seg) {
    return mesh(geo('sph' + (seg || 16) + '_' + r.toFixed(2), () => new T.SphereGeometry(r, seg || 16, (seg || 16) * 0.75)), m, x, y, z);
  }
  function box(w, h, d, m, x, y, z) {
    return mesh(geo('box' + [w, h, d].join('_'), () => new T.BoxGeometry(w, h, d)), m, x, y, z);
  }
  function cyl(rt, rb, h, m, x, y, z, seg) {
    return mesh(geo('cyl' + [rt, rb, h, seg || 16].join('_'), () => new T.CylinderGeometry(rt, rb, h, seg || 16)), m, x, y, z);
  }
  function cone(r, h, m, x, y, z, seg) {
    return mesh(geo('cone' + [r, h, seg || 12].join('_'), () => new T.ConeGeometry(r, h, seg || 12)), m, x, y, z);
  }
  function capsule(r, len, m, x, y, z) {
    return mesh(geo('cap' + r + '_' + len, () => new T.CapsuleGeometry(r, len, 6, 14)), m, x, y, z);
  }
  function torus(r, tube, m, x, y, z, arc) {
    return mesh(geo('tor' + [r, tube, arc || 6.283].join('_'),
      () => new T.TorusGeometry(r, tube, 10, 26, arc || Math.PI * 2)), m, x, y, z);
  }
  function rounded(w, h, d, r, m) {
    // 베벨 처리된 판 형태 (ExtrudeGeometry)
    const key = 'rnd' + [w, h, d, r].join('_');
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
      const gg = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: r * 0.4, bevelThickness: r * 0.4, bevelSegments: 2, curveSegments: 6 });
      gg.translate(0, 0, -d / 2);
      gg.rotateX(Math.PI / 2);
      return gg;
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
   * 캐릭터
   * ============================================================= */
  function buildCharacter(ch) {
    const g = new T.Group();
    const c = ch.colors;
    const heavy = ch.cls === 'heavy', light = ch.cls === 'light';
    const S = heavy ? 1.24 : (light ? 0.84 : 1.0);      // 체급 스케일

    const skin = mat(c.skin, { rough: 0.72 });
    const cloth = mat(c.vest, { rough: 0.85 });
    const dark = mat('#2a2a32', { rough: 0.6 });
    const white = mat('#f6f6f6', { rough: 0.5 });
    const black = mat('#15151c', { rough: 0.4 });

    // 몸통
    const torso = capsule(6.6 * S, 5.2 * S, cloth, 0, 6.5 * S, 0);
    torso.scale.set(1.05, 1, 0.9);
    g.add(torso);

    // 팔 (핸들을 쥔 자세)
    const armMat = ch.id === 'dk' || ch.id === 'bowser' ? skin : cloth;
    [-1, 1].forEach(side => {
      const arm = capsule(2.1 * S, 6.4 * S, armMat, 3.8 * S, 7.6 * S, side * 5.2 * S);
      arm.rotation.z = -1.12;
      arm.rotation.x = side * 0.25;
      g.add(arm);
      const glove = sphere(2.5 * S, ch.id === 'bowser' || ch.id === 'dk' ? skin : white, 8.4 * S, 8.6 * S, side * 4.0 * S, 12);
      g.add(glove);
    });

    // 머리
    const headY = 15.4 * S;
    const headR = (ch.id === 'bowser' ? 6.4 : ch.id === 'toad' ? 5.2 : 5.6) * S;
    const head = sphere(headR, skin, 0, headY, 0, 18);
    head.scale.set(1, 1.02, 0.96);
    g.add(head);
    g.userData.head = head;

    // 눈 + 눈썹
    const brow = mat(ch.id === 'bowser' ? '#7a4a1a' : (ch.id === 'peach' ? '#c9a24a' : '#4a2c17'), { rough: 0.9 });
    [-1, 1].forEach(side => {
      const eye = sphere(1.55 * S, white, headR * 0.72, headY + headR * 0.16, side * headR * 0.42, 12);
      eye.scale.set(0.7, 1.15, 1);
      g.add(eye);
      const pupil = sphere(0.72 * S, black, headR * 0.98, headY + headR * 0.16, side * headR * 0.44, 8);
      pupil.scale.set(0.6, 1.1, 1);
      g.add(pupil);
      // 살짝 찌푸린 눈썹 (레이싱 표정)
      const b = box(0.6 * S, 0.7 * S, 3.0 * S, brow,
        headR * 0.92, headY + headR * 0.62, side * headR * 0.44);
      b.rotation.x = side * 0.28;
      g.add(b);
    });
    // 입
    if (ch.id !== 'bowser' && ch.id !== 'yoshi') {
      const mouth = sphere(1.5 * S, mat('#8a3a30', { rough: 0.8 }), headR * 0.9, headY - headR * 0.52, 0, 10);
      mouth.scale.set(0.45, 0.5, 1.5);
      g.add(mouth);
    }
    // 볼 (경량급 캐릭터에 생기 부여)
    if (light) {
      [-1, 1].forEach(side => {
        const cheek = sphere(1.5 * S, mat('#f4a6a0', { rough: 0.9 }), headR * 0.82, headY - headR * 0.24, side * headR * 0.62, 8);
        cheek.scale.set(0.4, 0.8, 1);
        g.add(cheek);
      });
    }

    /* --- 캐릭터별 특징 --- */
    if (ch.id === 'bowser') {
      // 등껍질 + 흰 뿔 + 갈기
      const shell = sphere(8.4 * S, mat('#3f8f3f', { rough: 0.7 }), -5.2 * S, 7.6 * S, 0, 18);
      shell.scale.set(0.8, 1, 1.05);
      g.add(shell);
      const rim = torus(8.0 * S, 1.5 * S, mat('#e8d9a8', { rough: 0.6 }), -5.2 * S, 7.6 * S, 0);
      rim.rotation.y = Math.PI / 2;
      g.add(rim);
      // 그을린 흰 뿔
      const spikeMat = mat('#efe6cf', { rough: 0.45 });
      const burnt = mat('#6b5a4a', { rough: 0.9 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const sx = -9.2 * S, sy = 7.6 * S + Math.cos(a) * 5.4 * S, sz = Math.sin(a) * 5.6 * S;
        const sp = cone(1.5 * S, 3.6 * S, spikeMat, sx, sy, sz, 8);
        sp.rotation.z = Math.PI / 2;
        g.add(sp);
        const tip = cone(0.85 * S, 1.3 * S, burnt, sx - 1.5 * S, sy, sz, 8);
        tip.rotation.z = Math.PI / 2;
        g.add(tip);
      }
      // 머리 뿔
      [-1, 1].forEach(side => {
        const horn = cone(1.5 * S, 4.6 * S, spikeMat, -1 * S, headY + headR * 0.9, side * headR * 0.66, 8);
        horn.rotation.z = -0.25; horn.rotation.x = side * 0.35;
        g.add(horn);
      });
      // 주둥이 + 이빨 + 붉은 갈기
      const snout = sphere(3.4 * S, skin, headR * 0.86, headY - headR * 0.24, 0, 14);
      snout.scale.set(1.15, 0.78, 1);
      g.add(snout);
      [-1, 1].forEach(side => {
        const tooth = cone(0.7 * S, 1.9 * S, white, headR * 1.15, headY - headR * 0.62, side * 1.5 * S, 6);
        tooth.rotation.x = Math.PI;
        g.add(tooth);
      });
      const hairMat = mat('#e0501e', { rough: 0.8 });
      for (let i = 0; i < 5; i++) {
        const s2 = sphere((2.2 - i * 0.25) * S, hairMat, (-2.6 - i * 1.1) * S, headY + (3.6 - i * 0.5) * S, 0, 10);
        g.add(s2);
      }
      // 징 박힌 팔찌
      [-1, 1].forEach(side => {
        const band = torus(2.7 * S, 0.85 * S, mat('#6b4a2a', { rough: 0.8 }), 6.0 * S, 9.6 * S, side * 4.6 * S);
        band.rotation.y = Math.PI / 2; band.rotation.x = 0.6;
        g.add(band);
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2;
          g.add(cone(0.55 * S, 1.1 * S, mat('#d8d8de', { metal: 0.7, rough: 0.3 }),
            6.0 * S + Math.cos(a) * 2.7 * S, 9.6 * S + Math.sin(a) * 2.7 * S, side * 4.6 * S, 6));
        }
      });
    } else if (ch.id === 'toad') {
      // 젤리 광택 양송이 캡
      const capMat = new T.MeshPhysicalMaterial({
        color: new T.Color('#fbf6ea'), roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0.6
      });
      const cap = sphere(9.2 * S, capMat, 0, headY + headR * 0.55, 0, 20);
      cap.scale.set(1, 0.62, 1);
      g.add(cap);
      const spotMat = mat(c.spot, { rough: 0.35 });
      [[0.75, 0, 0], [-0.4, 0, 0.72], [-0.4, 0, -0.72], [0.15, 0.62, 0.3]].forEach(o => {
        const sp = sphere(2.7 * S, spotMat, o[0] * 8.4 * S, headY + headR * 0.55 + o[1] * 5.2 * S, o[2] * 8.4 * S, 12);
        sp.scale.set(1, 0.45, 1);
        sp.lookAt(0, headY + headR * 0.2, 0);
        g.add(sp);
      });
      // 파란 금테 조끼
      const vest = capsule(6.7 * S, 3.4 * S, mat('#2f6fd0', { rough: 0.7 }), 0, 6.2 * S, 0);
      vest.scale.set(1.06, 1, 0.92);
      g.add(vest);
      const trim = torus(5.6 * S, 0.6 * S, mat('#f5c542', { metal: 0.6, rough: 0.3 }), 0, 8.6 * S, 0);
      trim.rotation.x = Math.PI / 2;
      g.add(trim);
    } else if (ch.id === 'yoshi') {
      const snout = capsule(3.3 * S, 3.2 * S, skin, headR * 0.95, headY - headR * 0.18, 0);
      snout.rotation.z = Math.PI / 2;
      g.add(snout);
      [-1, 1].forEach(side => g.add(sphere(0.6 * S, black, headR * 1.9, headY + headR * 0.05, side * 1.3 * S, 8)));
      // 등딱지 안장
      const saddle = sphere(5.6 * S, mat('#e56f2f', { rough: 0.8 }), -4.4 * S, 7.4 * S, 0, 14);
      saddle.scale.set(0.7, 0.8, 1);
      g.add(saddle);
    } else if (ch.id === 'dk') {
      const muzzle = sphere(3.6 * S, mat('#d9b48a', { rough: 0.8 }), headR * 0.8, headY - headR * 0.3, 0, 14);
      muzzle.scale.set(1, 0.8, 1.05);
      g.add(muzzle);
      const tie = rounded(6.2 * S, 8.4 * S, 1.1 * S, 1.2 * S, mat('#c0392b', { rough: 0.7 }));
      tie.position.set(5.4 * S, 6.4 * S, 0);
      tie.rotation.z = Math.PI / 2;
      g.add(tie);
    } else if (ch.id === 'peach') {
      // 금발 + 왕관
      const hair = sphere(6.4 * S, mat('#f2d98a', { rough: 0.55 }), -1.2 * S, headY + 0.4 * S, 0, 16);
      hair.scale.set(0.95, 1.05, 1.05);
      g.add(hair);
      const crown = cyl(3.1 * S, 2.6 * S, 1.7 * S, mat('#f4d03f', { metal: 0.75, rough: 0.25 }), -0.4 * S, headY + headR * 0.95, 0, 12);
      g.add(crown);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        g.add(cone(0.7 * S, 1.5 * S, mat('#f4d03f', { metal: 0.75, rough: 0.25 }),
          -0.4 * S + Math.cos(a) * 2.7 * S, headY + headR * 0.95 + 1.4 * S, Math.sin(a) * 2.7 * S, 6));
      }
      g.add(sphere(0.9 * S, mat('#3f6fd0', { metal: 0.4, rough: 0.2, emissive: '#12306a' }), 2.4 * S, headY + headR * 1.05, 0, 10));
    }

    // 모자 (마리오 / 루이지 / 베이비 마리오 / DK)
    if (['mario', 'luigi', 'babymario', 'dk'].indexOf(ch.id) >= 0) {
      const capMat = mat(c.cap, { rough: 0.7 });
      const crown = sphere(headR * 1.04, capMat, 0, headY + headR * 0.34, 0, 16);
      crown.scale.set(1, 0.66, 1);
      g.add(crown);
      const brim = cyl(headR * 1.02, headR * 1.02, 0.9 * S, capMat, headR * 0.72, headY + headR * 0.12, 0, 16);
      brim.scale.set(1.05, 1, 1.25);
      g.add(brim);
      if (ch.id !== 'dk') {
        const disc = cyl(2.1 * S, 2.1 * S, 0.5 * S, mat('#ffffff', { rough: 0.4 }), headR * 0.92, headY + headR * 0.5, 0, 14);
        disc.rotation.z = Math.PI / 2;
        g.add(disc);
        const emb = cyl(1.3 * S, 1.3 * S, 0.55 * S, mat(c.cap === '#37a34a' ? '#2a7a35' : '#c0271f', { rough: 0.5 }), headR * 1.06, headY + headR * 0.5, 0, 12);
        emb.rotation.z = Math.PI / 2;
        g.add(emb);
      }
      // 코 + 콧수염
      if (ch.id !== 'dk') {
        g.add(sphere(1.8 * S, skin, headR * 0.95, headY - headR * 0.06, 0, 12));
        [-1, 1].forEach(side => {
          const mst = sphere(1.9 * S, mat('#4a2c17', { rough: 0.9 }), headR * 0.86, headY - headR * 0.42, side * 1.7 * S, 10);
          mst.scale.set(0.75, 0.5, 1.25);
          g.add(mst);
        });
      }
    }

    g.userData.scaleClass = S;
    return g;
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
    const bodyMat = new T.MeshPhysicalMaterial({
      color: new T.Color(bodyColor), roughness: 0.24, metalness: 0.4,
      clearcoat: 0.95, clearcoatRoughness: 0.08
    });
    const accentMat = new T.MeshPhysicalMaterial({
      color: new T.Color(ch.colors.trim || '#f4d03f'), roughness: 0.3, metalness: 0.5, clearcoat: 0.6
    });
    const darkMat = mat('#25252c', { rough: 0.5, metal: 0.3 });
    const chromeMat = mat('#cfd4dc', { rough: 0.16, metal: 0.95 });
    const tireMat = mat(wh.tire, { rough: 0.92, metal: 0 });
    const rimMat = mat(wh.rim, { rough: 0.28, metal: 0.8 });

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
    seat.position.set(-L * 0.12, wr + 5.2, 0);
    g.add(seat);
    const seatBack = rounded(3.2, W * 0.5, 12, 1.6, darkMat);
    seatBack.position.set(-L * 0.26, wr + 10, 0);
    seatBack.rotation.z = 0.16;
    g.add(seatBack);

    // 스티어링 휠
    const steer = torus(3.5, 0.75, darkMat, L * 0.21, wr + 10.2, 0);
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
    driver.position.set(-L * 0.09, wr + 6.2, 0);
    g.add(driver);
    g.userData.driver = driver;

    g.userData.dims = { L, W, wr };
    optimize(g);
    return g;
  }

  /**
   * 정적 파트를 머티리얼 단위로 병합해 드로우콜을 줄인다.
   * userData.dynamic 이 붙은 노드(바퀴/스티어링)와 그 자식은 그대로 둔다.
   */
  function optimize(root) {
    const BGU = T.BufferGeometryUtils;
    if (!BGU || !BGU.mergeGeometries) return root;
    root.updateMatrixWorld(true);
    const groups = new Map();
    const remove = [];
    (function walk(o, dynamic) {
      const dyn = dynamic || !!o.userData.dynamic;
      if (o.isMesh && !dyn) {
        const key = o.material;
        if (!groups.has(key)) groups.set(key, []);
        // 인덱스 유무가 섞이면 병합이 실패하므로 전부 non-indexed 로 통일
        let gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        gg.applyMatrix4(o.matrixWorld);
        // 병합 호환을 위해 필요한 속성만 남긴다
        for (const name of Object.keys(gg.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') gg.deleteAttribute(name);
        }
        if (!gg.attributes.uv) {
          const n = gg.attributes.position.count;
          gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2));
        }
        groups.get(key).push(gg);
        remove.push(o);
      }
      for (const c of o.children.slice()) walk(c, dyn);
    })(root, false);

    for (const o of remove) if (o.parent) o.parent.remove(o);
    groups.forEach((geos, material) => {
      let merged;
      try { merged = BGU.mergeGeometries(geos, false); } catch (e) { merged = null; }
      geos.forEach(gg => gg.dispose && gg.dispose());
      if (!merged) return;
      const m = new T.Mesh(merged, material);
      m.castShadow = true; m.receiveShadow = true;
      root.add(m);
    });
    // 빈 그룹 정리
    for (const c of root.children.slice()) {
      if (c.isGroup && c.children.length === 0) root.remove(c);
    }
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

  /** 배경 랜드마크 (피치 성 / 쿠파 성 / 토성) */
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

  global.Models = { buildKart, optimize, buildCharacter, buildItem, buildProp, buildLandmark, mat, mesh, sphere, box, cyl, cone, rounded, starShape, torus, geo };
})(window);
