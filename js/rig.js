/* =============================================================
 * rig.js - 카트 서스펜션 + 착좌 드라이버 애니메이션
 *   · 차체는 가감속에 따라 피치, 코너에서 롤, 착지에서 히브(상하) 스프링
 *   · 바퀴는 지면에 남고 차체만 움직여 서스펜션처럼 보인다
 *   · 두 팔은 2본 IK 로 실제 스티어링 휠 그립을 잡는다
 *   · 귀 / 꼬리 / 스카프 / 안테나는 관성으로 뒤늦게 따라 흔들린다 (2차 모션)
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;
  const UP = new T.Vector3(0, 1, 0);
  // 임시 벡터는 용도별로 분리한다 (인자와 겹치면 자기 자신을 빼서 영벡터가 된다)
  const _n = new T.Vector3(), _u = new T.Vector3();
  const _sh = new T.Vector3(), _elbow = new T.Vector3(), _grip = new T.Vector3();
  const _pole = new T.Vector3(), _dir = new T.Vector3(), _local = new T.Vector3();
  const _q = new T.Quaternion(), _pq = new T.Quaternion(), _q2 = new T.Quaternion();
  const _e = new T.Euler();

  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

  /** 스프링-댐퍼 1스텝 (약간의 오버슈트로 생기를 준다) */
  function spring(obj, pKey, vKey, target, stiff, damp, dt) {
    const a = (target - obj[pKey]) * stiff - obj[vKey] * damp;
    obj[vKey] += a * dt;
    obj[pKey] += obj[vKey] * dt;
    return obj[pKey];
  }

  /** 2본 IK: shoulder 에서 target 까지 길이 a+b 의 두 마디로 닿게 한다 */
  function solveTwoBone(shoulder, target, a, b, pole, outElbow) {
    _n.subVectors(target, shoulder);
    let d = _n.length();
    const min = Math.abs(a - b) + 0.01, max = a + b - 0.01;
    if (d < min) d = min;
    if (d > max) d = max;
    _n.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const ang = Math.acos(cosA);
    _u.copy(pole).addScaledVector(_n, -pole.dot(_n));
    if (_u.lengthSq() < 1e-6) _u.set(0, -1, 0);
    _u.normalize();
    outElbow.copy(shoulder)
      .addScaledVector(_n, Math.cos(ang) * a)
      .addScaledVector(_u, Math.sin(ang) * a);
    return d;
  }

  /** 노드의 +Y 축이 from -> to 방향을 향하도록 (부모 공간 기준) */
  function aimY(node, fromWorld, toWorld, parent) {
    _dir.set(toWorld.x - fromWorld.x, toWorld.y - fromWorld.y, toWorld.z - fromWorld.z);
    if (_dir.lengthSq() < 1e-8) return;
    parent.getWorldQuaternion(_pq).invert();
    _local.copy(_dir).applyQuaternion(_pq).normalize();
    node.quaternion.setFromUnitVectors(UP, _local);
  }

  const Rig = {
    update(kartModel, k, dt, time) {
      const rig = kartModel.userData.rig;
      const steerObj = kartModel.userData.steer;
      const bodyNode = kartModel.userData.body;
      if (!rig || dt <= 0) return;

      const hurt = k.state === 'SPINOUT' || k.state === 'KNOCKBACK';
      const stRaw = k.input ? (k.input.steer || 0) : 0;
      const sr = clamp(k.speedRatio || 0, 0, 1.2);

      // 상태 저장소
      const S = rig._s || (rig._s = {
        pitch: 0, vp: 0, roll: 0, vr: 0, heave: 0, vh: 0,
        tp: 0, vtp: 0, tr: 0, vtr: 0, bob: 0, vbob: 0,
        headY: 0, vhy: 0, nod: 0, vnod: 0, tilt: 0, vtilt: 0,
        lid: 0, vlid: 0, brY: 0, vbrY: 0, brA: 0, vbrA: 0,
        blinkT: 1.2 + (k.id || 0) * 0.73, blinkP: 0,
        st: 0, vst: 0, prevSpeed: 0, prevZ: 0, acc: 0, hurtT: 0, mix: 0
      });

      /* ---- 입력/피격 상태를 먼저 부드럽게 만든다 (스냅 방지) ---- */
      // 조향은 입력이 계단식(-1/0/1)이라 스프링으로 흘려보내야 손이 튀지 않는다
      spring(S, 'st', 'vst', stRaw, 150, 21, dt);
      const st = clamp(S.st, -1.15, 1.15);
      const steerAng = st * 0.55 + (k.drifting ? k.driftDir * 0.32 : 0);
      S.hurtT = hurt ? S.hurtT + dt : 0;
      S.mix += ((hurt ? 1 : 0) - S.mix) * Math.min(1, dt * (hurt ? 16 : 5));
      const mix = S.mix;
      // 피격 몸부림은 시간이 지날수록 잦아든다 (등속 진동은 기계처럼 보인다)
      const fade = Math.exp(-S.hurtT * 1.25);

      /* ---- 가속도 추정 (저역 통과로 노이즈 제거) ---- */
      const rawAcc = (k.speed - S.prevSpeed) / dt;
      S.prevSpeed = k.speed;
      S.acc += (clamp(rawAcc, -3000, 3000) - S.acc) * Math.min(1, dt * 12);
      const latF = (k.vlat || 0) * 0.006 + st * sr * 0.55;

      /* ---- 차체 서스펜션 ---- */
      const landed = S.prevZ > 2.5 && k.z <= 0.5;
      if (bodyNode) {
        if (landed) S.vh -= 52;                          // 착지 충격
        S.prevZ = k.z;
        const tPitch = clamp(-S.acc * 0.00042, -0.10, 0.10) + (k.boostTimer > 0 ? -0.035 : 0);
        const tRoll = clamp(-latF * 0.10, -0.14, 0.14) + (k.drifting ? k.driftDir * 0.09 : 0);
        spring(S, 'pitch', 'vp', hurt ? 0 : tPitch, 62, 10, dt);
        spring(S, 'roll', 'vr', hurt ? 0 : tRoll, 68, 10, dt);
        spring(S, 'heave', 'vh', 0, 110, 12, dt);
        bodyNode.rotation.z = S.pitch;
        bodyNode.rotation.x = S.roll;
        bodyNode.position.y = clamp(S.heave, -4, 4);
        // 바퀴는 지면에 남고 차체만 움직인다 (반대 방향 보정)
        const wheels = kartModel.userData.wheels;
        if (wheels) {
          for (const w of wheels) {
            const f = w.userData.front ? 1 : -1;
            w.position.y = (w.userData.baseY || w.position.y) - S.pitch * f * 9 - S.heave * 0.45;
          }
        }
      } else {
        S.prevZ = k.z;
      }

      /* ---- 상체: 속도로 웅크리고, 가감속 관성으로 젖혀지고, 코너 안쪽으로 기운다 ---- */
      // +z 는 뒤로 젖힘 / -z 는 앞으로 숙임, +x 는 카트 오른쪽으로 기움
      let pitch = 0.10 - sr * 0.15 + clamp(S.acc * 0.00050, -0.15, 0.15);
      if (k.boostTimer > 0) pitch -= 0.08;
      let roll = steerAng * 0.34;
      if (mix > 0.002) {
        const fr = 0.14 + Math.sin(S.hurtT * 7.4) * 0.60 * fade;
        const fp = -0.30 - Math.sin(S.hurtT * 5.1 + 0.8) * 0.30 * fade;
        roll += (fr - roll) * mix;
        pitch += (fp - pitch) * mix;
      }
      // 스프링으로 받아 살짝 오버슈트시킨다 (선형 보간은 로봇처럼 보인다)
      spring(S, 'tp', 'vtp', pitch, 88, 13, dt);
      spring(S, 'tr', 'vtr', roll, 96, 14, dt);
      rig.torso.rotation.z = S.tp;
      rig.torso.rotation.x = S.tr;

      // 정차 중 숨쉬기 · 착지 충격 흡수 · 넉백 들썩임
      if (rig.torso.userData.baseY === undefined) rig.torso.userData.baseY = rig.torso.position.y;
      if (landed) S.vbob -= 24;                          // 상체는 차체보다 늦게 주저앉는다
      spring(S, 'bob', 'vbob', 0, 92, 11, dt);
      const idle = clamp(1 - Math.abs(k.speed) / 70, 0, 1) * (1 - mix);
      const breath = Math.sin(time * 1.9) * 0.55 * idle;
      const hop = k.state === 'KNOCKBACK' ? Math.sin(S.hurtT * 11) * 1.6 * fade : 0;
      rig.torso.position.y = rig.torso.userData.baseY + hop + breath + clamp(S.bob, -3, 3);

      /* ---- 머리: 코너 안쪽을 늦게 따라보고, 시선은 수평을 유지한다 ---- */
      let lookT = -steerAng * 0.60;
      if (mix > 0.002) lookT += (Math.sin(S.hurtT * 6.3) * 0.75 * fade - lookT) * mix;
      spring(S, 'headY', 'vhy', lookT, 78, 12, dt);
      rig.head.rotation.y = S.headY;

      // 노면 진동은 두 개의 느린 사인을 겹쳐 규칙성을 없앤다 (단일 고주파는 떨림으로 보인다)
      const jit = (Math.sin(time * 5.9 + k.id * 1.7) + 0.45 * Math.sin(time * 9.3 + k.id * 2.9))
                  * 0.016 * (0.2 + sr);
      let nod = jit - S.tp * 0.45 + Math.sin(time * 1.9 - 0.7) * 0.035 * idle;
      if (mix > 0.002) nod += (-0.34 - Math.sin(S.hurtT * 8.1) * 0.22 * fade - nod) * mix;
      spring(S, 'nod', 'vnod', nod, 120, 15, dt);
      rig.head.rotation.z = S.nod;
      // 목도 코너 쪽으로 살짝 기운다
      spring(S, 'tilt', 'vtilt', steerAng * 0.14 * (1 - mix), 90, 13, dt);
      rig.head.rotation.x = S.tilt;

      /* ---- 표정: 눈꺼풀 + 눈썹 ----
       * 얼굴이 고정돼 있으면 아무리 잘 렌더해도 인형으로 보인다.
       * 눈꺼풀 rotation.z 는 + 가 감는 방향, 눈썹은 side*(-) 가 화난 각도다 (렌더로 확인).
       */
      const face = rig.face;
      if (face && face.lids.length) {
        // 깜빡임: 몇 초에 한 번, 0.16초 동안 감았다 뜬다. 캐릭터마다 주기를 어긋나게 한다
        S.blinkT -= dt;
        if (S.blinkT <= 0) { S.blinkT = 2.6 + Math.random() * 3.6; S.blinkP = 0.16; }
        if (S.blinkP > 0) S.blinkP -= dt;
        const blink = S.blinkP > 0
          ? Math.sin((0.16 - S.blinkP) / 0.16 * Math.PI) * (1 - mix) : 0;

        // 기본 표정: 빠를수록 바람에 눈을 가늘게 뜬다
        let lidT = 0.04 + sr * 0.17;
        let brY = 0, brA = 0;
        if (k.boostTimer > 0) { lidT += 0.13; brA -= 0.30; brY -= 0.5; }   // 결연
        if (k.drifting) { brA -= 0.26; brY -= 0.35; }
        if (mix > 0.002) {
          // 피격: 눈을 크게 뜨고 눈썹이 확 올라간다 (놀람)
          lidT += (-0.45 - lidT) * mix;
          brY += (1.5 - brY) * mix;   // 너무 올리면 고글·뿔 같은 머리 장식과 겹친다
          brA += (0.45 - brA) * mix;
        }
        spring(S, 'lid', 'vlid', lidT, 140, 18, dt);
        spring(S, 'brY', 'vbrY', brY, 120, 16, dt);
        spring(S, 'brA', 'vbrA', brA, 110, 15, dt);

        // 깜빡임은 스프링 밖에서 더한다 (스프링을 통과시키면 뭉개진다)
        const lidNow = S.lid + blink * (0.92 - S.lid);
        for (const l of face.lids) l.node.rotation.z = l.rest + lidNow;
        for (const w of face.brows) {
          w.node.position.y = w.baseY + S.brY;
          w.node.rotation.x = w.side * S.brA;
        }
      }

      /* ---- 2차 모션: 귀 / 꼬리 / 스카프 / 안테나 ---- */
      if (rig.wobblers && rig.wobblers.length) {
        const along = clamp(-S.acc * 0.0011, -1.3, 1.3);   // 가속 관성 (뒤로)
        const wind = -(sr * sr) * 1.9;                     // 주행풍은 언제나 뒤로 눕힌다
        const side = clamp(-latF * 0.95, -1.6, 1.6);
        const flut = sr * sr * 0.16;                       // 고속 펄럭임
        for (const w of rig.wobblers) {
          if (w.ph === undefined) w.ph = (w.gz * 7.3 + w.stiff * 0.13) % 6.283;
          const g = w.gx * 12;
          let tf = (along + wind) * g + Math.sin(time * 8.4 + w.ph) * flut;
          let ts = side * w.gz * 0.5 + Math.sin(time * 6.7 + w.ph * 1.7) * flut * 0.7;
          if (mix > 0.002) {
            tf += (Math.sin(S.hurtT * 8.6 + w.ph) * 0.55 * fade - tf) * mix;
            ts += (Math.cos(S.hurtT * 6.9 + w.ph) * 0.55 * fade - ts) * mix;
          }
          spring(w, 'ax', 'vx', clamp(tf, -w.max, w.max), w.stiff, w.damp, dt);
          spring(w, 'az', 'vz', clamp(ts, -w.max, w.max), w.stiff, w.damp, dt);
          w.node.rotation.z = w.ax;      // 앞뒤로 눕기
          w.node.rotation.x = w.az;      // 좌우로 흔들리기
        }
      }

      /* ---- 팔: 핸들 그립을 IK 로 추종 ---- */
      if (steerObj) {
        steerObj.rotation.z = 0.55 + steerAng * 1.35;
        // 이번 프레임에 바뀐 차체/상체 회전을 반영한 뒤 IK 를 푼다
        kartModel.updateMatrixWorld(true);
        for (const arm of rig.arms) {
          // 휠 토러스는 rotation.y=π/2 로 세워져 로컬 +X 가 월드 -Z 에 대응한다
          const R = 3.5;
          _grip.set(arm.side > 0 ? -R : R, 0, 0);
          steerObj.localToWorld(_grip);

          arm.shoulder.getWorldPosition(_sh);
          _pole.set(0, -1, arm.side * 0.85).normalize();
          _pole.applyQuaternion(kartModel.getWorldQuaternion(_q));
          solveTwoBone(_sh, _grip, arm.a, arm.b, _pole, _elbow);

          aimY(arm.upper, _sh, _elbow, arm.shoulder);
          if (mix > 0.002) {
            // 피격 시엔 만세 자세로 흔들리되, IK 자세와 섞어 팝을 없앤다
            _e.set(-1.9 + Math.sin(S.hurtT * 7.7) * 0.45 * fade, 0,
                   arm.side * 0.4 + Math.sin(S.hurtT * 6.2 + arm.side) * 0.55 * fade);
            _q2.setFromEuler(_e);
            arm.upper.quaternion.slerp(_q2, mix);
          }
          arm.upper.updateMatrixWorld(true);
          arm.elbow.updateMatrixWorld(true);
          aimY(arm.fore, _elbow, _grip, arm.elbow);
          if (mix > 0.002) {
            _e.set(0, 0, -0.5);
            _q2.setFromEuler(_e);
            arm.fore.quaternion.slerp(_q2, mix);
          }
        }
      }
    }
  };

  global.Rig = Rig;
})(window);
