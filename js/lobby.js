/* =============================================================
 * lobby.js - 로비 / 대시보드 UI
 *   파츠 커스텀 · 실시간 스탯 바 · 3D 프리뷰 · 룰렛 시뮬레이터
 *   트랙 선택 카드 · 네트워크 대기실(파티 룸)
 * ============================================================= */
(function (global) {
  'use strict';

  const D = global.GameData;
  const St = global.Stats;

  const TABS = {
    character: { list: D.CHARACTERS, key: 'char' },
    frame: { list: D.FRAMES, key: 'frame' },
    wheel: { list: D.WHEELS, key: 'wheel' },
    glider: { list: D.GLIDERS, key: 'glider' }
  };

  const Lobby = {
    sel: { char: 'mario', frame: 'standard', wheel: 'std', glider: 'super', track: 'circuit' },
    tab: 'character',
    combo: null,
    prevStats: null,
    previewAngle: 0.7,
    spinning: true,
    ready: false,
    slots: [],
    onStart: null,

    init(onStart) {
      this.onStart = onStart;
      this.$ = {
        tabs: document.getElementById('partTabs'),
        grid: document.getElementById('partGrid'),
        desc: document.getElementById('partDesc'),
        statBars: document.getElementById('statBars'),
        comboName: document.getElementById('comboName'),
        classBadge: document.getElementById('classBadge'),
        totalBadge: document.getElementById('totalBadge'),
        flavor: document.getElementById('charFlavor'),
        preview: document.getElementById('previewCanvas'),
        rankSlider: document.getElementById('rankSlider'),
        rankVal: document.getElementById('rankVal'),
        rouletteSlot: document.getElementById('rouletteSlot'),
        probList: document.getElementById('probList'),
        rollLog: document.getElementById('rollLog'),
        trackCards: document.getElementById('trackCards'),
        slots: document.getElementById('playerSlots'),
        roomStatus: document.getElementById('roomStatus'),
        btnReady: document.getElementById('btnReady'),
        btnStart: document.getElementById('btnStart'),
        cpuDiff: document.getElementById('cpuDiff'),
        lapCount: document.getElementById('lapCount'),
        myPing: document.getElementById('myPing')
      };
      this.pctx = this.$.preview.getContext('2d');

      this.$.tabs.addEventListener('click', e => {
        const b = e.target.closest('.tab'); if (!b) return;
        this.tab = b.dataset.tab;
        [...this.$.tabs.children].forEach(t => t.classList.toggle('active', t === b));
        this.renderGrid();
        global.SFX.sfx('ui');
      });

      document.getElementById('btnSpin').addEventListener('click', () => { this.spinning = !this.spinning; });
      document.getElementById('btnRoll').addEventListener('click', () => this.simulateRoll());
      this.$.rankSlider.addEventListener('input', () => this.renderProbs());
      this.$.btnReady.addEventListener('click', () => this.toggleReady());
      this.$.btnStart.addEventListener('click', () => this.startRace());
      this.$.lapCount.addEventListener('change', () => this.renderTracks());

      this.rebuild();
      this.renderGrid();
      this.renderTracks();
      this.renderProbs();
      this.buildRoom();
      this.loop();
      setInterval(() => this.tickRoom(), 900);
    },

    rebuild() {
      this.prevStats = this.combo ? Object.assign({}, this.combo.stats) : null;
      this.combo = St.build(this.sel.char, this.sel.frame, this.sel.wheel, this.sel.glider);
      this.renderStats();
      const c = this.combo;
      this.$.comboName.textContent = c.character.name + ' · ' + c.frame.name + ' · ' + c.wheel.name;
      this.$.classBadge.textContent = c.character.clsName;
      this.$.totalBadge.textContent = 'TOTAL ' + c.total.toFixed(1);
      this.$.flavor.textContent = c.character.flavor;
      if (this.slots[0]) {
        this.slots[0].combo = c;
        this.renderRoom();
      }
    },

    /* ---------- 파츠 그리드 ---------- */
    renderGrid() {
      const tab = TABS[this.tab];
      const g = this.$.grid;
      g.innerHTML = '';
      tab.list.forEach(item => {
        const selId = this.sel[tab.key];
        const card = document.createElement('button');
        card.className = 'part-card' + (item.id === selId ? ' sel' : '');
        const cv = document.createElement('canvas');
        cv.width = 88; cv.height = 62;
        card.appendChild(cv);
        const nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = item.name;
        card.appendChild(nm);
        const cl = document.createElement('div');
        cl.className = 'cl';
        cl.textContent = item.clsName || this.deltaLabel(item);
        card.appendChild(cl);
        g.appendChild(card);

        // 미니 프리뷰
        const probe = St.build(
          this.tab === 'character' ? item.id : this.sel.char,
          this.tab === 'frame' ? item.id : this.sel.frame,
          this.tab === 'wheel' ? item.id : this.sel.wheel,
          this.tab === 'glider' ? item.id : this.sel.glider);
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, 88, 62);
        global.Sprites.preview(cx, probe, 0.85, 0.62, 44, 46);

        card.addEventListener('mouseenter', () => { this.$.desc.textContent = item.desc || ''; });
        card.addEventListener('click', () => {
          this.sel[tab.key] = item.id;
          global.SFX.sfx('ui');
          this.rebuild();
          this.renderGrid();
          this.$.desc.textContent = item.desc || '';
        });
      });
      const cur = tab.list.find(i => i.id === this.sel[tab.key]);
      this.$.desc.textContent = cur ? (cur.desc || '') : '';
    },

    deltaLabel(item) {
      const t = D.STAT_KEYS.reduce((a, k) => a + (item.stats[k] || 0), 0);
      return (t > 0 ? '+' : '') + t.toFixed(2).replace(/\.?0+$/, '') + ' 합계';
    },

    /* ---------- 스탯 바 ---------- */
    renderStats() {
      const el = this.$.statBars;
      const s = this.combo.stats, prev = this.prevStats;
      if (!el.children.length) {
        D.STAT_KEYS.forEach(k => {
          const row = document.createElement('div');
          row.className = 'stat';
          row.innerHTML = '<span class="lb">' + D.STAT_LABEL[k] + '</span>' +
            '<span class="track-bar"><i class="fill" data-k="' + k + '"></i></span>' +
            '<span class="vl" data-v="' + k + '"></span>';
          el.appendChild(row);
        });
      }
      D.STAT_KEYS.forEach(k => {
        const fill = el.querySelector('.fill[data-k="' + k + '"]');
        const val = el.querySelector('.vl[data-v="' + k + '"]');
        fill.style.width = (s[k] / St.STAT_MAX * 100) + '%';
        fill.classList.remove('up', 'down');
        if (prev) {
          if (s[k] > prev[k] + 0.001) fill.classList.add('up');
          else if (s[k] < prev[k] - 0.001) fill.classList.add('down');
        }
        val.textContent = s[k].toFixed(2);
      });
    },

    /* ---------- 3D 프리뷰 루프 ---------- */
    loop() {
      const step = () => {
        const cv = this.$.preview, cx = this.pctx;
        const w = cv.width, h = cv.height;
        cx.clearRect(0, 0, w, h);
        // 스테이지 바닥
        const g = cx.createRadialGradient(w / 2, h * 0.82, 8, w / 2, h * 0.82, w * 0.42);
        g.addColorStop(0, 'rgba(120,160,255,.28)'); g.addColorStop(1, 'rgba(20,30,70,0)');
        cx.fillStyle = g;
        cx.beginPath(); cx.ellipse(w / 2, h * 0.82, w * 0.36, h * 0.13, 0, 0, 6.28); cx.fill();
        cx.strokeStyle = 'rgba(140,180,255,.18)';
        for (let i = 1; i <= 4; i++) {
          cx.beginPath(); cx.ellipse(w / 2, h * 0.82, w * 0.09 * i, h * 0.033 * i, 0, 0, 6.28); cx.stroke();
        }
        if (this.spinning) this.previewAngle += 0.012;
        cx.fillStyle = 'rgba(0,0,0,.32)';
        cx.beginPath(); cx.ellipse(w / 2, h * 0.8, 66, 17, 0, 0, 6.28); cx.fill();
        global.Sprites.preview(cx, this.combo, this.previewAngle, 2.05, w / 2, h * 0.78);
        requestAnimationFrame(step);
      };
      step();
    },

    /* ---------- 룰렛 시뮬레이터 ---------- */
    renderProbs() {
      const rank = +this.$.rankSlider.value;
      this.$.rankVal.textContent = rank + '위';
      const probs = global.ItemSystem.probabilities(rank, 8);
      this.$.probList.innerHTML = probs.map(p =>
        '<div class="prob"><img src="' + global.Sprites.itemArtURL(p.id) + '" alt="' + p.item.name + '" title="' + p.item.name + '">' +
        '<span class="pb"><i class="pf" style="width:' + p.pct.toFixed(1) + '%;background:' + p.item.color + '"></i></span>' +
        '<span class="pv">' + p.pct.toFixed(1) + '%</span></div>').join('');
    },

    simulateRoll() {
      if (this._rolling) return;
      const rank = +this.$.rankSlider.value;
      const slot = this.$.rouletteSlot;
      const r = new global.ItemSystem.Roulette(1.5);
      const result = r.start(rank, 8, null);
      this._rolling = true;
      slot.classList.add('spinning');
      global.SFX.init(); global.SFX.resume();
      let last = performance.now();
      const tick = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        r.update(dt);
        slot.innerHTML = r.display ? '<img src="' + global.Sprites.itemArtURL(r.display.id) + '" alt="">' : '?';
        if (r.active) { global.SFX.sfx('item'); requestAnimationFrame(tick); }
        else {
          slot.innerHTML = '<img src="' + global.Sprites.itemArtURL(result.id) + '" alt="">';
          slot.classList.remove('spinning');
          this._rolling = false;
          global.SFX.sfx('itemget');
          const line = '<div>' + rank + '위 → <b style="color:' + result.color + '">' + result.name + '</b> — ' + result.desc + '</div>';
          this.$.rollLog.innerHTML = line + this.$.rollLog.innerHTML.split('</div>').slice(0, 2).join('</div>');
        }
      };
      requestAnimationFrame(tick);
    },

    /* ---------- 트랙 카드 ---------- */
    renderTracks() {
      const el = this.$.trackCards;
      el.innerHTML = '';
      D.TRACKS.forEach(t => {
        const card = document.createElement('button');
        card.className = 'track-card' + (t.id === this.sel.track ? ' sel' : '');
        card.innerHTML =
          '<span class="diff">' + '★'.repeat(t.difficulty) + '</span>' +
          '<canvas width="220" height="74"></canvas>' +
          '<div class="tinfo"><div class="tn">' + t.name + '</div>' +
          '<div class="ts">' + t.subtitle + ' · ' + this.$.lapCount.value + ' LAPS</div>' +
          '<div class="td">' + t.desc + '</div></div>';
        el.appendChild(card);
        drawTrackThumb(card.querySelector('canvas'), t);
        card.addEventListener('click', () => {
          this.sel.track = t.id;
          global.SFX.sfx('ui');
          this.renderTracks();
        });
      });
    },

    /* ---------- 파티 룸 ---------- */
    buildRoom() {
      const rnd = a => a[(Math.random() * a.length) | 0];
      this.slots = [{ name: '나 (Player)', me: true, ready: false, ping: 24, combo: this.combo }];
      global.Game.CPU_NAMES.forEach(n => {
        const combo = St.build(rnd(D.CHARACTERS).id, rnd(D.FRAMES).id, rnd(D.WHEELS).id, rnd(D.GLIDERS).id);
        this.slots.push({ name: n, me: false, ready: false, ping: 18 + ((Math.random() * 90) | 0), combo });
      });
      this.renderRoom();
    },

    tickRoom() {
      let changed = false;
      for (const s of this.slots) {
        if (s.me) continue;
        if (!s.ready && Math.random() < 0.45) { s.ready = true; changed = true; }
        if (Math.random() < 0.4) { s.ping = Math.max(12, s.ping + ((Math.random() * 30) | 0) - 15); changed = true; }
      }
      const p = 18 + ((Math.random() * 16) | 0);
      this.$.myPing.textContent = p;
      this.slots[0].ping = p;
      if (changed) this.renderRoom();
    },

    renderRoom() {
      const el = this.$.slots;
      el.innerHTML = this.slots.map(s => {
        const c = s.combo;
        const st = c.stats;
        const pingCls = s.ping < 45 ? 'good' : (s.ping < 90 ? 'mid' : 'bad');
        return '<div class="slot' + (s.me ? ' me' : '') + '">' +
          '<span class="av" style="background:' + c.character.colors.accent + '">' + c.character.name.slice(0, 1) + '</span>' +
          '<span class="info"><span class="nm">' + s.name + '</span>' +
          '<span class="sp">' + c.character.name + ' / ' + c.frame.name + '</span>' +
          '<span class="pg">속' + st.speed.toFixed(1) + ' 가' + st.accel.toFixed(1) +
          ' 무' + st.weight.toFixed(1) + ' 핸' + st.handling.toFixed(1) +
          ' <span class="dot ' + pingCls + '"></span>' + s.ping + 'ms</span></span>' +
          '<span class="st ' + (s.ready ? 'ready' : 'wait') + '">' + (s.ready ? 'READY' : 'WAITING') + '</span>' +
          '</div>';
      }).join('');
      const readyCount = this.slots.filter(s => s.ready).length;
      const all = readyCount === this.slots.length;
      this.$.roomStatus.textContent = readyCount + '/' + this.slots.length + ' READY' + (all ? ' — 방장 시작 가능' : '');
      this.$.btnStart.disabled = !all;
      this.$.btnReady.textContent = this.slots[0].ready ? 'READY 취소' : 'READY';
    },

    toggleReady() {
      this.slots[0].ready = !this.slots[0].ready;
      global.SFX.init(); global.SFX.resume(); global.SFX.sfx('ui');
      // 방장이 준비하면 남은 CPU도 곧 준비를 마친다
      if (this.slots[0].ready) this.slots.forEach(s => { if (!s.me && Math.random() < 0.7) s.ready = true; });
      this.renderRoom();
    },

    startRace() {
      global.SFX.init(); global.SFX.resume();
      this.onStart({
        combo: this.combo,
        trackId: this.sel.track,
        laps: +this.$.lapCount.value,
        skill: +this.$.cpuDiff.value,
        opponents: this.slots.slice(1).map(s => ({ name: s.name, combo: s.combo }))
      });
    }
  };

  /* 트랙 썸네일 (전체 트랙 생성 없이 제어점만으로 그린다) */
  function drawTrackThumb(cv, def) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    if (def.theme === 'circuit') { bg.addColorStop(0, '#2c6d3a'); bg.addColorStop(1, '#17381f'); }
    else if (def.theme === 'bowser') { bg.addColorStop(0, '#5c1a08'); bg.addColorStop(1, '#1a0704'); }
    else { bg.addColorStop(0, '#0b0620'); bg.addColorStop(1, '#04020c'); }
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    if (def.theme === 'rainbow') {
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
    }
    const c = def.ctrl, n = c.length, pts = [];
    for (let i = 0; i < n; i++) {
      const p0 = c[(i - 1 + n) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
      for (let j = 0; j < 10; j++) {
        const t = j / 10, t2 = t * t, t3 = t2 * t;
        const f = (a, b, cc, d) => 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    // 2048 월드를 썸네일에 맞춰 정규화
    const pad = 9, k = Math.min((W - pad * 2), (H - pad * 2)) / 2048;
    const ox = (W - 2048 * k) / 2, oy = (H - 2048 * k) / 2;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    pts.forEach((p, i) => { const x = ox + p[0] * k, y = oy + p[1] * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath();
    g.strokeStyle = def.theme === 'bowser' ? '#2b2320' : '#ffffff';
    g.lineWidth = 8; g.stroke();
    if (def.theme === 'rainbow') {
      pts.forEach((p, i) => {
        if (i === 0) return;
        const q = pts[i - 1];
        g.strokeStyle = 'hsl(' + (i / pts.length * 360) + ',90%,60%)';
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(ox + q[0] * k, oy + q[1] * k); g.lineTo(ox + p[0] * k, oy + p[1] * k); g.stroke();
      });
    } else {
      g.strokeStyle = def.theme === 'bowser' ? '#4a4038' : '#57575f';
      g.lineWidth = 5; g.stroke();
    }
  }

  global.Lobby = Lobby;
})(window);
