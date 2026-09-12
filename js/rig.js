/* =============================================================
 * rig.js - 착좌 드라이버 애니메이션
 *   · 두 팔은 2본 IK 로 실제 스티어링 휠 그립을 잡는다 (조향에 따라 같이 회전)
 *   · 상체는 코너에서 롤, 가감속에서 피치
 *   · 머리는 코너 안쪽을 보고 노면 진동에 따라 흔들린다
 *   · 스핀아웃 / 넉백 시 팔다리가 풀린 반응
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;
  const UP = new T.Vector3(0, 1, 0);
  // 주의: 아래 임시 벡터들은 서로 다른 용도로만 쓴다.
  // 같은 벡터를 인자와 출력에 겹쳐 쓰면 자기 자신을 빼서 영벡터가 된다.
  const _n = new T.Vector3(), _u = new T.Vector3();
  const _sh = new T.Vector3(), _elbow = new T.Vector3(), _grip = new T.Vector3();
  const _pole = new T.Vector3(), _dir = new T.Vector3(), _local = new T.Vector3();
  const _q = new T.Quaternion(), _pq = new T.Quaternion();

  /**
   * 2본 IK: shoulder 에서 target 까지 길이 a+b 의 두 마디로 닿게 한다.
   * pole 방향으로 팔꿈치를 밀어 자연스러운 굽힘을 만든다.
   */
  function solveTwoBone(shoulder, target, a, b, pole, outElbow) {
    _n.subVectors(target, shoulder);
    let d = _n.length();
    const min = Math.abs(a - b) + 0.01, max = a + b - 0.01;
    if (d < min) d = min;
    if (d > max) d = max;
    _n.normalize();
    // 팔꿈치까지의 각도 (코사인 법칙)
    const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
    const ang = Math.acos(cosA);
    // pole 을 n 에 수직인 성분으로 (그람-슈미트)
    _u.copy(pole).addScaledVector(_n, -pole.dot(_n));
    if (_u.lengthSq() < 1e-6) _u.set(0, -1, 0).addScaledVector(_n, -_n.y * -1);
    _u.normalize();
    outElbow.copy(shoulder)
      .addScaledVector(_n, Math.cos(ang) * a)
      .addScaledVector(_u, Math.sin(ang) * a);
    return d;
  }

  /** 노드의 +Y 축이 from -> to 방향을 향하도록 (부모 공간 기준) */
  function aimY(node, fromWorld, toWorld, parent) {
    // 성분 단위로 빼서 인자 앨리어싱에 안전하게
    _dir.set(toWorld.x - fromWorld.x, toWorld.y - fromWorld.y, toWorld.z - fromWorld.z);
    if (_dir.lengthSq() < 1e-8) return;
    parent.getWorldQuaternion(_pq).invert();
    _local.copy(_dir).applyQuaternion(_pq).normalize();
    node.quaternion.setFromUnitVectors(UP, _local);
  }

  const Rig = {
    /**
     * @param {THREE.Group} kartModel  buildKart 결과
     * @param {Kart} k                 게임 카트 상태
     */
    update(kartModel, k, dt, time) {
      const rig = kartModel.userData.rig;
      const steerObj = kartModel.userData.steer;
      if (!rig) return;

      const hurt = k.state === 'SPINOUT' || k.state === 'KNOCKBACK';
      const st = k.input ? (k.input.steer || 0) : 0;
      const steerAng = st * 0.55 + (k.drifting ? k.driftDir * 0.32 : 0);
      const sr = Math.max(0, Math.min(1.2, k.speedRatio || 0));
      const lerp = Math.min(1, dt * 9);

      /* ---- 상체: 코너 롤 + 가감속 피치 ---- */
      let roll = -steerAng * 0.34;
      let pitch = 0.10 + sr * 0.13;                       // 고속일수록 앞으로 숙임
      if (k.boostTimer > 0) pitch += 0.10;
      if (k.input && k.input.brake) pitch -= 0.16;
      if (hurt) { roll = Math.sin(time * 22) * 0.5; pitch = -0.3; }
      rig.torso.rotation.z += (pitch - rig.torso.rotation.z) * lerp;
      rig.torso.rotation.x += (roll - rig.torso.rotation.x) * lerp;

      /* ---- 머리: 코너 안쪽 주시 + 노면 진동 ---- */
      const bob = Math.sin(time * 13 + k.id * 1.7) * 0.035 * (0.3 + sr);
      const look = hurt ? Math.sin(time * 17) * 0.6 : -steerAng * 0.5;
      rig.head.rotation.y += (look - rig.head.rotation.y) * lerp;
      rig.head.rotation.z += ((hurt ? -0.4 : bob) - rig.head.rotation.z) * lerp;

      /* ---- 팔: 핸들 그립을 IK 로 추종 ---- */
      if (steerObj) {
        steerObj.rotation.z = 0.55 + steerAng * 1.35;
        // 이번 프레임에 바뀐 상체 회전을 반영한 뒤 IK 를 푼다.
        // (렌더러의 행렬 갱신을 기다리면 한 프레임 늦게 수렴한다)
        kartModel.updateMatrixWorld(true);
        for (const arm of rig.arms) {
          arm.shoulder.updateMatrixWorld(true);
          if (hurt) {
            // 피격 시에는 IK 를 풀고 팔을 위로 흔든다
            arm.upper.rotation.set(0, 0, arm.side * 0.4 + Math.sin(time * 19 + arm.side) * 0.5);
            arm.upper.rotation.x = -2.0 + Math.sin(time * 15) * 0.4;
            arm.fore.rotation.set(0, 0, -0.5);
            continue;
          }
          // 휠 로컬 림 위의 그립 지점 (휠과 함께 회전)
          // 휠 토러스는 rotation.y=π/2 로 세워져 있어 로컬 +X 가 월드 -Z 에 대응한다
          const R = 3.5;
          _grip.set(arm.side > 0 ? -R : R, 0, 0);
          steerObj.localToWorld(_grip);

          arm.shoulder.getWorldPosition(_sh);
          // 팔꿈치는 바깥쪽 아래로 밀어 자연스러운 굽힘을 만든다
          _pole.set(0, -1, arm.side * 0.85).normalize();
          _pole.applyQuaternion(kartModel.getWorldQuaternion(_q));
          solveTwoBone(_sh, _grip, arm.a, arm.b, _pole, _elbow);

          aimY(arm.upper, _sh, _elbow, arm.shoulder);
          arm.upper.updateMatrixWorld(true);
          arm.elbow.updateMatrixWorld(true);
          aimY(arm.fore, _elbow, _grip, arm.elbow);
        }
      }

      /* ---- 넉백 시 상체가 들썩 (골반은 정적 병합 대상이라 건드리지 않는다) ---- */
      const hop = k.state === 'KNOCKBACK' ? Math.sin(time * 18) * 1.8 : 0;
      rig.torso.position.y = rig.torso.userData.baseY === undefined
        ? (rig.torso.userData.baseY = rig.torso.position.y)
        : rig.torso.userData.baseY + hop;
    }
  };

  global.Rig = Rig;
})(window);
