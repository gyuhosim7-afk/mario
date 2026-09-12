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
      // 룩어헤드 거리: 속도 비례
      const spd = Math.max(0.15, k.speedRatio);
      const ahead = Math.round(13 + spd * 34);
      const nd = tr.nodeAt(k.node + ahead);
      const far = tr.nodeAt(k.node + ahead + 18);

      // 코너 안쪽으로 라인 보정 (노면을 벗어나지 않도록 클램프)
      const curv = far.curv;
      const half = tr.width * 0.5;
      let off = this.lineOffset - curv * tr.width * 0.9;
      off = Math.max(-half * 0.55, Math.min(half * 0.55, off));
      const tx = nd.x + nd.nx * off, ty = nd.y + nd.ny * off;

      let d = Math.atan2(ty - k.y, tx - k.x) - k.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;

      let steer = Math.max(-1, Math.min(1, d * 2.6));
      // 코스 밖으로 밀려났으면 중심선으로 강하게 복귀
      const lat = k.lateral || 0;
      if (Math.abs(lat) > half * 0.62) steer -= Math.sign(lat) * 0.6;
      steer = Math.max(-1, Math.min(1, steer));
      // 반응 지연 시뮬레이션
      this._steer += (steer - this._steer) * Math.min(1, dt / this.reaction);
      k.input.steer = this._steer;

      // 곡률 기반 목표 속도 -> 코너 진입 전 감속
      const cornerHard = Math.abs(curv);
      const cornerSpeed = Math.max(0.42, 1 - cornerHard * (1.15 - this.skill * 0.35));
      k.input.throttle = 1;
      k.input.brake = k.speedRatio > cornerSpeed + 0.12;
      if (k.speedRatio > cornerSpeed && !k.input.brake && Math.random() < 0.35) k.input.throttle = 0;

      // 오프로드 탈출
      if (k.surface === S.OFFROAD || k.surface === S.LAVA || k.surface === S.VOID) {
        const back = tr.nodeAt(k.node + 6);
        let dd = Math.atan2(back.y - k.y, back.x - k.x) - k.angle;
        while (dd > Math.PI) dd -= Math.PI * 2;
        while (dd < -Math.PI) dd += Math.PI * 2;
        k.input.steer = Math.max(-1, Math.min(1, dd * 3));
        k.input.brake = false;
      }

      // 드리프트: 지속적인 큰 곡률에서만
      const driftWanted = Math.abs(curv) > 0.34 && k.speedRatio > 0.55 && this.skill > 0.25;
      if (driftWanted) {
        k.input.drift = true;
        if (Math.abs(k.input.steer) < 0.3) k.input.steer = Math.sign(curv) * 0.45;
      } else {
        k.input.drift = false;
      }

      // 장애물(바나나/폭탄) 회피
      if (world && world.hazards) {
        for (const h of world.hazards) {
          if (h.dead) continue;
          const dx = h.x - k.x, dy = h.y - k.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 150) {
            const fwd = Math.cos(k.angle) * dx + Math.sin(k.angle) * dy;
            const side = -Math.sin(k.angle) * dx + Math.cos(k.angle) * dy;
            if (fwd > 0 && Math.abs(side) < 46) {
              k.input.steer = Math.max(-1, Math.min(1, k.input.steer - Math.sign(side || 1) * (1 - dist / 150) * 1.5));
            }
          }
        }
      }

      // 아이템 사용
      this._itemT -= dt;
      if (k.item && this._itemT <= 0) {
        if (this._shouldUse(world)) {
          world.useItem(k);
          this._itemT = 1.8 + Math.random() * 3.2;
        } else {
          this._itemT = 0.45;
        }
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
          return k.boostTimer <= 0 && (k.surface !== 1 || Math.abs(world.track.nodeAt(k.node + 10).curv) < 0.3);
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
