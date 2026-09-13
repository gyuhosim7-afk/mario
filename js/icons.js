/* =============================================================
 * icons.js - 오프스크린 3D 렌더러로 아이템 아이콘 / 카트 썸네일을 굽는다.
 *   HUD와 로비 DOM은 여기서 만든 캔버스(또는 dataURL)를 사용한다.
 * ============================================================= */
(function (global) {
  'use strict';

  const T = global.THREE;
  const cache = {};
  const urlCache = {};

  const Icons = {
    _gl: null,
    _scene: null,
    _cam: null,

    _init() {
      if (this._gl) return;
      const gl = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      gl.setPixelRatio(1);
      gl.setSize(256, 256, false);
      gl.toneMapping = T.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.15;
      gl.outputColorSpace = T.SRGBColorSpace;
      gl.shadowMap.enabled = false;
      this._gl = gl;

      const sc = new T.Scene();
      if (global.Surface) {
        const rt = global.Surface.envMap(gl, 'studio');
        if (rt) { sc.environment = rt.texture; this._envRT = rt; }
      }
      sc.add(new T.HemisphereLight(0xdfe9ff, 0x2a2f45, 1.0));
      const key = new T.DirectionalLight(0xffffff, 3.0);
      key.position.set(60, 90, 70);
      sc.add(key);
      const rim = new T.DirectionalLight(0x9fd0ff, 1.6);
      rim.position.set(-70, 40, -60);
      sc.add(rim);
      const fill = new T.DirectionalLight(0xffd9a0, 1.0);
      fill.position.set(20, -40, 60);
      sc.add(fill);
      this._scene = sc;
      this._cam = new T.PerspectiveCamera(32, 1, 0.1, 4000);
    },

    /** 오브젝트를 프레이밍해서 지정 크기 캔버스에 렌더 */
    _shoot(obj, size, yaw, pitch, pad) {
      this._init();
      const sc = this._scene, cam = this._cam, gl = this._gl;
      sc.add(obj);
      obj.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(obj);
      const sph = bb.getBoundingSphere(new T.Sphere());
      const r = sph.radius * (pad || 1.16);
      const dist = r / Math.sin((cam.fov * Math.PI / 180) / 2);
      const y = yaw === undefined ? -0.7 : yaw;
      const p = pitch === undefined ? 0.42 : pitch;
      cam.aspect = 1;
      cam.position.set(
        sph.center.x + Math.cos(y) * Math.cos(p) * dist,
        sph.center.y + Math.sin(p) * dist,
        sph.center.z + Math.sin(y) * Math.cos(p) * dist
      );
      cam.lookAt(sph.center);
      cam.updateProjectionMatrix();

      const px = size || 256;
      gl.setSize(px, px, false);
      gl.render(sc, cam);

      const out = document.createElement('canvas');
      out.width = out.height = px;
      out.getContext('2d').drawImage(gl.domElement, 0, 0);
      sc.remove(obj);
      return out;
    },

    /** 아이템 아이콘 캔버스 */
    get(id) {
      if (cache[id]) return cache[id];
      if (!global.THREE || !global.Models) return null;
      const key = id === 'triplemush' ? 'mushroom' : id;
      let obj;
      try { obj = global.Models.buildItem(key); } catch (e) { return null; }
      if (!obj || !obj.children.length) return null;
      const yaw = { banana: -0.9, coin: -1.4, lightning: -1.5, star: -1.5 }[key];
      const pitch = { coin: 0.12, lightning: 0.08, star: 0.1, banana: 0.75 }[key];
      const c = this._shoot(obj, 192, yaw !== undefined ? yaw : -0.75, pitch !== undefined ? pitch : 0.34, 1.2);
      cache[id] = c;
      return c;
    },

    url(id) {
      if (!urlCache[id]) {
        const c = this.get(id);
        urlCache[id] = c ? c.toDataURL() : '';
      }
      return urlCache[id];
    },

    /** 카트 조합 썸네일 (로비 파츠 카드) */
    kartThumb(combo, size) {
      const key = 'k:' + combo.character.id + combo.frame.id + combo.wheel.id + combo.glider.id + (size || 128);
      if (cache[key]) return cache[key];
      const obj = global.Models.buildKart(combo);
      obj.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      const c = this._shoot(obj, size || 128, -0.62, 0.30, 1.12);
      cache[key] = c;
      return c;
    },
    kartThumbURL(combo, size) {
      const key = 'ku:' + combo.character.id + combo.frame.id + combo.wheel.id + combo.glider.id + (size || 128);
      if (!urlCache[key]) urlCache[key] = this.kartThumb(combo, size).toDataURL();
      return urlCache[key];
    },

    /** 컨텍스트 반납 (레이스 시작 시 호출) */
    release() {
      if (this._gl) { this._gl.dispose(); this._gl.forceContextLoss && this._gl.forceContextLoss(); this._gl = null; }
    }
  };

  global.Icons = Icons;
})(window);
