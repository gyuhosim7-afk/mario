/* =============================================================
 * ai.js - CPU 드라이버
 *   중심선 룩어헤드 추종 + 곡률 기반 감속 + 드리프트 판단 + 아이템 사용
 * ============================================================= */
(function (global) {
  'use strict';

  const S = global.GameData.SURFACE;

  class Driver {
    constructor(kart, skill) {
      this.k = kart;
      this.skill = skill;                       // 0 ~ 1
      this.lineOffset = (Math.random() - 0.5) * kart.track.width * 0.3;
      this.reaction = 0.05 + (1 - skill) * 0.14;
      this._t = 0;
      this._itemT = 1 + Math.random() * 2;
      this._steer = 0;
      this._panic = 0;
    }

    update(dt, world) {
      const k = this.k, tr = k.track;
      if (!k.controllable) { k.input.throttle = 1; k.input.steer = 0; k.input.drift = false; return; }

      this._t += dt;
      const gap = tr.nodeGap || (tr.length / tr.nodes.length);
      const spd = Math.max(0.15, k.speedRatio);
      // 룩어헤드는 '거리' 기준 (노드 간격이 달라져도 동일하게 동작)
      const aheadN = Math.round((80 + spd * 240) / gap);
      const nd = tr.nodeAt(k.node + aheadN);
      const far = tr.nodeAt(k.node + aheadN + Math.round(170 / gap));

      // 코너 안쪽으로 라인 보정
      const half = tr.width * 0.5;
      const curvN = Math.max(-1, Math.min(1, far.curv * 1.6));
      let off = this.lineOffset - curvN * half * 0.5;
      off = Math.max(-half * 0.55, Math.min(half * 0.55, off));
      const tx = nd.x + nd.nx * off, ty = nd.y + nd.ny * off;

      let d = Math.atan2(ty - k.y, tx - k.x) - k.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;

      let steer = Math.max(-1, Math.min(1, d * 2.6));
      const lat = k.lateral || 0;
      if (Math.abs(lat) > half * 0.62) steer -= Math.sign(lat) * 0.6;
      steer = Math.max(-1, Math.min(1, steer));
      this._steer += (steer - this._steer) * Math.min(1, dt / this.reaction);
      k.input.steer = this._steer;

      // 목표 속도: 코너 반경 × 조향 각속도 (물리적으로 돌 수 있는 최대 속도)
      let R = 1e6;
      for (let a = aheadN * 0.4; a <= aheadN + 220 / gap; a += 60 / gap) {
        R = Math.min(R, tr.nodeAt(k.node + Math.round(a)).radius);
      }
      // 물리 엔진은 고속일수록 조향 각속도를 최대 42% 감쇠시킨다.
      //   v = R * steerRate * (1 - 0.42*v/maxSpeed)  ->  v 에 대해 풀어 실제 코너 한계속도를 구한다
      const sr = k.phys.steerRate, vm = k.phys.maxSpeed;
      let vCorner = (R * sr) / (1 + 0.42 * R * sr / vm);
      if (R < 320) vCorner *= 1.12;                     // 드리프트로 확보되는 여유
      const vTarget = Math.min(vm, vCorner * (0.84 + this.skill * 0.16));
      k.input.throttle = 1;
      k.input.brake = k.speed > vTarget * 1.12;
      if (!k.input.brake && k.speed > vTarget && Math.random() < 0.4) k.input.throttle = 0;

      // 오프로드 탈출
      if (k.surface === S.OFFROAD || k.surface === S.LAVA || k.surface === S.VOID) {
        const back = tr.nodeAt(k.node + Math.round(90 / gap));
        let dd = Math.atan2(back.y - k.y, back.x - k.x) - k.angle;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        k.input.steer = Math.max(-1, Math.min(1, dd * 3));
        k.input.brake = false;
      }

      // 드리프트: '이미 코너 안에서 그 방향으로 조향 중'일 때만.
      // 직선에서 드리프트를 걸면 횡슬립이 붙어 그대로 코스 밖으로 밀려난다.
      const nearR = tr.nodeAt(k.node + Math.round(70 / gap)).radius;
      const inCorner = nearR < 300;
      const steering = Math.abs(this._steer) > 0.3;
      k.input.drift = inCorner && steering && k.speedRatio > 0.55 && this.skill > 0.35;

      // 장애물 회피
      if (world && world.hazards) {
        for (const h of world.hazards) {
          if (h.dead) continue;
          const dx = h.x - k.x, dy = h.y - k.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 170) {
            const fwd = Math.cos(k.angle) * dx + Math.sin(k.angle) * dy;
            const side = -Math.sin(k.angle) * dx + Math.cos(k.angle) * dy;
            if (fwd > 0 && Math.abs(side) < 46) {
              k.input.steer = Math.max(-1, Math.min(1, k.input.steer - Math.sign(side || 1) * (1 - dist / 170) * 1.5));
            }
          }
        }
      }

      // 건초더미: 굴러오는 더미가 앞 도로에서 내 진행선으로 다가오면 속도를 풀어
      // 먼저 지나가게 둔다. 실력이 낮은 CPU 는 그냥 들이받는다 (그래야 변수가 된다).
      const bales = world && world.track && world.track.bales;
      if (bales && bales.length && this.skill > 0.45) {
        const c = Math.cos(k.angle), s = Math.sin(k.angle);
        for (const b of bales) {
          if (!b.rolling) continue;
          const dx = b.x - k.x, dy = b.y - k.y;
          const fwd = c * dx + s * dy;
          if (fwd < 0 || fwd > 280) continue;
          const side = -s * dx + c * dy;
          // 더미의 굴러가는 방향을 내 좌우축에 투영: 부호가 side 와 반대면 다가오는 중
          const vSide = (b.nx * -s + b.ny * c) * b.dir;
          const coming = vSide * side < 0;
          if (Math.abs(side) < 60 || (coming && Math.abs(side) < 220)) {
            k.input.throttle = 0;
            k.input.brake = fwd < 150 && k.speed > 160;
          }
        }
      }

      // 유성 경고 원 · 끓거나 분출 중인 분출구는 옆으로 피한다.
      // 부스트 링은 실력 높은 CPU 가 노리고 들어간다.
      const tr2 = world && world.track;
      if (tr2) {
        const c = Math.cos(k.angle), s = Math.sin(k.angle);
        const dodge = (x, y, R, gain) => {
          const dx = x - k.x, dy = y - k.y;
          const fwd = c * dx + s * dy;
          if (fwd < 0 || fwd > 260) return;
          const side = -s * dx + c * dy;
          if (Math.abs(side) > R) return;
          k.input.steer = Math.max(-1, Math.min(1, k.input.steer - Math.sign(side || 1) * (1 - fwd / 260) * gain));
        };
        if (this.skill > 0.4) {
          for (const m of tr2.meteors || []) if (m.state === 'warn' && m.t < 1.2) dodge(m.x, m.y, 70, 1.4);
          // 분출구는 급코너 안쪽이라 크게 꺾으면 바깥 용암으로 빠진다. 살짝만 비켜 간다
          for (const g of tr2.geysers || []) if (g.state !== 'idle') dodge(g.x, g.y, 44, 0.55);
        }
        if (this.skill > 0.6) {
          for (const r of tr2.rings || []) {
            const dx = r.x - k.x, dy = r.y - k.y;
            const fwd = c * dx + s * dy;
            if (fwd < 40 || fwd > 320) continue;
            const side = -s * dx + c * dy;
            if (Math.abs(side) > 150) continue;
            k.input.steer = Math.max(-1, Math.min(1, k.input.steer + Math.max(-0.6, Math.min(0.6, side / 90))));
          }
        }
      }

      // 아이템 사용
      this._itemT -= dt;
      if (k.item && this._itemT <= 0) {
        if (this._shouldUse(world)) { world.useItem(k); this._itemT = 1.8 + Math.random() * 3.2; }
        else this._itemT = 0.45;
      }
    }

    /** 지금 쓰는 게 의미 있는 아이템인지 판단 (무의미한 난사 방지) */
    _shouldUse(world) {
      const k = this.k;
      const id = k.item.id;
      let ahead = Infinity, behind = Infinity;
      for (const o of world.karts) {
        if (o === k || o.finished) continue;
        const dx = o.x - k.x, dy = o.y - k.y;
        const dist = Math.hypot(dx, dy);
        const fwd = Math.cos(k.angle) * dx + Math.sin(k.angle) * dy;
        if (fwd > 0) ahead = Math.min(ahead, dist);
        else behind = Math.min(behind, dist);
      }
      switch (id) {
        case 'greenshell': return ahead < 420;
        case 'redshell': return ahead < 900 && k.rank > 1;
        case 'bobomb': return ahead < 380;
        case 'banana': return behind < 300 || Math.random() < 0.25;
        case 'mushroom':
        case 'triplemush':
          return k.boostTimer <= 0 && (k.surface !== 1 ||
            world.track.nodeAt(k.node + Math.round(160 / (world.track.nodeGap || 9))).radius > 400);
        case 'bulletbill': return k.rank > 3;
        case 'star': return true;
        case 'spiny': return k.rank > 1;
        case 'lightning': return k.rank > 1;
        default: return true;
      }
    }
  }

  global.AI = { Driver };
})(window);
