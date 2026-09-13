# vendor/

## three.bundle.js

three.js r186 + 일부 postprocessing 애드온(EffectComposer / RenderPass /
UnrealBloomPass / OutputPass / ShaderPass / SMAAPass, BufferGeometryUtils)을 esbuild로 IIFE 번들한 파일.
전역 `THREE` 로 노출되며, 모듈 로더 없이 `file://` 에서도 바로 동작한다.

* 출처: npm `three@0.186.0`
* 라이선스: MIT (`three.LICENSE`)
* `--define:import.meta.url` 이 필요한 이유: DRACOLoader 가 최상위에서
  `new URL('...', import.meta.url)` 을 부르는데, IIFE 번들에는 `import.meta` 가
  없어서 이게 없으면 번들 전체가 로드 시점에 터진다
* 재생성 방법:

```
npm install three esbuild
cat > entry.js <<'JS'
export * from 'three';
export { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
export { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
export { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
export { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
export * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
export { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
export { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
JS
npx esbuild entry.js --bundle --minify --format=iife --global-name=THREE \
  --define:import.meta.url='"https://vendor.local/three.bundle.js"' \
  --outfile=three.bundle.js --legal-comments=none
```

## 에셋 정책

이 프로젝트는 **외부에서 가져온 게임 리소스를 일절 포함하지 않는다.**
캐릭터 · 카트 · 아이템 · 트랙 · 텍스처는 전부 코드에서 절차적으로 생성한다
(`js/models.js`, `js/textures.js`). 상용 게임의 스프라이트/모델을 립한 리소스는
저작권 문제로 사용하지 않는다.
