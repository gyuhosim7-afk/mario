/* =============================================================
 * surface.js - 절차적 표면 디테일 (셰이더 주입)
 *
 *  완벽하게 균일한 표면은 아무리 잘 비춰도 점토나 사출 플라스틱으로 읽힌다.
 *  실제 CG 애니메이션의 재질은 거칠기가 미세하게 불균일해서 하이라이트가
 *  고르게 번지지 않는다. 여기서는 오브젝트 공간 노이즈로 거칠기와 알베도를
 *  아주 조금 흔들어 그 불균일함을 만든다.
 *
 *  UV 에 의존하지 않으므로 지오메트리를 병합해도 (models.optimize) 그대로 살아남는다.
 * ============================================================= */
(function (global) {
  'use strict';

  const COMMON = `
varying vec3 vSdPos;
uniform float uSdScale;
uniform float uSdRough;
uniform float uSdTint;
float sdHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float sdNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sdHash(i),                 sdHash(i + vec3(1,0,0)), f.x),
        mix(sdHash(i + vec3(0,1,0)),   sdHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(sdHash(i + vec3(0,0,1)),   sdHash(i + vec3(1,0,1)), f.x),
        mix(sdHash(i + vec3(0,1,1)),   sdHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// 옥타브 2개면 충분하다. 3개째는 화면에서 거의 구분되지 않는데
// 픽셀당 해시 호출이 8번 더 늘어난다 (내장 그래픽에서 체감된다).
float sdFbm(vec3 p) {
  return sdNoise(p) * 0.66 + sdNoise(p * 3.1) * 0.34;
}`;

  const PATCH = `
{
  float sdN = sdFbm(vSdPos * uSdScale) - 0.5;
  roughnessFactor = clamp(roughnessFactor + sdN * uSdRough, 0.02, 1.0);
  diffuseColor.rgb *= 1.0 + sdN * uSdTint;
}`;

  /**
   * 머티리얼에 미세 표면 디테일을 입힌다.
   * @param scale  노이즈 주파수 (오브젝트 단위 기준. 값이 클수록 결이 곱다)
   * @param rough  거칠기 요동 폭
   * @param tint   알베도 요동 폭
   */
  // 품질 단계별로 켜고 끌 수 있도록 패치한 머티리얼을 기억해 둔다.
  // 0 = 최소(디테일·시언 없음) / 1 = 시언만 / 2 이상 = 전부
  const _patched = [];
  const _sheened = [];      // sheen 을 쓰는 머티리얼
  const _coated = [];       // clearcoat 을 쓰는 머티리얼
  let _level = 2;

  function _applyOne(e) {
    if (_level >= 2) { e.m.onBeforeCompile = e.fn; e.m.customProgramCacheKey = e.key; }
    else { e.m.onBeforeCompile = _noop; e.m.customProgramCacheKey = _offKey; }
    e.m.needsUpdate = true;
  }
  const _noop = function () {};
  const _offKey = function () { return 'sd-off'; };

  /**
   * 렌더러 품질 단계에 맞춰 무거운 재질 기능을 켜고 끈다 (셰이더를 다시 컴파일한다).
   *
   *   2 = 전부 (표면 결 + 시언 + 클리어코트)
   *   1 = 클리어코트만
   *   0 = 전부 끔
   *
   * sheen 과 clearcoat 은 각각 BRDF 로브를 하나씩 더 쓴다. 환경맵까지 걸리면
   * 픽셀당 큐브맵 샘플이 2~3배로 늘어나 내장 그래픽에서 바로 체감된다.
   */
  function quality(level) {
    level = Math.max(0, Math.min(2, level));
    if (level === _level) return;
    _level = level;
    for (const e of _patched) _applyOne(e);
    for (const e of _sheened) {
      const want = level >= 2 ? e.sheen : 0;
      if (e.m.sheen !== want) { e.m.sheen = want; e.m.needsUpdate = true; }
    }
    for (const e of _coated) {
      const want = level >= 1 ? e.coat : 0;
      if (e.m.clearcoat !== want) { e.m.clearcoat = want; e.m.needsUpdate = true; }
    }
  }

  /** sheen / clearcoat 을 쓰는 머티리얼을 품질 조절 대상으로 등록 */
  function register(m) {
    if (!m) return m;
    if (m.sheen > 0) _sheened.push({ m: m, sheen: m.sheen });
    if (m.clearcoat > 0) _coated.push({ m: m, coat: m.clearcoat });
    return m;
  }

  function detail(m, o) {
    if (!m || m.__sdPatched) return m;
    o = o || {};
    const scale = o.scale === undefined ? 0.8 : o.scale;
    const rough = o.rough === undefined ? 0.20 : o.rough;
    const tint = o.tint === undefined ? 0.05 : o.tint;
    const fn = (sh) => {
      sh.uniforms.uSdScale = { value: scale };
      sh.uniforms.uSdRough = { value: rough };
      sh.uniforms.uSdTint = { value: tint };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSdPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSdPos = transformed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + COMMON)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + PATCH);
    };
    // 패치한 셰이더가 패치 안 된 프로그램과 섞이지 않도록 캐시 키를 분리한다
    const key = () => 'sd|' + scale + '|' + rough + '|' + tint;
    m.__sdPatched = true;
    const entry = { m: m, fn: fn, key: key };
    _patched.push(entry);
    _applyOne(entry);
    return m;
  }

  /* -------------------------------------------------------------
   * 환경맵 (IBL)
   *
   * metalness / clearcoat / 눈동자의 광택은 '반사할 주변광' 이 있어야 나온다.
   * 환경맵이 없으면 아무리 반짝이게 설정해도 전부 무광 점토로 렌더된다.
   * 작은 씬을 큐브맵으로 구워서 쓴다. 게임 화면은 실제 하늘 텍스처를 넘겨
   * 배경과 반사가 어긋나지 않게 하고, 로비/아이콘은 스튜디오 조명을 쓴다.
   * ----------------------------------------------------------- */
  const ENV_PRESET = {
    circuit: { ground: '#6d7261', sun: '#fff4e0', band: '#e8f2ff', fill: '#9fc6ff' },
    bowser:  { ground: '#4c342c', sun: '#ffa860', band: '#ffa66a', fill: '#ff7a38' },
    rainbow: { ground: '#2b2937', sun: '#dfe8ff', band: '#cfd8ff', fill: '#9d8cff' },
    studio:  { ground: '#3a3d44', sun: '#ffffff', band: '#dfe6f2', fill: '#aac4ff' }
  };

  function envMap(gl, theme, skyTex) {
    const T = global.THREE;
    const P = ENV_PRESET[theme] || ENV_PRESET.studio;
    let pm = null;
    try {
      pm = new T.PMREMGenerator(gl);
      const es = new T.Scene();
      const basic = (o) => new T.MeshBasicMaterial(Object.assign({ toneMapped: false }, o));
      const trash = [];
      const add = (g, m, pos) => {
        const o = new T.Mesh(g, m);
        if (pos) o.position.copy(pos).setLength(84);
        es.add(o); trash.push(o); return o;
      };

      // 하늘: 게임에서는 실제 하늘 텍스처, 로비에서는 위아래 그라데이션
      if (skyTex) {
        add(new T.SphereGeometry(100, 32, 20), basic({ map: skyTex, side: T.BackSide }));
      } else {
        add(new T.SphereGeometry(100, 24, 16),
          basic({ color: new T.Color('#8fa8c8').multiplyScalar(0.9), side: T.BackSide }));
      }

      // 지면 반구: 아래쪽 반사가 새까매지지 않게. 채도가 높으면 크롬이 그 색으로 물든다
      add(new T.SphereGeometry(99, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
        basic({ color: new T.Color(P.ground), side: T.BackSide }));

      // 지평선 띠: 금속에 가로로 눕는 하이라이트 (스튜디오 조명의 그 선)
      add(new T.CylinderGeometry(97, 97, 13, 32, 1, true),
        basic({ color: new T.Color(P.band).multiplyScalar(1.9), side: T.BackSide }));

      // 태양(키). 1 을 넘는 밝기라야 또렷한 하이라이트가 박힌다
      add(new T.SphereGeometry(17, 16, 12), basic({ color: new T.Color(P.sun).multiplyScalar(7) }),
        new T.Vector3(-380, 620, 260));
      // 반대편 필: 림 라이트가 반사로도 보이게
      add(new T.SphereGeometry(34, 12, 10), basic({ color: new T.Color(P.fill).multiplyScalar(1.7) }),
        new T.Vector3(420, 300, -520));

      const rt = pm.fromScene(es, 0.035, 1, 400);
      for (const o of trash) { o.geometry.dispose(); o.material.dispose(); }
      pm.dispose();
      return rt;
    } catch (e) {
      // 환경맵을 못 구우면 조명만으로 렌더한다 (약한 GPU / 컨텍스트 손실 보호)
      if (pm) pm.dispose();
      return null;
    }
  }

  /* -------------------------------------------------------------
   * 실제 HDRI 환경맵 (선택)
   *
   * assets/manifest.json 의 "env" 에 .hdr 파일을 적어두면 절차적 환경맵 대신
   * 그걸 굽는다. 실제 촬영된 HDRI 는 반사에 들어가는 정보량이 비교가 안 되게
   * 많아서, 같은 모델도 훨씬 입체적으로 보인다. 없으면 조용히 무시한다.
   * ----------------------------------------------------------- */
  const _hdri = {};

  function hdriMap(gl, url) {
    const T = global.THREE;
    if (_hdri[url] !== undefined) return Promise.resolve(_hdri[url]);
    if (!T.RGBELoader) { _hdri[url] = null; return Promise.resolve(null); }
    return new Promise((res) => {
      new T.RGBELoader().load(url, (tex) => {
        let rt = null;
        try {
          const pm = new T.PMREMGenerator(gl);
          rt = pm.fromEquirectangular(tex);
          pm.dispose();
        } catch (e) { rt = null; }
        tex.dispose();
        _hdri[url] = rt;
        res(rt);
      }, undefined, () => { _hdri[url] = null; res(null); });
    });
  }

  global.Surface = { detail, envMap, quality, register, hdriMap };
})(window);
