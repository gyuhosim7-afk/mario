/* =============================================================
 * ghost.js - 타임어택 고스트: 내 최고 기록 주행을 반투명 카트로 재생
 *
 * 기록은 localStorage 에 트랙별로 하나씩 남는다. 더 빠른 기록이 나오면
 * 덮어쓴다. AI 가 아니라 '과거의 나'라서 완전히 결정적이고, 코스 이탈도
 * 그대로 재현된다.
 *
 * 저장 형식은 평평한 숫자 배열이다. 샘플마다 객체를 만들면 90초 주행에
 * 1800개가 쌓여 JSON 이 수백 KB 가 된다. 한 샘플 = 숫자 6개로 고정하고
 * 좌표는 소수 첫째 자리까지만 남긴다.
 *
 *   [x, y, z, angle, steer, flags] * n
 *   flags: 1=드리프트 2=드리프트방향(+1일 때) 4=부스트 8=공중
 * ============================================================= */
(function (global) {
  'use strict';

  const KEY = 'skgp.ghost.';
  const HZ = 20;                     // 초당 샘플 수
  const DT = 1 / HZ;
  const STRIDE = 6;
  const VERSION = 1;

  const F_DRIFT = 1, F_DIR = 2, F_BOOST = 4, F_AIR = 8;

  /* ---------------- 저장소 ---------------- */

  function slot(trackId, laps) { return KEY + trackId + '.' + laps; }

  /** 저장된 기록을 읽는다. 없거나 깨졌으면 null (예외를 밖으로 내지 않는다) */
  function load(trackId, laps) {
    try {
      const raw = global.localStorage.getItem(slot(trackId, laps));
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || g.v !== VERSION || !Array.isArray(g.d) || !g.d.length) return null;
      if (typeof g.time !== 'number' || !(g.time > 0)) return null;
      return g;
    } catch (e) {
      return null;                   // 시크릿 모드 · 용량 초과 · 손상
    }
  }

  function save(trackId, laps, rec) {
    try {
      global.localStorage.setItem(slot(trackId, laps), JSON.stringify(rec));
      return true;
    } catch (e) {
      return false;                  // 저장 실패해도 레이스는 계속되어야 한다
    }
  }

  function clear(trackId, laps) {
    try { global.localStorage.removeItem(slot(trackId, laps)); } catch (e) { /* 무시 */ }
  }

  /** 저장된 기록의 완주 시간만 (로비 표시용). 없으면 null */
  function bestTime(trackId, laps) {
    const g = load(trackId, laps);
    return g ? g.time : null;
  }

  /* ---------------- 기록 ---------------- */

  class Recorder {
    constructor(combo) {
      this.combo = combo;
      this.d = [];
      this.acc = 0;
      this.t = 0;
    }
    /**
     * 매 프레임 호출. 20Hz 로 솎아서 담는다.
     *
     * 누산기에서 DT 를 '빼야' 한다. 0 으로 리셋하면 나머지가 매번 버려져서
     * 프레임 간격이 DT 로 안 떨어지는 순간 샘플이 느리게 쌓인다. 예를 들어
     * 프레임이 1/30 초면 실제 간격이 0.0667 초가 되는데 재생은 0.05 초로
     * 읽으므로, 고스트가 실제보다 25% 느리게 간 것으로 계산된다.
     */
    sample(k, dt) {
      this.t += dt;
      if (this.d.length) {
        this.acc += dt;
        if (this.acc < DT) return;
        // 한 프레임이 통째로 길었을 때 빚이 무한정 쌓이지 않게 제한
        this.acc = Math.min(this.acc - DT, DT);
      }
      let f = 0;
      if (k.drifting) { f |= F_DRIFT; if (k.driftDir > 0) f |= F_DIR; }
      if (k.boostTimer > 0) f |= F_BOOST;
      if (k.airborne) f |= F_AIR;
      this.d.push(
        Math.round(k.x * 10) / 10,
        Math.round(k.y * 10) / 10,
        Math.round(k.z * 10) / 10,
        Math.round(k.angle * 1000) / 1000,
        Math.round((k.input.steer || 0) * 100) / 100,
        f
      );
    }
    finish(time) {
      return { v: VERSION, time: time, dt: DT, combo: this.combo, d: this.d };
    }
  }

  /* ---------------- 재생 ---------------- */

  /**
   * 기록을 카트처럼 보이는 객체로 되살린다.
   *
   * 렌더러(_syncKart)와 리그(Rig.update)가 읽는 필드를 전부 갖추고 있어야
   * 진짜 카트와 같은 경로로 그려진다. 물리는 돌지 않는다 - 좌표를 그냥
   * 덮어쓸 뿐이라 충돌·아이템·순위와 완전히 무관하다.
   */
  class Playback {
    constructor(rec) {
      this.rec = rec;
      this.dt = rec.dt || DT;
      this.n = Math.floor(rec.d.length / STRIDE);
      this.combo = rec.combo;
      this.time = rec.time;
      this.done = false;
      // 카트 인터페이스 (물리 없음)
      this.isGhost = true;
      this.isPlayer = false;
      this.id = 99;
      this.name = 'GHOST';
      this.x = 0; this.y = 0; this.z = 0; this.angle = 0;
      this.speed = 0; this.vlat = 0;
      this.scale = 1;
      this.state = 'NORMAL';
      this.spinAngle = 0;
      this.hopT = 0;
      this.drifting = false; this.driftDir = 0; this.driftCharge = 0; this.driftStage = -1;
      this.boostTimer = 0;
      this.airborne = false;
      this.invulnTimer = 0; this.starTimer = 0;
      this.lap = 1; this.finished = false;
      this.input = { steer: 0, throttle: 1, brake: false, drift: false };
      this.phys = { maxSpeed: 400 };
      this.speedRatio = 0;
    }

    at(i, o) { return this.rec.d[i * STRIDE + o]; }

    /**
     * 샘플마다 '트랙을 얼마나 돌았는지'를 미리 계산해 둔다.
     *
     * 이게 있어야 "지금 내 위치에서 고스트는 몇 초였나" 를 뒤져서 시간 차를
     * 띄울 수 있다. 시간축으로 비교하면 안 된다 - 같은 시각의 두 위치는
     * 거리가 다르므로 '몇 초 앞서는지' 가 아니라 그냥 좌표 차이가 된다.
     * project 에 직전 인덱스를 힌트로 넘겨 국소 탐색만 시킨다.
     */
    buildProgress(track) {
      const N = track.nodes.length;
      this.prog = new Float64Array(this.n);
      let lap = 0, prev = -1, hint;
      for (let i = 0; i < this.n; i++) {
        const p = track.project(this.at(i, 0), this.at(i, 1), hint);
        hint = p.index;
        const t = p.index / N;
        if (prev >= 0 && prev > 0.8 && t < 0.2) lap++;
        prev = t;
        this.prog[i] = lap + t;
      }
      // 출발점 기준 상대값으로 바꾼다.
      // 카트의 totalProgress 는 랩 카운터가 따로 있어 절대값 기준이 다르다.
      // 둘 다 '출발선에서 얼마나 갔나' 로 맞춰야 서로 비교할 수 있다.
      const base = this.prog[0];
      for (let i = 0; i < this.n; i++) this.prog[i] -= base;
    }

    /** 주어진 진행도에 고스트가 도달했던 시각 (초). 아직이면 null */
    timeAt(totalProgress) {
      const p = this.prog;
      if (!p || !p.length) return null;
      if (totalProgress <= p[0]) return 0;
      if (totalProgress >= p[p.length - 1]) return null;
      let lo = 0, hi = p.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (p[mid] <= totalProgress) lo = mid; else hi = mid;
      }
      const span = p[hi] - p[lo];
      const u = span > 1e-9 ? (totalProgress - p[lo]) / span : 0;
      return (lo + u) * this.dt;
    }

    /** raceTime 기준으로 위치를 찍는다 (샘플 사이는 선형 보간) */
    seek(raceTime) {
      if (this.n < 2) { this.done = true; return; }
      const f = raceTime / this.dt;
      const i = Math.floor(f);
      if (i >= this.n - 1) {
        this.done = true;
        this._apply(this.n - 1, this.n - 1, 0);
        return;
      }
      this.done = false;
      this._apply(i, i + 1, f - i);
    }

    _apply(i, j, u) {
      const ax = this.at(i, 0), ay = this.at(i, 1), az = this.at(i, 2);
      this.x = ax + (this.at(j, 0) - ax) * u;
      this.y = ay + (this.at(j, 1) - ay) * u;
      this.z = az + (this.at(j, 2) - az) * u;
      // 각도는 -pi~pi 를 넘나들므로 최단 방향으로 보간한다.
      // 그냥 섞으면 한 바퀴 되감기며 홱 돌아간다.
      const a0 = this.at(i, 3);
      let da = this.at(j, 3) - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle = a0 + da * u;
      this.input.steer = this.at(i, 4);
      const f = this.at(i, 5) | 0;
      this.drifting = !!(f & F_DRIFT);
      this.driftDir = this.drifting ? ((f & F_DIR) ? 1 : -1) : 0;
      this.boostTimer = (f & F_BOOST) ? 0.2 : 0;
      this.airborne = !!(f & F_AIR);
      // 속도는 저장하지 않고 샘플 간 이동량에서 되짚는다 (바퀴 회전·리그가 본다).
      // 프레임 간 차이가 아니라 샘플 간 차이를 써야 값이 튀지 않는다.
      this.speed = Math.hypot(this.at(j, 0) - ax, this.at(j, 1) - ay) / this.dt;
      this.speedRatio = Math.min(1.3, this.speed / this.phys.maxSpeed);
    }
  }

  global.Ghost = { Recorder, Playback, load, save, clear, bestTime, HZ, STRIDE };
})(window);
