/* =============================================================
 * assets.js - 외부 3D 에셋(GLB / glTF / FBX) 오버라이드 레이어
 *
 *   assets/manifest.json 이 있으면 거기 적힌 모델을 불러와
 *   해당 캐릭터 / 프롭의 절차적 모델을 대체한다.
 *   파일이 없으면 조용히 무시하고 기존 절차적 모델을 그대로 쓴다.
 *
 *   ※ 브라우저 보안 정책상 file:// 로 열면 외부 파일을 읽을 수 없다.
 *     에셋을 쓰려면 로컬 서버로 띄울 것 (npx http-server)
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;

  /** 모델을 게임 좌표계에 맞춰 정규화: 바닥 접지 + 목표 높이 + 정면 +X */
  function normalize(root, opt) {
    const g = new T.Group();
    g.add(root);
    root.updateMatrixWorld(true);

    // 회전 먼저 (glTF 관례상 +Z 정면 -> 이 게임은 +X 정면)
    root.rotation.y = ((opt.yaw === undefined ? 90 : opt.yaw) * Math.PI) / 180;
    root.updateMatrixWorld(true);

    const bb = new T.Box3().setFromObject(root);
    const size = bb.getSize(new T.Vector3());
    const center = bb.getCenter(new T.Vector3());

    let s = opt.scale || 1;
    if (opt.height && size.y > 1e-4) s = opt.height / size.y;
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);

    // 바닥이 y=0 에 오도록, x/z 는 중심 정렬
    root.position.set(-center.x * s, -bb.min.y * s + (opt.y || 0), -center.z * s);

    g.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material && o.material.map) o.material.map.colorSpace = T.SRGBColorSpace;
      }
    });
    return g;
  }

  const Assets = {
    manifest: null,
    chars: {},          // id -> { template, animations, opt }
    props: {},
    mixers: [],
    loaded: 0,
    failed: [],

    /** manifest 를 읽어 등록된 모델을 모두 불러온다 (없으면 즉시 반환) */
    async init(base) {
      if (this._attempted) return this.loaded > 0;   // 세션당 한 번만 조회
      this._attempted = true;
      this.base = base || 'assets/';
      let man;
      try {
        const res = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        man = await res.json();
      } catch (e) {
        // 매니페스트가 없는 것이 기본 상태다 (콘솔의 404 는 정상)
        console.info('[assets] assets/manifest.json 없음 — 절차적 모델로 진행합니다');
        return false;
      }
      this.manifest = man;

      const gltf = new T.GLTFLoader();
      if (T.DRACOLoader) {
        const draco = new T.DRACOLoader();
        draco.setDecoderPath((man.dracoPath || 'vendor/draco/'));
        gltf.setDRACOLoader(draco);
      }
      const fbx = T.FBXLoader ? new T.FBXLoader() : null;

      const loadOne = (entry) => new Promise(resolve => {
        const opt = typeof entry === 'string' ? { file: entry } : entry;
        const url = this.base + opt.file;
        const isFbx = /\.fbx$/i.test(opt.file);
        const onOk = (obj, anims) => resolve({ template: normalize(obj, opt), animations: anims || [], opt });
        const onErr = (err) => { this.failed.push(opt.file + ' — ' + (err && err.message || err)); resolve(null); };
        try {
          if (isFbx) {
            if (!fbx) return onErr(new Error('FBXLoader 없음'));
            fbx.load(url, o => onOk(o, o.animations), undefined, onErr);
          } else {
            gltf.load(url, r => onOk(r.scene, r.animations), undefined, onErr);
          }
        } catch (e) { onErr(e); }
      });

      const jobs = [];
      for (const [id, entry] of Object.entries(man.characters || {})) {
        jobs.push(loadOne(entry).then(r => { if (r) { this.chars[id] = r; this.loaded++; } }));
      }
      for (const [type, entry] of Object.entries(man.props || {})) {
        jobs.push(loadOne(entry).then(r => { if (r) { this.props[type] = r; this.loaded++; } }));
      }
      await Promise.all(jobs);
      if (this.failed.length) console.warn('[assets] 불러오지 못한 파일:', this.failed);
      if (this.loaded) console.info('[assets] 외부 모델 ' + this.loaded + '개 적용');
      return this.loaded > 0;
    },

    _instance(rec) {
      if (!rec) return null;
      const clone = T.SkeletonUtils ? T.SkeletonUtils.clone(rec.template) : rec.template.clone(true);
      clone.userData.dynamic = true;          // 지오메트리 병합 대상에서 제외
      if (rec.animations && rec.animations.length) {
        const mixer = new T.AnimationMixer(clone);
        const wanted = rec.opt.clip
          ? rec.animations.find(a => a.name === rec.opt.clip) || rec.animations[0]
          : rec.animations[0];
        mixer.clipAction(wanted).play();
        this.mixers.push(mixer);
        clone.userData.mixer = mixer;
      }
      return clone;
    },

    character(id) { return this.chars[id] ? this._instance(this.chars[id]) : null; },
    prop(type) { return this.props[type] ? this._instance(this.props[type]) : null; },
    has(id) { return !!(this.chars[id] || this.props[id]); },

    update(dt) {
      for (let i = 0; i < this.mixers.length; i++) this.mixers[i].update(dt);
    },
    clearMixers() { this.mixers.length = 0; },

    /** 현재 조합을 GLB 로 내보낸다 (블렌더 등에서 다듬어 되돌리기 위한 용도) */
    exportGLB(object3d, filename) {
      return new Promise((resolve, reject) => {
        if (!T.GLTFExporter) return reject(new Error('GLTFExporter 없음'));
        new T.GLTFExporter().parse(object3d, (buf) => {
          const blob = new Blob([buf], { type: 'model/gltf-binary' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename || 'model.glb';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          resolve(blob.size);
        }, reject, { binary: true });
      });
    }
  };

  global.Assets = Assets;
})(window);
