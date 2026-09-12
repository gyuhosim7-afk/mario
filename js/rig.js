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
  const _q = new T.Quaternion(), _pq = new T.Quaternion();

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
      const st = k.input ? (k.input.steer || 0) : 0;
      const steerAng = st * 0.55 + (k.drifting ? k.driftDir * 0.32 : 0);
      const sr = clamp(k.speedRatio || 0, 0, 1.2);
      const lerp = Math.min(1, dt * 9);

      // 상태 저장소
      const S = rig._s || (rig._s = {
        pitch: 0, vp: 0, roll: 0, vr: 0, heave: 0, vh: 0,
        headY: 0, vhy: 0, prevSpeed: 0, prevZ: 0, acc: 0
      });

      /* ---- 가속도 추정 (저역 통과로 노이즈 제거) ---- */
      const rawAcc = (k.speed - S.prevSpeed) / dt;
      S.prevSpeed = k.speed;
      S.acc += (clamp(rawAcc, -3000, 3000) - S.acc) * Math.min(1, dt * 12);
      const latF = (k.vlat || 0) * 0.006 + st * sr * 0.55;

      /* ---- 차체 서스펜션 ---- */
      if (bodyNode) {
        if (S.prevZ > 2.5 && k.z <= 0.5) S.vh -= 52;      // 착지 충격
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
      }

      /* ---- 상체 ---- */
      let roll = -steerAng * 0.30;
      let pitch = 0.09 + sr * 0.12;
      if (k.boostTimer > 0) pitch += 0.09;
      if (k.input && k.input.brake) pitch -= 0.15;
      if (hurt) { roll = Math.sin(time * 22) * 0.5; pitch = -0.3; }
      rig.torso.rotation.z += (pitch - rig.torso.rotation.z) * lerp;
      rig.torso.rotation.x += (roll - rig.torso.rotation.x) * lerp;

      // 정차 중 숨쉬기 + 넉백 들썩임
      if (rig.torso.userData.baseY === undefined) rig.torso.userData.baseY = rig.torso.position.y;
      const hop = k.state === 'KNOCKBACK' ? Math.sin(time * 18) * 1.8 : 0;
      const breath = Math.abs(k.speed) < 40 && !hurt ? Math.sin(time * 2.2) * 0.35 : 0;
      rig.torso.position.y = rig.torso.userData.baseY + hop + breath;

      /* ---- 머리: 스프링으로 코너 안쪽을 늦게 따라본다 ---- */
      const lookT = hurt ? Math.sin(time * 17) * 0.6 : -steerAng * 0.55;
      spring(S, 'headY', 'vhy', lookT, 90, 12, dt);
      rig.head.rotation.y = S.headY;
      const bob = Math.sin(time * 13 + k.id * 1.7) * 0.03 * (0.3 + sr);
      rig.head.rotation.z += ((hurt ? -0.4 : bob) - rig.head.rotation.z) * lerp;

      /* ---- 2차 모션: 귀 / 꼬리 / 스카프 / 안테나 ---- */
      if (rig.wobblers && rig.wobblers.length) {
        const along = clamp(-S.acc * 0.0012, -1.6, 1.6);      // 가속하면 뒤로 젖혀짐
        const side = clamp(-latF * 0.9, -1.6, 1.6);
        const windBack = sr * 0.5;                            // 주행풍
        for (const w of rig.wobblers) {
          const tf = clamp((along + windBack) * w.gx * 12, -w.max, w.max);
          const ts = clamp(side * w.gz * 0.5, -w.max, w.max);
          spring(w, 'ax', 'vx', hurt ? Math.sin(time * 15) * 0.4 : tf, w.stiff, w.damp, dt);
          spring(w, 'az', 'vz', hurt ? Math.cos(time * 13) * 0.4 : ts, w.stiff, w.damp, dt);
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
          if (hurt) {
            arm.upper.rotation.set(-2.0 + Math.sin(time * 15) * 0.4, 0,
              arm.side * 0.4 + Math.sin(time * 19 + arm.side) * 0.5);
            arm.fore.rotation.set(0, 0, -0.5);
            continue;
          }
          // 휠 토러스는 rotation.y=π/2 로 세워져 로컬 +X 가 월드 -Z 에 대응한다
          const R = 3.5;
          _grip.set(arm.side > 0 ? -R : R, 0, 0);
          steerObj.localToWorld(_grip);

          arm.shoulder.getWorldPosition(_sh);
          _pole.set(0, -1, arm.side * 0.85).normalize();
          _pole.applyQuaternion(kartModel.getWorldQuaternion(_q));
          solveTwoBone(_sh, _grip, arm.a, arm.b, _pole, _elbow);

          aimY(arm.upper, _sh, _elbow, arm.shoulder);
          arm.upper.updateMatrixWorld(true);
          arm.elbow.updateMatrixWorld(true);
          aimY(arm.fore, _elbow, _grip, arm.elbow);
        }
      }
    }
  };

  global.Rig = Rig;
})(window);
