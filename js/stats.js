/* =============================================================
 * stats.js - 파츠 스탯 합산 & 물리 엔진 제어 값 변환
 *
 *   [캐릭터 Base] + [프레임] + [바퀴] + [글라이더]  ->  최종 스탯(0~10)
 *   최종 스탯 -> 물리 파라미터(최대 토크 / 타이어 마찰 계수 / 질량 / 회전 관성)
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const STAT_MAX = 10;

  function clampStat(v) {
    return Math.max(0.25, Math.min(STAT_MAX, v));
  }

  /** 4개 파츠의 스탯을 합산해 최종 스탯 오브젝트를 만든다. */
  function combine(character, frame, wheel, glider) {
    const out = {};
    for (const k of D.STAT_KEYS) {
      out[k] = clampStat(
        (character.stats[k] || 0) +
        (frame.stats[k] || 0) +
        (wheel.stats[k] || 0) +
        (glider.stats[k] || 0)
      );
    }
    return out;
  }

  /**
   * 최종 스탯 -> 실제 주행 물리에 피드백되는 제어 값.
   *  mass          : 질량 (충돌 밀어내기 / 관성)
   *  inertia       : 회전 관성 (클수록 방향 전환이 굼뜸)
   *  maxTorque     : 최대 엔진 토크 (가속도 산출)
   *  maxSpeed      : 최고 속도 (world unit / sec)
   *  tireFriction  : 타이어 마찰 계수 (횡활 억제력)
   *  steerRate     : 조향 각속도 (rad/s)
   *  offroadGrip   : 오프로드 마찰력 (오프로드 최고속 배율)
   *  driftFriction : 드리프트 중 횡마찰
   *  brakeForce    : 제동력
   */
  function toPhysics(stats) {
    const s = stats;
    const mass = 62 + s.weight * 17;                    //  ~ 62 ~ 232
    return {
      mass,
      inertia: 0.55 + s.weight * 0.06 - s.handling * 0.02,
      maxTorque: (330 + s.accel * 78) * (1 + s.weight * 0.012),
      // 실제 적분에 쓰이는 가속도(unit/s^2). 최고속 도달까지 경량 ~1.5s / 중량 ~2.9s
      accelRate: 96 + s.accel * 26 - s.weight * 3.2,
      maxSpeed: 296 + s.speed * 25,                      //  ~ 300 ~ 550
      tireFriction: 5.4 + s.handling * 0.62,
      steerRate: 1.62 + s.handling * 0.135,
      offroadGrip: 0.34 + s.offroad * 0.049,             //  ~ 0.36 ~ 0.83
      driftFriction: 1.5 + s.handling * 0.16,
      brakeForce: 300 + s.weight * 22,
      // 피격 회복: 경량급이 빠르다 (가속 스탯 비례)
      recoverScale: 1.22 - s.accel * 0.045
    };
  }

  /** 스탯 총합 (파츠 비교용) */
  function total(stats) {
    return D.STAT_KEYS.reduce((a, k) => a + stats[k], 0);
  }

  function build(charId, frameId, wheelId, gliderId) {
    const character = D.CHARACTERS.find(c => c.id === charId) || D.CHARACTERS[0];
    const frame = D.FRAMES.find(f => f.id === frameId) || D.FRAMES[0];
    const wheel = D.WHEELS.find(w => w.id === wheelId) || D.WHEELS[0];
    const glider = D.GLIDERS.find(g => g.id === gliderId) || D.GLIDERS[0];
    const stats = combine(character, frame, wheel, glider);
    return {
      character, frame, wheel, glider, stats,
      physics: toPhysics(stats),
      total: total(stats)
    };
  }

  global.Stats = { STAT_MAX, combine, toPhysics, total, build };
})(window);
