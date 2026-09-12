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
      this._initPreview();

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
      this._syncPreviewModel();
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
        const im = document.createElement('img');
        im.className = 'thumb';
        im.width = 88; im.height = 66;
        im.alt = item.name;
        card.appendChild(im);
        const nm = document.createElement('div');
        nm.className = 'nm'; nm.textContent = item.name;
        card.appendChild(nm);
        const cl = document.createElement('div');
        cl.className = 'cl';
        cl.textContent = item.clsName || this.deltaLabel(item);
        card.appendChild(cl);
        g.appendChild(card);

        // 미니 프리뷰 (3D 스냅샷, 조합별 캐시)
        const probe = St.build(
          this.tab === 'character' ? item.id : this.sel.char,
          this.tab === 'frame' ? item.id : this.sel.frame,
          this.tab === 'wheel' ? item.id : this.sel.wheel,
          this.tab === 'glider' ? item.id : this.sel.glider);
        im.src = global.Icons.kartThumbURL(probe, 132);

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

    /* ---------- 3D 프리뷰 (three.js 실시간 턴테이블) ---------- */
    _initPreview() {
      const T = global.THREE;
      // 컨텍스트를 한 번 잃은 캔버스는 재사용할 수 없으므로 새 노드로 교체한다
      const prev = this.$.preview;
      const cv = prev.cloneNode(false);
      prev.parentNode.replaceChild(cv, prev);
      this.$.preview = cv;
      const gl = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      gl.setSize(cv.clientWidth || 520, cv.clientHeight || 300, false);
      gl.toneMapping = T.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.1;
      gl.outputColorSpace = T.SRGBColorSpace;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = T.PCFSoftShadowMap;

      const sc = new T.Scene();
      sc.add(new T.HemisphereLight(0x9fc4ff, 0x141a33, 1.7));
      const key = new T.DirectionalLight(0xffffff, 3.2);
      key.position.set(70, 110, 60);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -70; key.shadow.camera.right = 70;
      key.shadow.camera.top = 70; key.shadow.camera.bottom = -70;
      key.shadow.camera.near = 20; key.shadow.camera.far = 300;
      key.shadow.bias = -0.002;
      sc.add(key);
      const rim = new T.DirectionalLight(0x6ab8ff, 2.2);
      rim.position.set(-80, 40, -70);
      sc.add(rim);
      const warm = new T.DirectionalLight(0xffb46a, 1.0);
      warm.position.set(40, 20, -60);
      sc.add(warm);

      // 스테이지 (원형 플랫폼 + 발광 링)
      const stage = new T.Group();
      const disc = new T.Mesh(
        new T.CylinderGeometry(62, 66, 5, 48),
        new T.MeshStandardMaterial({ color: new T.Color('#121a35'), roughness: 0.55, metalness: 0.4 })
      );
      disc.position.y = -2.5;
      disc.receiveShadow = true;
      stage.add(disc);
      [42, 54, 62].forEach((r, i) => {
        const ring = new T.Mesh(
          new T.TorusGeometry(r, 0.55, 8, 64),
          new T.MeshBasicMaterial({ color: new T.Color(i === 2 ? '#ffd54a' : '#4fc3ff'), toneMapped: false })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.4;
        stage.add(ring);
      });
      sc.add(stage);

      const cam = new T.PerspectiveCamera(34, (cv.clientWidth || 520) / (cv.clientHeight || 300), 1, 900);
      this._pv = { gl, sc, cam, model: null, raf: 0, stage };
      this._syncPreviewModel();
    },

    _syncPreviewModel() {
      const pv = this._pv;
      if (!pv || !this.combo) return;   // rebuild() 이전에는 아직 조합이 없다
      if (pv.model) pv.sc.remove(pv.model);
      const m = global.Models.buildKart(this.combo);
      m.rotation.y = 0;
      pv.sc.add(m);
      pv.model = m;
    },

    suspendPreview() {
      const pv = this._pv;
      if (!pv) return;
      cancelAnimationFrame(pv.raf);
      pv.gl.dispose();
      if (pv.gl.forceContextLoss) pv.gl.forceContextLoss();
      this._pv = null;
      if (global.Icons.release) global.Icons.release();
    },

    resumePreview() {
      if (!this._pv) { this._initPreview(); this.loop(); }
    },

    loop() {
      const step = () => {
        const pv = this._pv;
        if (!pv) return;
        pv.raf = requestAnimationFrame(step);
        const cv = this.$.preview;
        const w = cv.clientWidth || 520, h = cv.clientHeight || 300;
        if (cv.width !== w * pv.gl.getPixelRatio() || pv.cam.aspect !== w / h) {
          pv.gl.setSize(w, h, false);
          pv.cam.aspect = w / h;
          pv.cam.updateProjectionMatrix();
        }
        if (this.spinning) this.previewAngle += 0.0075;
        const a = this.previewAngle;
        const d = 148;
        pv.cam.position.set(Math.cos(a) * d, 52 + Math.sin(a * 0.7) * 6, Math.sin(a) * d);
        pv.cam.lookAt(0, 16, 0);
        if (pv.model) pv.model.position.y = Math.sin(Date.now() * 0.0016) * 1.4;
        pv.stage.rotation.y += 0.0015;
        pv.gl.render(pv.sc, pv.cam);
      };
      step();
    },

    /* ---------- 룰렛 시뮬레이터 ---------- */
    renderProbs() {
      const rank = +this.$.rankSlider.value;
      this.$.rankVal.textContent = rank + '위';
      const probs = global.ItemSystem.probabilities(rank, 8);
      this.$.probList.innerHTML = probs.map(p =>
        '<div class="prob"><img src="' + global.Icons.url(p.id) + '" alt="' + p.item.name + '" title="' + p.item.name + '">' +
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
        slot.innerHTML = r.display ? '<img src="' + global.Icons.url(r.display.id) + '" alt="">' : '?';
        if (r.active) { global.SFX.sfx('item'); requestAnimationFrame(tick); }
        else {
          slot.innerHTML = '<img src="' + global.Icons.url(result.id) + '" alt="">';
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
