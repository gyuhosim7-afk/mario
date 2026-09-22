/* =============================================================
 * main.js - 화면 전환 / 레이스 부트스트랩 / 메인 루프
 * ============================================================= */
(function (global) {
  'use strict';

  const TIPS = [
    '드리프트를 오래 유지할수록 파랑▸주황▸보라 순으로 스파크가 강해집니다.',
    '앞차 바로 뒤에 붙으면 슬립스트림이 쌓여 순간 최고 속도가 올라갑니다.',
    '하위권일수록 로켓·번개·스파이크 셸 같은 판도를 뒤집는 아이템이 잘 나옵니다.',
    '중량급은 최고 속도가 높지만 코너 감속 후 회복이 느립니다.',
    '카운트다운 "2"가 사라진 직후 가속을 넣으면 로켓 스타트가 발동합니다.',
    '폭탄에 맞으면 소지 아이템과 동전이 필드에 떨어집니다.',
    '프리즘 로드에는 펜스가 없습니다. 코너에서 무리한 드리프트는 추락으로 이어집니다.',
    '마그마 성채의 스톰퍼는 내려찍는 타이밍을 보고 통과하세요.'
  ];

  const App = {
    screen: 'lobby',
    world: null,
    raf: null,
    paused: false,

    init() {
      this.gameCanvas = document.getElementById('gameCanvas');
      this.hudCanvas = document.getElementById('hudCanvas');
      this.renderer = new global.RenderSystem.Renderer(this.gameCanvas);
      this.hud = new global.HUDSystem.HUD(this.hudCanvas);
      this.hud.renderer = this.renderer;
      this.input = new global.Game.Input();          // 1인용 (방향키 + WASD 둘 다)
      this.input2 = null;                            // 분할 화면 2P 용

      global.Lobby.init(cfg => this.startRace(cfg));

      window.addEventListener('resize', () => this.resize());
      this.resize();

      // 도움말
      const help = document.getElementById('helpModal');
      document.getElementById('btnHelp').onclick = () => help.classList.remove('hidden');
      document.getElementById('btnHelpClose').onclick = () => help.classList.add('hidden');

      // 일시 정지
      document.getElementById('btnPause').onclick = () => this.togglePause();
      document.getElementById('btnResume').onclick = () => this.togglePause(false);
      document.getElementById('btnQuit').onclick = () => this.toLobby();
      window.addEventListener('keydown', e => {
        if (e.code === 'Escape' && this.screen === 'race') this.togglePause();
        if (e.code === 'F3') { e.preventDefault(); this.hud.debug = !this.hud.debug; }
      });

      document.getElementById('btnRetry').onclick = () => { this.show('loading'); setTimeout(() => this.startRace(this.lastCfg), 60); };
      document.getElementById('btnLobby').onclick = () => this.toLobby();

      this.setupTouch();
      this.resize();
    },

    show(id) {
      ['lobby', 'loading', 'race', 'results'].forEach(s => {
        document.getElementById(s).classList.toggle('active', s === id);
      });
      this.screen = id;
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.resize(w, h);
      this.hud.resize(w, h);
      // 터치 컨트롤이 있으면 하단 HUD를 그 위로 올린다
      this.hud.bottomInset = document.body.classList.contains('touch-mode') ? Math.min(140, h * 0.16) : 0;
      const hint = document.getElementById('rotateHint');
      if (hint) {
        const show = document.body.classList.contains('touch-mode') && h > w;
        hint.classList.toggle('hidden', !show);
        if (show) {
          clearTimeout(this._hintT);
          this._hintT = setTimeout(() => hint.classList.add('hidden'), 5000);
        }
      }
    },

    setupTouch() {
      if (!('ontouchstart' in window)) return;
      document.body.classList.add('touch-mode');
      const t = this.input.touch;
      document.querySelectorAll('.tbtn').forEach(b => {
        const act = b.dataset.act;
        const on = (v) => {
          if (act === 'left') t.steer = v ? -1 : 0;
          else if (act === 'right') t.steer = v ? 1 : 0;
          else if (act === 'accel') t.throttle = v ? 1 : 0;
          else if (act === 'drift') t.drift = v;
          else if (act === 'item') t.item = v;
        };
        b.addEventListener('touchstart', e => { e.preventDefault(); on(true); }, { passive: false });
        b.addEventListener('touchend', e => { e.preventDefault(); on(false); }, { passive: false });
        b.addEventListener('touchcancel', () => on(false));
      });
    },

    /* ---------------- 레이스 시작 ---------------- */
    startRace(cfg) {
      this.lastCfg = cfg;
      this.show('loading');
      const bar = document.getElementById('loadBar');
      const title = document.getElementById('loadTitle');
      const tip = document.getElementById('loadTip');
      tip.textContent = 'TIP · ' + TIPS[(Math.random() * TIPS.length) | 0];
      bar.style.width = '6%';
      title.textContent = '트랙 생성 중…';

      const steps = [];
      let track, karts = [];

      steps.push(async () => {
        // 외부 GLB 에셋이 있으면 먼저 불러온다 (없으면 즉시 통과)
        if (global.Assets) {
          title.textContent = '외부 에셋 확인 중…';
          await global.Assets.init();
        }
        bar.style.width = '12%';
      });

      steps.push(() => {
        track = global.TrackSystem.get(cfg.trackId);
        track.laps = cfg.laps;
        bar.style.width = '22%';
        title.textContent = '트랙 메시 · 텍스처 굽는 중…';
      });

      steps.push(() => {
        global.Lobby.suspendPreview();      // 로비 WebGL 컨텍스트 반납
        this.renderer.setTrack(track);
        bar.style.width = '48%';
        title.textContent = '카트 모델 조립 중…';
      });

      const split = cfg.mode === '2p';
      // 2P 는 1P 와 다른 캐릭터를 자동으로 잡아준다 (화면에서 구분되어야 한다)
      let combo2 = null;
      if (split) {
        const ids = global.GameData.CHARACTERS.map(c => c.id);
        const mine = cfg.combo.character.id;
        const other = ids[(ids.indexOf(mine) + 4) % ids.length];
        combo2 = global.Stats.build(other, cfg.combo.frame.id, cfg.combo.wheel.id, cfg.combo.glider.id);
      }
      const racers = [{ name: '1P', combo: cfg.combo, isPlayer: true }]
        .concat(split ? [{ name: '2P', combo: combo2, isPlayer: true }] : [])
        .concat(cfg.opponents.map(o => ({ name: o.name, combo: o.combo, isPlayer: false })));

      racers.forEach((r, i) => {
        steps.push(() => {
          const k = new global.KartSystem.Kart({
            id: i, name: r.name, combo: r.combo, isPlayer: r.isPlayer, track
          });
          k.isHuman = r.isPlayer;
          this.renderer.addKart(k);
          karts.push(k);
          bar.style.width = (48 + (i + 1) / racers.length * 42) + '%';
        });
      });

      steps.push(() => {
        title.textContent = '그리드 정렬 중…';
        bar.style.width = '100%';
        const ta = cfg.mode === 'ta';
        this.renderer.setSplit(split);
        this._split = split;
        this.input2 = split ? new global.Game.Input('arrows') : null;
        this.input.scheme = split ? 'wasd' : 'both';
        const world = new global.Game.World({
          track, renderer: this.renderer, hud: this.hud,
          timeAttack: ta, splitHud: split,
          onFinish: (res) => this.showResults(res)
        });
        // 스타팅 그리드: 무작위 배치
        const humans = karts.filter(k => k.isHuman);
        const order = karts.filter(k => !k.isHuman).sort(() => Math.random() - 0.5);
        const grid = humans.concat(order).sort(() => Math.random() - 0.5);
        grid.forEach(k => world.addKart(k, k.isHuman));
        // 그리드는 무작위로 섞이므로 players 순서도 뒤집힐 수 있다.
        // 카트 id(= racers 순서)로 다시 세워야 1P 가 위 화면, 2P 가 아래 화면이 된다.
        world.players.sort((a, b) => a.id - b.id);
        world.players.forEach((pk, i) => { pk.playerIndex = i; });
        world.player = world.players[0];
        world.karts.forEach(k => {
          if (!k.isPlayer) {
            const jitter = (Math.random() - 0.5) * 0.22;
            k.ai = new global.AI.Driver(k, Math.max(0.15, Math.min(1, cfg.skill + jitter)));
          }
        });
        world.start();
        // 타임어택: 저장된 내 최고 기록을 고스트로 띄운다 (없으면 그냥 혼자 달린다)
        if (ta && cfg.ghost && global.Ghost) {
          const rec = global.Ghost.load(track.id, track.laps);
          if (rec) {
            world.setGhost(new global.Ghost.Playback(rec));
            this.hud.showToast('고스트: 내 최고 기록 ' + fmtLap(rec.time) + ' 과 함께 주행합니다', '#9fe8ff');
          } else {
            this.hud.showToast('이 트랙 기록이 없습니다 — 이번 주행이 첫 고스트가 됩니다', '#9fe8ff');
          }
        }
        // cfg.quality 는 0(낮음)일 수 있으므로 falsy 검사를 쓰면 안 된다.
        this.renderer.setQualityMode(cfg.quality === undefined || cfg.quality === null
                                     ? 3 : cfg.quality);
        // 자동 강등이 일어나면 알려준다. 사용자가 '왜 갑자기 흐릿해졌지' 하지 않도록,
        // 그리고 렉을 제보할 때 어느 단계까지 내려갔는지 알 수 있도록.
        const QN = ['낮음', '보통', '높음', '최고'];
        this.renderer.onQualityChange = (q) => {
          if (this.renderer.qualityMode !== 'auto') return;
          if (this._lastQ === undefined) { this._lastQ = q; return; }
          const down = q < this._lastQ;
          this._lastQ = q;
          if (!down) return;
          this.hud.showToast('성능 확보를 위해 그래픽 품질을 [' + QN[q] + '] 으로 낮췄습니다 (F3 진단)',
                             '#ffd166');
        };
        // 고정 품질이라 자동 강등이 없다. 프레임이 계속 모자라면 방법만 알려준다.
        this.renderer.onPerfWarn = (fps) => {
          this.hud.showToast('프레임이 낮습니다 (' + Math.round(fps) +
                             'fps) — 로비 > 그래픽 품질을 [자동] 으로 바꾸면 자동 조절됩니다', '#ffd166');
        };
        // HUD 는 매 프레임 CPU 로 전체를 다시 칠한다. 품질 단계와 같이 해상도를 내린다.
        const hudBudget = (q) => [1100000, 1600000, 2500000, 2500000][q];
        this.hud.setPixelBudget(hudBudget(this.renderer.quality));
        const prevCb = this.renderer.onQualityChange;
        this.renderer.onQualityChange = (q) => {
          this.hud.setPixelBudget(hudBudget(q));
          if (prevCb) prevCb(q);
        };
        // 하드웨어 가속이 꺼져 있으면 알려주고 즉시 품질을 낮춘다
        const g = this.renderer.gpuInfo();
        if (g.software) {
          // 소프트웨어 렌더링은 취향이 아니라 능력 문제라 고정 품질이어도 내린다.
          const auto = cfg.quality === 'auto';
          this.renderer.setQuality(0);
          this.hud.showToast('소프트웨어 렌더링 — 품질 최저로 전환' + (auto ? '' : ' (하드웨어 가속을 켜세요)'),
                             '#ff9a8a');
        }
        this.renderer.particles.length = 0;
        this.renderer.camera.reset(world.player);
        if (split && this.renderer.camera2 && world.players[1]) {
          this.renderer.camera2.reset(world.players[1]);
          this.hud.showToast('1P: W A S D · 왼쪽 Shift · Space   |   2P: 방향키 · 오른쪽 Shift · Enter', '#9fe8ff');
        }
        this.world = world;
        this.paused = false;
        document.getElementById('pauseOverlay').classList.add('hidden');
        global.SFX.init(); global.SFX.resume(); global.SFX.startEngine();
        this.show('race');
        this.resize();
        this.lastT = performance.now();
        if (this.raf) cancelAnimationFrame(this.raf);
        this.loop();
      });

      // 프레임을 나눠 실행해 로딩 진행률이 갱신되도록 한다
      const run = (i) => {
        if (i >= steps.length) return;
        requestAnimationFrame(async () => { await steps[i](); setTimeout(() => run(i + 1), 0); });
      };
      run(0);
    },

    togglePause(v) {
      this.paused = v === undefined ? !this.paused : v;
      document.getElementById('pauseOverlay').classList.toggle('hidden', !this.paused);
      if (this.paused) { global.SFX.updateEngine(0, false); global.SFX.stopSkid(); }
    },

    toLobby() {
      this.paused = false;
      document.getElementById('pauseOverlay').classList.add('hidden');
      global.SFX.stopEngine();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.world = null;
      this.show('lobby');
      global.Lobby.resumePreview();
    },

    showResults(order) {
      global.SFX.stopEngine();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      const body = document.getElementById('resultBody');
      const me = order.findIndex(k => k.isPlayer) + 1;
      document.getElementById('resultTitle').textContent =
        me === 1 ? '🏆 1위!' : (me <= 3 ? '🎉 ' + me + '위' : me + '위');
      body.innerHTML = order.map((k, i) =>
        '<tr class="' + (k.isPlayer ? 'me' : '') + '">' +
        '<td class="pos">' + (i + 1) + '위</td>' +
        '<td>' + k.name + '</td>' +
        '<td style="color:' + k.color + ';font-size:11px">' + k.combo.character.name + ' / ' + k.combo.frame.name + '</td>' +
        '<td class="tm">' + (k.finished ? global.HUDSystem.fmtTime(k.finishTime)
          : '≈ ' + global.HUDSystem.fmtTime(k.estTime)) + '</td>' +
        '</tr>').join('');
      this.show('results');
    },

    /* ---------------- 메인 루프 ---------------- */
    loop() {
      this.raf = requestAnimationFrame(() => this.loop());
      const now = performance.now();
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      const rawDt = dt;                  // 클램프 전 실제 경과 (fps 계측용)
      if (dt > 0.05) dt = 0.05;          // 프레임 드랍 보호
      const w = this.world;
      if (!w) return;

      try {
        this._frame(dt, rawDt, w);
      } catch (e) {
        // 루프에서 예외가 나면 렌더와 HUD 가 통째로 안 돌아 화면이 그대로 얼어붙는다.
        // 사용자 눈에는 '차가 멈춘' 것처럼 보이고 원인을 알 길이 없다.
        // 한 번만 잡아서 화면에 띄우고, 이후 프레임은 계속 굴린다.
        this._crash(e);
      }
    },

    _frame(dt, rawDt, w) {
      if (!this.paused) {
        const ins = this.input2 ? [this.input, this.input2] : [this.input];
        for (let i = 0; i < ins.length; i++) {
          const pk = w.players ? w.players[i] : (i === 0 ? w.player : null);
          if (!pk || pk.finished) continue;
          ins[i].apply(pk);
          if (ins[i].itemPressed()) w.useItem(pk);
        }
        w.update(dt);
      }
      this.renderer.render(w, this.paused ? 0 : dt, this.paused ? 0 : rawDt);
      this.hud.draw(w, this.paused ? 0 : dt);
    },

    /** 루프 예외를 화면에 드러낸다 (조용히 멈추는 것보다 낫다) */
    _crash(e) {
      this._crashCount = (this._crashCount || 0) + 1;
      if (this._crashCount > 1) return;          // 매 프레임 같은 오류를 도배하지 않는다
      try { console.error('[loop]', e); } catch (_) { /* 무시 */ }
      const msg = (e && e.message ? e.message : String(e)).slice(0, 120);
      try {
        this.hud.showToast('오류가 발생했습니다 — ' + msg + ' (F3 로 진단, 새로고침으로 복구)', '#ff8a8a');
        this.hud.showBig('ERROR', '#ff6a6a', 3);
      } catch (_) { /* HUD 까지 죽었으면 DOM 으로 */ }
      let box = document.getElementById('crashBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'crashBox';
        box.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;' +
          'background:rgba(120,12,12,0.94);color:#fff;font:600 13px ui-monospace,monospace;' +
          'padding:10px 16px;border-radius:10px;max-width:90vw;white-space:pre-wrap;line-height:1.5';
        document.body.appendChild(box);
      }
      box.textContent = '게임 루프 오류\n' + msg +
        '\n브라우저 콘솔에 전체 스택이 있습니다. 새로고침하면 복구됩니다.';
    }
  };

  /** 1'23"456 형식 */
  function fmtLap(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + "'" + (s < 10 ? '0' : '') + s.toFixed(3).replace('.', '"');
  }
  global.fmtLap = fmtLap;

  window.addEventListener('DOMContentLoaded', () => App.init());
  global.App = App;
})(window);
