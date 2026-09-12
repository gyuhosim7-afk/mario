/* =============================================================
 * kart.js - 카트 주행 물리 + FSM(유한 상태 머신) 기반 피격 반응
 *
 *  상태: NORMAL / SPINOUT / KNOCKBACK / SHRUNK / RESPAWN / BULLET
 *  물리: 스탯 -> (질량, 최대토크, 타이어 마찰, 회전 관성)으로 변환된 값 사용
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const S = D.SURFACE;

  const STATE = {
    NORMAL: 'NORMAL',
    SPINOUT: 'SPINOUT',
    KNOCKBACK: 'KNOCKBACK',
    SHRUNK: 'SHRUNK',
    RESPAWN: 'RESPAWN',
    BULLET: 'BULLET'
  };

  // 미니터보 3단계: [충전 시간, 부스터 지속, 부스터 배율, 스파크 색]
  const MT_STAGES = [
    { charge: 0.75, dur: 0.55, power: 1.20, color: '#4fc3ff', name: 'BLUE' },
    { charge: 1.70, dur: 0.85, power: 1.32, color: '#ff9c2a', name: 'ORANGE' },
    { charge: 2.80, dur: 1.20, power: 1.46, color: '#c264ff', name: 'PURPLE' }
  ];

  const SLIP_REQUIRED = 1.15;    // 슬립스트림 발동까지 필요한 시간

  class Kart {
    constructor(opts) {
      this.id = opts.id;
      this.name = opts.name;
      this.isPlayer = !!opts.isPlayer;
      this.combo = opts.combo;                 // Stats.build() 결과
      this.phys = opts.combo.physics;
      this.stats = opts.combo.stats;
      this.sprite = opts.sprite;
      this.track = opts.track;
      this.color = opts.combo.character.colors.accent;

      this.x = 0; this.y = 0; this.z = 0;
      this.angle = 0;
      this.speed = 0;
      this.vlat = 0;
      this.vz = 0;
      this.scale = 1;

      this.state = STATE.NORMAL;
      this.stateTimer = 0;
      this.spinAngle = 0;
      this.airborne = false;

      this.drifting = false;
      this.driftDir = 0;
      this.driftCharge = 0;
      this.driftStage = -1;
      this.hopT = 0;

      this.boostTimer = 0;
      this.boostPower = 1;
      this.boostSource = '';

      this.slipTimer = 0;
      this.slipFlash = 0;
      this.floodTimer = 0;      // 플라잉 스타트 시 엔진 과부하 페널티

      this.starTimer = 0;
      this.shrinkTimer = 0;
      this.invulnTimer = 0;

      this.item = null;
      this.itemCount = 0;
      this.roulette = new global.ItemSystem.Roulette(1.5);
      this.coins = 0;

      this.lap = 0;              // 스타트 라인을 처음 통과하면 1랩째 시작
      this.preStart = true;
      this.rank = 1;
      this.finished = false;
      this.finishTime = 0;
      this.lapTimes = [];
      this.lastLapStamp = 0;

      this.node = 0;
      this.lapProgress = 0;
      this.totalProgress = 0;
      this._prevNode = 0;
      this._halfway = false;

      this.surface = S.ROAD;
      this.offroadFactor = 1;
      this.wheelSpin = 0;
      this.shake = 0;

      this.input = { throttle: 0, steer: 0, drift: false, brake: false };
      this.ai = null;
    }

    /* ------------- 배치 ------------- */
    placeAt(slot) {
      this.x = slot.x; this.y = slot.y; this.angle = slot.angle;
      const p = this.track.project(this.x, this.y);
      this._hasNode = true;
      this.node = p.index; this._prevNode = p.index;
      this.lap = 0; this.preStart = true;
      // 그리드는 스타트 라인 뒤쪽이므로 이미 반환점을 지난 것으로 간주한다
      this._halfway = true;
      this.lapProgress = p.progress;
      this.totalProgress = p.progress - 1;
    }

    /* ------------- 상태 조회 ------------- */
    get controllable() { return this.state === STATE.NORMAL || this.state === STATE.SHRUNK; }
    get invincible() { return this.starTimer > 0 || this.state === STATE.BULLET || this.invulnTimer > 0 || this.state === STATE.RESPAWN; }
    get speedRatio() { return this.speed / this.phys.maxSpeed; }

    /* ------------- FSM 진입 ------------- */
    /** 바나나 / 초록 껍질 : 720도 스핀아웃 */
    spinOut() {
      if (this.invincible || this.finished) return false;
      this.state = STATE.SPINOUT;
      this.stateTimer = 1.5;
      this.spinAngle = 0;
      this.speed = 0;              // 전진 추진력 즉시 0
      this.vlat = 0;
      this._cancelDrift();
      this.shake = 0.55;
      this.invulnTimer = 1.7;
      return true;
    }

    /** 폭탄 / 스파이크 셸 : 임펄스 넉백 + 아이템/동전 드롭 */
    knockback(dirX, dirY, power) {
      if (this.invincible || this.finished) return false;
      const p = power || 1;
      this.state = STATE.KNOCKBACK;
      this.stateTimer = 0;
      this.airborne = true;
      this.vz = 260 * p * (1 - Math.min(0.35, this.stats.weight * 0.03));
      const imp = 210 * p;
      const m = Math.hypot(dirX, dirY) || 1;
      this.kx = dirX / m * imp * (120 / this.phys.mass);
      this.ky = dirY / m * imp * (120 / this.phys.mass);
      this.speed = 0;
      this.vlat = 0;
      this.spinAngle = 0;
      this._cancelDrift();
      this.shake = 1;
      this.invulnTimer = 2.6;
      // 소지 아이템 + 동전 강제 드롭
      const dropped = { item: this.item, coins: Math.min(this.coins, 3) };
      this.item = null; this.itemCount = 0;
      this.coins = Math.max(0, this.coins - dropped.coins);
      this.droppedThisHit = dropped;
      return true;
    }

    /** 번개 : 축소 + 감속 디버프 + 아이템 파괴 */
    shrink() {
      if (this.invincible || this.finished) return false;
      this.state = STATE.SHRUNK;
      this.shrinkTimer = 5.0;
      this.scale = 0.5;
      this.item = null; this.itemCount = 0;
      this.speed *= 0.45;
      this._cancelDrift();
      this.shake = 0.4;
      return true;
    }

    /** 코스 이탈 - 레스큐 드론 복귀 */
    respawn() {
      if (this.state === STATE.RESPAWN) return;
      this.state = STATE.RESPAWN;
      this.stateTimer = 1.4;
      this.speed = 0; this.vlat = 0; this.vz = 0;
      this.airborne = false;
      this._cancelDrift();
      this.respawnFrom = { x: this.x, y: this.y };
    }

    startBullet() {
      this.state = STATE.BULLET;
      this.stateTimer = 4.6;
      this.item = null; this.itemCount = 0;
      this.speed = this.phys.maxSpeed * 1.55;
      this._cancelDrift();
    }

    giveBoost(dur, power, src) {
      if (dur > this.boostTimer || power > this.boostPower) {
        this.boostTimer = Math.max(this.boostTimer, dur);
        this.boostPower = Math.max(this.boostPower, power);
        this.boostSource = src || '';
      }
    }

    _cancelDrift() {
      this.drifting = false; this.driftCharge = 0; this.driftStage = -1; this.driftDir = 0;
    }

    /* ------------- 메인 업데이트 ------------- */
    update(dt, world) {
      const ph = this.phys;
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.slipFlash = Math.max(0, this.slipFlash - dt * 2);
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.starTimer > 0) this.starTimer -= dt;
      this.roulette.update(dt);

      // 번개 디버프 해제
      if (this.shrinkTimer > 0) {
        this.shrinkTimer -= dt;
        // 마지막 0.5초 동안 원래 크기로 서서히 복원
        this.scale = this.shrinkTimer > 0.5 ? 0.5 : 0.5 + 0.5 * (1 - this.shrinkTimer / 0.5);
        if (this.shrinkTimer <= 0) {
          this.shrinkTimer = 0;
          this.scale = 1;
          if (this.state === STATE.SHRUNK) this.state = STATE.NORMAL;
        }
      }

      /* ---- 상태별 처리 ---- */
      switch (this.state) {
        case STATE.SPINOUT: {
          this.stateTimer -= dt;
          this.spinAngle += (Math.PI * 4 / 1.5) * dt;      // 1.5초에 720도
          this.speed = 0;
          if (this.stateTimer <= 0) { this.state = STATE.NORMAL; this.spinAngle = 0; }
          this._integrate(dt, world);
          return;
        }
        case STATE.KNOCKBACK: {
          this.stateTimer += dt;
          if (this.airborne) {
            this.vz -= 620 * dt;
            this.z += this.vz * dt;
            this.x += this.kx * dt; this.y += this.ky * dt;
            this.kx *= (1 - dt * 0.9); this.ky *= (1 - dt * 0.9);
            this.spinAngle += 7.5 * dt;
            this.angle += 3.2 * dt;
            if (this.z <= 0) {
              this.z = 0; this.vz = 0; this.airborne = false;
              this.stateTimer = 0;                          // 착지 후 회복 단계
              this.shake = 0.7;
            }
          } else {
            // 착지 후 정지 & 회복
            this.spinAngle *= (1 - dt * 4);
            if (this.stateTimer >= 1.15 * ph.recoverScale) {
              this.state = STATE.NORMAL; this.spinAngle = 0; this.speed = 0;
            }
          }
          this._sampleSurface();
          return;
        }
        case STATE.RESPAWN: {
          this.stateTimer -= dt;
          const nd = this.track.nodeAt(this._prevNode);
          const t = 1 - Math.max(0, this.stateTimer) / 1.4;
          this.z = Math.max(0, 220 * (1 - t));
          this.x += (nd.x - this.x) * Math.min(1, dt * 6);
          this.y += (nd.y - this.y) * Math.min(1, dt * 6);
          this.angle = Math.atan2(nd.dy, nd.dx);
          if (this.stateTimer <= 0) {
            this.state = STATE.NORMAL; this.z = 0; this.speed = 0;
            this.invulnTimer = 1.2;
          }
          return;
        }
        case STATE.BULLET: {
          this.stateTimer -= dt;
          this._autoDrive(dt, 1.55);
          if (this.stateTimer <= 0) { this.state = STATE.NORMAL; this.speed = this.phys.maxSpeed * 0.9; }
          this._integrate(dt, world);
          this._sampleSurface();
          this._checkLap();
          return;
        }
      }

      /* ---- 정상 주행 (NORMAL / SHRUNK) ---- */
      const inp = this.input;
      this._sampleSurface();

      // 노면 배율
      let surfMul = 1;
      if (this.surface === S.OFFROAD) surfMul = ph.offroadGrip;
      else if (this.surface === S.LAVA) surfMul = ph.offroadGrip * 0.72;
      else if (this.surface === S.KERB) surfMul = 0.94;
      this.offroadFactor = surfMul;

      // 부스터 발판
      if (this.surface === S.BOOST && !this._onBoostPad) {
        this.giveBoost(0.95, 1.42, 'pad');
        this._onBoostPad = true;
      } else if (this.surface !== S.BOOST) this._onBoostPad = false;

      // 용암: 잠깐 버티다 레스큐 드론이 건져 올린다 (넉백 무한 루프 방지)
      if (this.surface === S.LAVA) {
        this._lavaT = (this._lavaT || 0) + dt;
        this.speed *= (1 - dt * 1.4);
        if (this._lavaT > 0.45) { this._lavaT = 0; this.lavaBurn = true; this.respawn(); return; }
      } else this._lavaT = 0;

      // 코스에서 너무 멀리 이탈하면 레스큐 드론이 복귀시킨다
      if (this.offTrackDist > this.track.width * 0.5 + 185) { this.respawn(); return; }

      // 허공 낙하
      if (this.surface === S.VOID) {
        this._voidT = (this._voidT || 0) + dt;
        if (this._voidT > 0.16) { this._voidT = 0; this.respawn(); return; }
      } else this._voidT = 0;

      // 부스터 / 디버프 배율
      if (this.boostTimer > 0) { this.boostTimer -= dt; if (this.boostTimer <= 0) { this.boostPower = 1; this.boostSource = ''; } }
      const debuff = this.shrinkTimer > 0 ? 0.6 : 1;                 // 번개: 40% 감쇄
      const starMul = this.starTimer > 0 ? 1.14 : 1;
      const maxSpeed = ph.maxSpeed * surfMul * debuff * starMul * (this.boostTimer > 0 ? this.boostPower : 1);
      if (this.floodTimer > 0) this.floodTimer -= dt;
      const accel = ph.accelRate * debuff * (this.boostTimer > 0 ? 2.3 : 1) * (this.floodTimer > 0 ? 0.42 : 1);

      // 종방향
      if (inp.brake && this.speed > 0) {
        this.speed -= ph.brakeForce * dt;
      } else if (inp.throttle > 0) {
        const gap = maxSpeed - this.speed;
        this.speed += Math.sign(gap) * Math.min(Math.abs(gap), accel * dt * (gap > 0 ? 1 : 2.6));
      } else if (inp.throttle < 0) {
        this.speed -= ph.brakeForce * 0.85 * dt;
      } else {
        this.speed -= 170 * dt;
      }
      if (this.speed > maxSpeed) this.speed -= (this.speed - maxSpeed) * Math.min(1, dt * 3.2);
      this.speed = Math.max(-120, this.speed);

      /* ---- 드리프트 & 미니터보 ---- */
      const fast = this.speed > ph.maxSpeed * 0.35;
      if (inp.drift && !this.drifting && fast) {
        if (this.hopT <= 0 && !this._driftLatch) { this.hopT = 0.26; this._driftLatch = true; }
        if (this.hopT > 0 && Math.abs(inp.steer) > 0.25) {
          this.drifting = true;
          this.driftDir = Math.sign(inp.steer);
          this.driftCharge = 0;
          this.driftStage = -1;
        }
      }
      if (!inp.drift) this._driftLatch = false;
      if (this.hopT > 0) this.hopT -= dt;

      if (this.drifting) {
        if (!inp.drift || !fast) {
          // 드리프트 해제 -> 단계 비례 미니터보
          if (this.driftStage >= 0) {
            const st = MT_STAGES[this.driftStage];
            this.giveBoost(st.dur, st.power, 'mt' + this.driftStage);
            this.mtFlash = 0.35;
          }
          this._cancelDrift();
        } else {
          this.driftCharge += dt * (0.72 + Math.abs(inp.steer) * 0.5) * (this.speed / ph.maxSpeed + 0.3);
          let st = -1;
          for (let i = 0; i < MT_STAGES.length; i++) if (this.driftCharge >= MT_STAGES[i].charge) st = i;
          if (st > this.driftStage) this.sparkPop = 0.3;
          this.driftStage = st;
        }
      }
      if (this.mtFlash > 0) this.mtFlash -= dt;
      if (this.sparkPop > 0) this.sparkPop -= dt;

      /* ---- 조향 ---- */
      const speedF = Math.min(1, Math.abs(this.speed) / (ph.maxSpeed * 0.42));
      let steer = inp.steer;
      let turn;
      if (this.drifting) {
        // 드리프트 중에는 안쪽으로 고정 + 입력으로 미세 조정
        const bias = this.driftDir * 0.62 + steer * 0.42;
        turn = ph.steerRate * 1.32 * bias * speedF;
        this.vlat += this.driftDir * this.speed * 0.9 * dt;
      } else {
        turn = ph.steerRate * steer * speedF * (1 - Math.min(0.42, Math.abs(this.speed) / ph.maxSpeed * 0.42));
      }
      if (this.speed < 0) turn = -turn;
      this.angle += turn * dt / Math.max(0.4, ph.inertia);

      // 횡방향 마찰 (드리프트 시 낮음)
      const lf = this.drifting ? ph.driftFriction : ph.tireFriction;
      this.vlat -= this.vlat * Math.min(1, lf * dt);

      this.wheelSpin += this.speed * dt * 0.05;
      this._integrate(dt, world);
      this._checkLap();
    }

    _integrate(dt) {
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      this.x += (c * this.speed - s * this.vlat) * dt;
      this.y += (s * this.speed + c * this.vlat) * dt;
      const W = this.track.world;
      this.x = Math.max(4, Math.min(W - 4, this.x));
      this.y = Math.max(4, Math.min(W - 4, this.y));
      if (this.z > 0 && !this.airborne) this.z = Math.max(0, this.z - 400 * dt);
    }

    _sampleSurface() {
      this.surface = this.track.surfaceAt(this.x, this.y);
      const p = this.track.project(this.x, this.y, this._hasNode ? this.node : undefined);
      this._hasNode = true;
      this.node = p.index;
      this.lateral = p.lateral;
      this.offTrackDist = p.dist;
    }

    /** 로켓 / AI 자동 주행 */
    _autoDrive(dt, speedMul) {
      const tr = this.track;
      const look = tr.nodeAt(this.node + 16);
      const target = Math.atan2(look.y - this.y, look.x - this.x);
      let d = target - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += Math.max(-6 * dt, Math.min(6 * dt, d * 6 * dt * 1.6));
      this.speed = this.phys.maxSpeed * (speedMul || 1);
      this.vlat *= (1 - dt * 6);
    }

    _checkLap() {
      if (this.finished) return;      // 완주 후에는 랩을 더 세지 않는다
      const tr = this.track;
      const N = tr.nodes.length;
      const prev = this._prevNode, cur = this.node;
      let diff = cur - prev;
      if (diff > N / 2) diff -= N;
      if (diff < -N / 2) diff += N;
      // 역주행/텔레포트 방지: 한 프레임 이동 폭 제한
      if (Math.abs(diff) < N * 0.25) {
        const p = cur / N;
        if (p > 0.35 && p < 0.75) this._halfway = true;
        if (this._halfway && prev / N > 0.8 && p < 0.2 && diff > 0) {
          this._halfway = false;
          this.lap++;
          this.lapJustDone = true;   // lap 0 -> 1 은 '레이스 시작' 통과
        }
        this._prevNode = cur;
      }
      this.lapProgress = cur / N;
      this.totalProgress = (this.lap - 1) + this.lapProgress;
    }

    /* ------------- 아이템 ------------- */
    hasItem() { return !!this.item; }
    canGetItem() { return !this.item && !this.roulette.active; }
    startRoulette(rank, count, cb) {
      this.roulette.start(rank, count, (res) => {
        this.item = res;
        this.itemCount = res.count || 1;
        if (cb) cb(res);
      });
    }
    consumeItem() {
      if (!this.item) return null;
      const it = this.item;
      this.itemCount--;
      if (this.itemCount <= 0) this.item = null;
      return it;
    }
    addCoin(n) { this.coins = Math.min(10, this.coins + (n || 1)); }
  }

  global.KartSystem = { Kart, STATE, MT_STAGES, SLIP_REQUIRED };
})(window);
