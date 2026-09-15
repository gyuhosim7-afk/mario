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
      this.input = new global.Game.Input();

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
        if (global.Assets && !global.Assets._attempted) {
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

      const racers = [{ name: '나 (Player)', combo: cfg.combo, isPlayer: true }]
        .concat(cfg.opponents.map(o => ({ name: o.name, combo: o.combo, isPlayer: false })));

      racers.forEach((r, i) => {
        steps.push(() => {
          const k = new global.KartSystem.Kart({
            id: i, name: r.name, combo: r.combo, isPlayer: r.isPlayer, track
          });
          this.renderer.addKart(k);
          karts.push(k);
          bar.style.width = (48 + (i + 1) / racers.length * 42) + '%';
        });
      });

      steps.push(() => {
        title.textContent = '그리드 정렬 중…';
        bar.style.width = '100%';
        const world = new global.Game.World({
          track, renderer: this.renderer, hud: this.hud,
          onFinish: (res) => this.showResults(res)
        });
        // 스타팅 그리드: 무작위 배치
        const order = karts.slice(1).sort(() => Math.random() - 0.5);
        const grid = [karts[0]].concat(order).sort(() => Math.random() - 0.5);
        grid.forEach(k => world.addKart(k, k.isPlayer));
        world.karts.forEach(k => {
          if (!k.isPlayer) {
            const jitter = (Math.random() - 0.5) * 0.22;
            k.ai = new global.AI.Driver(k, Math.max(0.15, Math.min(1, cfg.skill + jitter)));
          }
        });
        world.start();
        this.renderer.setQualityMode(cfg.quality || 'auto');
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
          const auto = !cfg.quality || cfg.quality === 'auto';
          if (auto) this.renderer.setQuality(0);
          this.hud.showToast(auto ? '소프트웨어 렌더링 — 품질 최저로 전환'
                                  : '소프트웨어 렌더링 — 하드웨어 가속을 켜세요', '#ff9a8a');
        }
        this.renderer.particles.length = 0;
        this.renderer.camera.reset(world.player);
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
      if (this.paused) global.SFX.updateEngine(0, false);
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
      if (dt > 0.05) dt = 0.05;          // 프레임 드랍 보호
      const w = this.world;
      if (!w) return;

      if (!this.paused) {
        if (w.player && !w.player.finished) {
          this.input.apply(w.player);
          if (this.input.itemPressed()) w.useItem(w.player);
        }
        w.update(dt);
      }
      this.renderer.render(w, this.paused ? 0 : dt);
      this.hud.draw(w, this.paused ? 0 : dt);
    }
  };

  window.addEventListener('DOMContentLoaded', () => App.init());
  global.App = App;
})(window);
