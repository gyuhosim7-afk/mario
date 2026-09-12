/* =============================================================
 * items.js - 순위 기반 아이템 드롭 가중치 알고리즘 + 룰렛 연출
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;

  /** 순위(1~8) -> 확률 테이블 조회 */
  function tableForRank(rank, racerCount) {
    const idx = Math.max(0, Math.min(D.ITEM_WEIGHTS.length - 1, rank - 1));
    // 참가자 수가 8명 미만이면 최하위가 테이블 끝에 닿도록 보정
    if (racerCount && racerCount < D.ITEM_WEIGHTS.length) {
      const scaled = Math.round((rank - 1) / Math.max(1, racerCount - 1) * (D.ITEM_WEIGHTS.length - 1));
      return D.ITEM_WEIGHTS[scaled];
    }
    return D.ITEM_WEIGHTS[idx];
  }

  /** 가중치 테이블 -> 확률(%) 목록 (UI 표시용) */
  function probabilities(rank, racerCount) {
    const t = tableForRank(rank, racerCount);
    const sum = Object.values(t).reduce((a, b) => a + b, 0);
    return Object.keys(t)
      .map(id => ({ id, item: D.ITEMS[id], weight: t[id], pct: (t[id] / sum) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  }

  /** 가중치 룰렛 - 최종 아이템 1개 결정 */
  function roll(rank, racerCount, rng) {
    const r = rng || Math.random;
    const t = tableForRank(rank, racerCount);
    const keys = Object.keys(t);
    let sum = 0;
    for (const k of keys) sum += t[k];
    let pick = r() * sum;
    for (const k of keys) {
      pick -= t[k];
      if (pick <= 0) return D.ITEMS[k];
    }
    return D.ITEMS[keys[keys.length - 1]];
  }

  /**
   * 룰렛 연출 상태 머신.
   * 획득 즉시 결과를 확정(가중치 알고리즘)하되, 1.5초간 아이콘을 무작위 회전시켜
   * 연출 종료 직전에 최종 아이템을 슬롯에 장착한다.
   */
  class Roulette {
    constructor(duration) {
      this.duration = duration || 1.5;
      this.active = false;
      this.t = 0;
      this.result = null;
      this.display = null;
      this._spinTimer = 0;
      this._pool = Object.keys(D.ITEMS);
      this.onFinish = null;
    }
    start(rank, racerCount, onFinish) {
      this.active = true;
      this.t = 0;
      this._spinTimer = 0;
      this.result = roll(rank, racerCount);
      this.display = D.ITEMS[this._pool[(Math.random() * this._pool.length) | 0]];
      this.onFinish = onFinish || null;
      return this.result;
    }
    update(dt) {
      if (!this.active) return;
      this.t += dt;
      this._spinTimer -= dt;
      if (this._spinTimer <= 0) {
        // 종료가 가까울수록 회전이 느려지는 감속 연출
        const p = this.t / this.duration;
        this._spinTimer = 0.045 + p * p * 0.16;
        this.display = D.ITEMS[this._pool[(Math.random() * this._pool.length) | 0]];
      }
      if (this.t >= this.duration) {
        this.active = false;
        this.display = this.result;
        if (this.onFinish) this.onFinish(this.result);
      }
    }
  }

  global.ItemSystem = { tableForRank, probabilities, roll, Roulette };
})(window);
