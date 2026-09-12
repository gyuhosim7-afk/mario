/* =============================================================
 * game.js - 레이스 월드: 아이템/투사체, 충돌, 순위, 랩, 카메라 루프
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const S = D.SURFACE;
  const K = global.KartSystem;

  const CPU_NAMES = ['CPU-01', 'CPU-02', 'CPU-03', 'CPU-04', 'CPU-05', 'CPU-06', 'CPU-07'];

  class World {
    constructor(opts) {
      this.track = opts.track;
      this.renderer = opts.renderer;
      this.hud = opts.hud;
      this.karts = [];
      this.hazards = [];
      this.standings = [];
      this.time = 0;
      this.raceTime = 0;
      this.state = 'COUNTDOWN';
      this.countdown = 3.6;
      this._cdStep = 4;
      this.onFinish = opts.onFinish || function () {};
      this.results = [];
      this.rocketWindow = false;
    }

    addKart(k, isPlayer) {
      k.isPlayer = !!isPlayer;
      this.karts.push(k);
      if (isPlayer) this.player = k;
      return k;
    }

    start() {
      this.karts.forEach((k, i) => k.placeAt(this.track.startSlots[i]));
      this._updateStandings();
    }

    /* --------------------------------------------------- */
    update(dt) {
      this.time += dt;
      const R = this.renderer;

      if (this.state === 'COUNTDOWN') {
        this.countdown -= dt;
        const step = Math.ceil(this.countdown - 0.6);
        if (step < this._cdStep && step >= 0) {
          this._cdStep = step;
          if (step > 0) { this.hud.showBig(String(step), '#ffd54a', 0.9); global.SFX.sfx('countdown'); }
        }
        this.rocketWindow = this.countdown < 0.62 && this.countdown > 0.06;
        if (this.player && this.player.input.throttle > 0) {
          if (this.countdown > 0.62) this._rocketFail = true;
          else if (this.rocketWindow) this._rocketOk = true;
        }
        if (this.countdown <= 0) {
          this.state = 'RACING';
          this.hud.showBig('GO!', '#8ef2a8', 1.0);
          global.SFX.sfx('go');
          if (this._rocketOk && !this._rocketFail) {
            this.player.giveBoost(1.1, 1.42, 'rocket');
            this.hud.showToast('로켓 스타트!', '#ffd54a');
            global.SFX.sfx('boost');
          } else if (this._rocketFail) {
            // 너무 일찍 밟으면 엔진이 과부하되어 출발이 굼떠진다
            this.player.floodTimer = 1.6;
            this.hud.showToast('플라잉 스타트 - 출발 지연', '#ff8a8a');
          }
        }
        // 카운트다운 중에도 카메라/연출은 갱신
        for (const k of this.karts) { k.input.steer = 0; k.input.drift = false; }
      } else if (this.state === 'RACING' || this.state === 'FINISHED') {
        this.raceTime += dt;
      }

      this.track.updateThwomps(dt);

      /* ---- AI ---- */
      if (this.state !== 'COUNTDOWN') {
        // 완주한 카트도 계속 AI가 몰아 코스를 벗어나지 않게 한다
        for (const k of this.karts) if (k.ai) k.ai.update(dt, this);
      }
      // 완주한 플레이어는 자동 주행
      if (this.player && this.player.finished && !this.player.ai) {
        this.player.ai = new global.AI.Driver(this.player, 0.8);
      }

      /* ---- 카트 물리 ---- */
      for (const k of this.karts) {
        if (this.state === 'COUNTDOWN') {
          // 정지 상태 유지 (연출용 엔진 회전만)
          k.speed = 0;
          k.update(dt * 0.0001, this);
          continue;
        }
        const before = k.lap;
        k.update(dt, this);
        if (k.lapJustDone) {
          k.lapJustDone = false;
          if (k.preStart) {
            // 스타트 라인 최초 통과: 랩 타임 계측 시작
            k.preStart = false;
            k.lastLapStamp = this.raceTime;
          } else {
            k.lapTimes.push(this.raceTime - k.lastLapStamp);
            k.lastLapStamp = this.raceTime;
            if (k.lap > this.track.laps) this._finishKart(k);
            else if (k.isPlayer) {
              this.hud.showBig('LAP ' + k.lap, '#9fe8ff', 1.1);
              global.SFX.sfx('lap');
            }
          }
        }
        this._emitParticles(k, dt);
      }

      this._slipstream(dt);
      this._kartCollisions();
      this._itemBoxes(dt);
      this._thwompHits();
      this._updateHazards(dt);
      this._updateStandings();

      R.updateParticles(dt);
      if (this.player) R.camera.follow(this.player, dt, {});

      // 엔진음
      if (this.player) {
        global.SFX.updateEngine(Math.min(1.3, Math.abs(this.player.speed) / this.player.phys.maxSpeed),
          this.player.input.throttle > 0);
      }
    }

    /* --------------------------------------------------- */
    _finishKart(k) {
      k.finished = true;
      k.lap = this.track.laps;
      k.finishTime = this.raceTime;
      this.results.push(k);
      if (k.isPlayer) {
        this.state = 'FINISHED';
        this.hud.showBig('FINISH!', '#ffd54a', 1.8);
        global.SFX.sfx('finish');
        setTimeout(() => this.onFinish(this._resultTable()), 2600);
      }
    }
    _resultTable() {
      const rest = this.karts.filter(k => !k.finished)
        .sort((a, b) => b.totalProgress - a.totalProgress);
      // 아직 달리는 카트는 남은 거리 기준 예상 완주 시간을 계산한다
      for (const k of rest) {
        const remain = Math.max(0, this.track.laps - k.totalProgress) * this.track.length;
        k.estTime = this.raceTime + remain / (k.phys.maxSpeed * 0.72);
      }
      return this.results.concat(rest);
    }

    _updateStandings() {
      const arr = this.karts.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.totalProgress - a.totalProgress;
      });
      arr.forEach((k, i) => { k.rank = i + 1; });
      this.standings = arr;
    }

    /* ---- 슬립스트림 (Drafting) ---- */
    _slipstream(dt) {
      for (const k of this.karts) {
        if (!k.controllable || k.speedRatio < 0.5) { k.slipTimer = Math.max(0, k.slipTimer - dt * 2); continue; }
        let drafting = false;
        for (const o of this.karts) {
          if (o === k) continue;
          const dx = o.x - k.x, dy = o.y - k.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 230 || dist < 26) continue;
          const fwd = Math.cos(k.angle) * dx + Math.sin(k.angle) * dy;
          const side = -Math.sin(k.angle) * dx + Math.cos(k.angle) * dy;
          if (fwd > 30 && Math.abs(side) < 46) { drafting = true; break; }
        }
        if (drafting) {
          k.slipTimer += dt;
          if (k.slipTimer >= K.SLIP_REQUIRED) {
            k.slipTimer = 0;
            k.giveBoost(1.15, 1.22, 'slip');
            k.slipFlash = 1;
            if (k.isPlayer) { this.hud.showToast('슬립스트림 가속!', '#9fe8ff'); global.SFX.sfx('boost'); }
          }
        } else {
          k.slipTimer = Math.max(0, k.slipTimer - dt * 1.6);
        }
      }
    }

    /* ---- 카트 간 충돌 (무게 기반 밀어내기) ---- */
    _kartCollisions() {
      const n = this.karts.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = this.karts[i], b = this.karts[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = 30 * (a.scale + b.scale) / 2 + 8;
          if (d > minD || d < 0.001) continue;
          const nx = dx / d, ny = dy / d;
          const overlap = minD - d;

          // 스타 / 로켓 : 접촉한 상대를 날려버린다
          const aStar = a.starTimer > 0, bStar = b.starTimer > 0;
          const aBull = a.state === 'BULLET', bBull = b.state === 'BULLET';
          // 스타는 날려버리고, 로켓는 밀어내며 스핀아웃시킨다
          if ((aStar || aBull) && !(bStar || bBull)) { this.hitKart(b, aStar ? 'knock' : 'spin', nx, ny, 0.85, a); continue; }
          if ((bStar || bBull) && !(aStar || aBull)) { this.hitKart(a, bStar ? 'knock' : 'spin', -nx, -ny, 0.85, b); continue; }

          const ma = a.phys.mass * a.scale, mb = b.phys.mass * b.scale;
          const tot = ma + mb;
          a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
          b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
          // 횡방향 반발 + 약간의 감속
          const push = 60 * (overlap / minD);
          a.vlat -= nx * push * (mb / tot); b.vlat += nx * push * (ma / tot);
          a.speed *= 0.985; b.speed *= 0.985;
          a.shake = Math.max(a.shake, 0.12); b.shake = Math.max(b.shake, 0.12);
        }
      }
    }

    /* ---- 아이템 박스 ---- */
    _itemBoxes(dt) {
      for (const box of this.track.itemBoxes) {
        if (box.respawn > 0) { box.respawn -= dt; continue; }
        for (const k of this.karts) {
          if (k.finished) continue;
          const d = Math.hypot(k.x - box.x, k.y - box.y);
          if (d < 34) {
            if (k.canGetItem()) {
              // 순위 확인 -> 가중치 테이블 조회 -> 1.5초 룰렛 연출
              k.startRoulette(k.rank, this.karts.length, (res) => {
                if (k.isPlayer) {
                  this.hud.showToast(res.name, '#ffd54a', res.id);
                  global.SFX.sfx('itemget');
                }
              });
              if (k.isPlayer) global.SFX.sfx('item');
            }
            box.respawn = 6.5;
            for (let i = 0; i < 14; i++) {
              this.renderer.spawn(box.x, box.y, 20, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160,
                Math.random() * 160, 0.5, ['#ffd54a', '#9fe8ff', '#ffffff'][i % 3], 4, 'spark');
            }
            break;
          }
        }
      }
    }

    _thwompHits() {
      for (const t of this.track.thwomps) {
        if (t.h > 18) continue;
        for (const k of this.karts) {
          if (k.invincible) continue;
          const d = Math.hypot(k.x - t.x, k.y - t.y);
          if (d < 40) {
            this.hitKart(k, 'knock', k.x - t.x, k.y - t.y, 0.8, null);
            this.renderer.camera.shake = Math.max(this.renderer.camera.shake, 0.8);
          }
        }
      }
    }

    /* ---- 피격 처리 (FSM 진입 지점) ---- */
    hitKart(k, kind, dx, dy, power, source) {
      if (k.finished) return false;
      let ok = false;
      if (kind === 'spin') {
        ok = k.spinOut();
        if (ok) {
          global.SFX.sfx('spin');
          for (let i = 0; i < 12; i++) {
            this.renderer.spawn(k.x, k.y, 14, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140,
              Math.random() * 120, 0.6, '#ffffff', 4, 'spark');
          }
        }
      } else if (kind === 'knock') {
        ok = k.knockback(dx, dy, power || 1);
        if (ok) {
          global.SFX.sfx('explode');
          this.renderer.camera.shake = Math.max(this.renderer.camera.shake, k.isPlayer ? 1 : 0.3);
          for (let i = 0; i < 30; i++) {
            this.renderer.spawn(k.x, k.y, 12, (Math.random() - 0.5) * 320, (Math.random() - 0.5) * 320,
              Math.random() * 300, 0.7 + Math.random() * 0.4,
              ['#ffd54a', '#ff8a2a', '#ff4a1a', '#666'][i % 4], 6, i % 4 === 3 ? 'smoke' : 'dot');
          }
          // 드롭된 동전을 필드에 흩뿌린다
          const drop = k.droppedThisHit;
          if (drop && drop.coins > 0) {
            for (let i = 0; i < drop.coins; i++) {
              const a = Math.random() * 6.28, r = 30 + Math.random() * 40;
              this.hazards.push({
                type: 'coin', sprite: 'coin', x: k.x + Math.cos(a) * r, y: k.y + Math.sin(a) * r,
                z: 10, vx: 0, vy: 0, life: 9, size: 28, owner: null, pickup: true
              });
            }
          }
          k.droppedThisHit = null;
        }
      } else if (kind === 'shrink') {
        ok = k.shrink();
      }
      if (ok && k.isPlayer) this.renderer.flash = 0.5;
      return ok;
    }

    /* ---- 아이템 사용 ---- */
    useItem(k) {
      if (!k.item || !k.controllable) return;
      const id = k.item.id;
      const it = k.consumeItem();
      const c = Math.cos(k.angle), s = Math.sin(k.angle);
      const notify = (msg, col, icon) => { if (k.isPlayer) this.hud.showToast(msg, col, icon); };

      switch (id) {
        case 'banana':
          this.hazards.push({
            type: 'banana', sprite: 'banana', x: k.x - c * 46, y: k.y - s * 46, z: 6,
            vx: 0, vy: 0, life: 30, size: 42, owner: k, hitKind: 'spin'
          });
          global.SFX.sfx('item');
          break;
        case 'greenshell':
          this.hazards.push({
            type: 'greenshell', sprite: 'greenshell', x: k.x + c * 52, y: k.y + s * 52, z: 8,
            vx: c * 660, vy: s * 660, life: 9, size: 40, owner: k, hitKind: 'spin',
            bounces: 3, spin: true, grace: 0.25
          });
          global.SFX.sfx('shell');
          break;
        case 'redshell': {
          const target = this.standings[Math.max(0, k.rank - 2)] || null;
          this.hazards.push({
            type: 'redshell', sprite: 'redshell', x: k.x + c * 52, y: k.y + s * 52, z: 8,
            vx: c * 620, vy: s * 620, life: 9, size: 40, owner: k, hitKind: 'spin',
            homing: target && target !== k ? target : null, spin: true, grace: 0.2
          });
          global.SFX.sfx('shell');
          break;
        }
        case 'coin':
          k.addCoin(2); k.giveBoost(0.4, 1.12, 'coin');
          global.SFX.sfx('coin');
          notify('동전 +2', '#ffd54a', 'coin');
          break;
        case 'mushroom':
        case 'triplemush':
          k.giveBoost(0.9, 1.4, 'mush');
          global.SFX.sfx('boost');
          notify('대시 부스트!', '#ff8a8a', 'mushroom');
          break;
        case 'bobomb':
          this.hazards.push({
            type: 'bobomb', sprite: 'bobomb', x: k.x + c * 58, y: k.y + s * 58, z: 10,
            vx: c * 480, vy: s * 480, life: 2.2, size: 44, owner: k, fuse: 1.9, explodes: true, grace: 0.2
          });
          global.SFX.sfx('item');
          break;
        case 'bulletbill':
          k.startBullet();
          global.SFX.sfx('boost');
          notify('로켓 발동!', '#ffd54a', 'bulletbill');
          break;
        case 'star':
          k.starTimer = 7;
          k.giveBoost(7, 1.14, 'star');
          global.SFX.sfx('star');
          notify('무적 스타!', '#ffd54a', 'star');
          break;
        case 'spiny': {
          const lead = this.standings[0];
          this.hazards.push({
            type: 'spiny', sprite: 'spiny', x: k.x + c * 52, y: k.y + s * 52, z: 40,
            vx: c * 520, vy: s * 520, life: 14, size: 46, owner: k,
            homing: lead !== k ? lead : null, explodes: true, spin: true, speed: 780, grace: 0.1
          });
          global.SFX.sfx('shell');
          break;
        }
        case 'lightning':
          this.renderer.flash = 0.9; this.renderer.flashColor = '255,255,180';
          global.SFX.sfx('lightning');
          for (const o of this.karts) if (o !== k) this.hitKart(o, 'shrink');
          notify('번개! 전원 축소', '#f2e14c', 'lightning');
          if (!k.isPlayer && this.player && this.player.shrinkTimer > 0) this.hud.showToast('번개 피격! 5초간 축소', '#f2e14c', 'lightning');
          break;
      }
    }

    /* ---- 투사체 / 트랩 갱신 ---- */
    _updateHazards(dt) {
      const list = this.hazards;
      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        h.life -= dt;
        if (h.grace > 0) h.grace -= dt;
        if (h.life <= 0) {
          if (h.explodes) this._explode(h);
          list.splice(i, 1); continue;
        }

        if (h.homing && !h.homing.finished) {
          const dx = h.homing.x - h.x, dy = h.homing.y - h.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = h.speed || 640;
          const desired = Math.atan2(dy, dx);
          const cur = Math.atan2(h.vy, h.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const na = cur + Math.max(-4.5 * dt, Math.min(4.5 * dt, diff * 4));
          h.vx = Math.cos(na) * sp; h.vy = Math.sin(na) * sp;
          if (h.type === 'spiny') {
            h.z = 40 + Math.sin(this.time * 4) * 14;
            if (d < 200) h.z = Math.max(8, h.z * (d / 200));
          }
        }

        h.x += h.vx * dt; h.y += h.vy * dt;

        // 코스 밖 반사 / 소멸
        const surf = this.track.surfaceAt(h.x, h.y);
        const offCourse = surf === S.OFFROAD || surf === S.VOID || surf === S.LAVA;
        if (offCourse && (h.vx || h.vy)) {
          if (h.bounces > 0) {
            const p = this.track.project(h.x, h.y);
            const nx = -Math.sign(p.lateral) * p.node.nx, ny = -Math.sign(p.lateral) * p.node.ny;
            const dot = h.vx * nx + h.vy * ny;
            h.vx -= 2 * dot * nx; h.vy -= 2 * dot * ny;
            h.x += nx * 12; h.y += ny * 12;
            h.bounces--;
            global.SFX.sfx('shell');
          } else if (h.type !== 'spiny' && h.type !== 'coin') {
            if (h.explodes) this._explode(h);
            list.splice(i, 1); continue;
          }
        }

        // 카트 충돌
        for (const k of this.karts) {
          if (k.finished) continue;
          if (h.owner === k && h.grace > 0) continue;
          if (h.type === 'spiny' && h.homing && k !== h.homing) continue;
          const dist = Math.hypot(k.x - h.x, k.y - h.y);
          if (dist > 34 + (h.size || 40) * 0.32) continue;

          if (h.pickup) { k.addCoin(1); global.SFX.sfx('coin'); list.splice(i, 1); break; }
          if (k.invincible) {
            if (h.type !== 'banana') { list.splice(i, 1); }
            break;
          }
          if (h.explodes) { this._explode(h); list.splice(i, 1); break; }
          this.hitKart(k, h.hitKind || 'spin', k.x - h.x, k.y - h.y, 1, h.owner);
          list.splice(i, 1);
          break;
        }
      }
    }

    _explode(h) {
      this.renderer.camera.shake = Math.max(this.renderer.camera.shake, 0.55);
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * 6.28, sp = 120 + Math.random() * 320;
        this.renderer.spawn(h.x, h.y, 10, Math.cos(a) * sp, Math.sin(a) * sp, Math.random() * 340,
          0.6 + Math.random() * 0.5, ['#fff3a8', '#ffb020', '#ff5a1a', '#5a5a5a'][i % 4], 7,
          i % 4 === 3 ? 'smoke' : 'dot');
      }
      global.SFX.sfx('explode');
      for (const k of this.karts) {
        if (k.invincible || k.finished) continue;
        const d = Math.hypot(k.x - h.x, k.y - h.y);
        if (d < 105) this.hitKart(k, 'knock', k.x - h.x, k.y - h.y, 1 - d / 220, h.owner);
      }
    }

    /* ---- 주행 파티클 ---- */
    _emitParticles(k, dt) {
      const R = this.renderer;
      const c = Math.cos(k.angle), s = Math.sin(k.angle);
      const rx = k.x - c * 26, ry = k.y - s * 26;

      // 드리프트 스파크
      if (k.drifting && k.driftStage >= 0 && Math.random() < 0.75) {
        const st = K.MT_STAGES[k.driftStage];
        R.spawn(rx + (Math.random() - 0.5) * 24, ry + (Math.random() - 0.5) * 24, 6,
          -c * 60 + (Math.random() - 0.5) * 90, -s * 60 + (Math.random() - 0.5) * 90,
          40 + Math.random() * 90, 0.32, st.color, 4, 'spark');
      }
      // 오프로드 흙먼지 / 무지개 빛가루 / 용암 불티
      if (Math.abs(k.speed) > 60) {
        if (k.surface === S.OFFROAD && Math.random() < 0.6) {
          R.spawn(rx, ry, 4, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 30 + Math.random() * 50,
            0.6, this.track.theme === 'circuit' ? 'rgba(150,200,110,0.9)' : 'rgba(180,150,120,0.9)', 5, 'smoke');
        }
        if (this.track.theme === 'rainbow' && k.surface === S.ROAD && Math.random() < 0.85) {
          const hue = (this.time * 240 + k.x * 0.3) % 360;
          R.spawn(rx + (Math.random() - 0.5) * 20, ry + (Math.random() - 0.5) * 20, 5,
            (Math.random() - 0.5) * 130, (Math.random() - 0.5) * 130, 40 + Math.random() * 130,
            0.5, 'hsl(' + hue + ',100%,70%)', 3.4, 'spark');
        }
        if (k.surface === S.LAVA && Math.random() < 0.9) {
          R.spawn(rx, ry, 4, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 60 + Math.random() * 160,
            0.5, ['#ffd24a', '#ff7a1e'][(Math.random() * 2) | 0], 4, 'dot');
        }
      }
      // 부스터 배기 불꽃
      if (k.boostTimer > 0 && Math.random() < 0.9) {
        R.spawn(rx, ry, 8, -c * 140 + (Math.random() - 0.5) * 60, -s * 140 + (Math.random() - 0.5) * 60,
          20 + Math.random() * 60, 0.32, ['#ffffff', '#ffd66b', '#ff8a2a'][(Math.random() * 3) | 0], 6, 'dot');
      }
    }
  }

  /* =============================================================
   * 입력
   * ============================================================= */
  class Input {
    constructor() {
      this.keys = {};
      this.touch = { throttle: 0, steer: 0, drift: false, item: false };
      window.addEventListener('keydown', e => {
        this.keys[e.code] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', e => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });
    }
    apply(k) {
      const K1 = this.keys, t = this.touch;
      const up = K1['ArrowUp'] || K1['KeyW'] || t.throttle > 0;
      const down = K1['ArrowDown'] || K1['KeyS'];
      const left = K1['ArrowLeft'] || K1['KeyA'];
      const right = K1['ArrowRight'] || K1['KeyD'];
      k.input.throttle = up ? 1 : (down ? -1 : 0);
      k.input.brake = !!down && k.speed > 0;
      k.input.steer = (left ? -1 : 0) + (right ? 1 : 0) + t.steer;
      k.input.steer = Math.max(-1, Math.min(1, k.input.steer));
      k.input.drift = !!(K1['ShiftLeft'] || K1['ShiftRight'] || K1['KeyZ'] || t.drift);
    }
    itemPressed() {
      const p = this.keys['Space'] || this.keys['KeyX'] || this.touch.item;
      const fire = p && !this._prev;
      this._prev = p;
      return fire;
    }
  }

  global.Game = { World, Input, CPU_NAMES };
})(window);
