# assets/ — 외부 3D 모델 넣는 곳

여기에 `manifest.json` 을 만들고 GLB / glTF / FBX 파일을 넣으면
**해당 캐릭터·프롭의 절차적 모델을 자동으로 대체**합니다.
매니페스트가 없으면 아무 일도 일어나지 않고 기존 절차적 모델을 그대로 씁니다.

> ⚠️ 브라우저 보안 정책상 `file://` 로 열면 외부 파일을 읽지 못합니다.
> 에셋을 쓰려면 로컬 서버로 띄우세요: `npx http-server -p 8080`

## manifest.json

```jsonc
{
  "characters": {
    // 캐릭터 id : GameData.CHARACTERS 의 id
    //   bbiyak · momo · volt · koko · tango · luna · bumper · magma
    "koko": { "file": "characters/koko.glb", "height": 34, "yaw": 90 },
    "magma": "characters/magma.glb"          // 문자열만 쓰면 기본값 적용
  },
  "props": {
    // 프롭 종류 : tree · piranha · crowd · sign · pillar · lavafall · statue · staroid · thwomp
    "tree": { "file": "props/tree.glb", "height": 90 }
  },
  "dracoPath": "vendor/draco/"               // 생략 가능
}
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `file` | (필수) | `assets/` 기준 상대 경로. `.glb` `.gltf` `.fbx` |
| `height` | 없음 | 모델 높이를 이 값(world unit)에 맞춰 자동 스케일. 캐릭터는 **34** 정도가 기존 중형급과 비슷 |
| `scale` | 1 | `height` 를 안 쓸 때의 배율 |
| `yaw` | 90 | 정면 보정(도). glTF 관례상 모델이 +Z 를 보므로 기본 90° 회전해 +X 로 맞춘다 |
| `y` | 0 | 추가 높이 오프셋 |
| `clip` | 첫 번째 | 재생할 애니메이션 클립 이름 |

불러온 모델은 **바닥 접지 + 중심 정렬 + 목표 높이**로 자동 정규화되고,
애니메이션이 들어 있으면 `AnimationMixer` 로 자동 재생됩니다.
Draco 압축 GLB 도 `vendor/draco/` 의 디코더로 바로 읽힙니다.

## 어디서 받나 (라이선스 주의)

| 출처 | 포맷 | 라이선스 | 이 게임에 맞나 |
|---|---|---|---|
| **Kenney.nl** | GLB / OBJ / FBX | **CC0** (표기 불필요) | ⭐ 배경 소품에 최적. 로우폴리 · 스타일 일관 |
| **Poly Pizza** | GLB | CC0 또는 **CC-BY**(모델별 상이) | 소품용. CC-BY 는 크레딧 표기 필요 |
| **Mixamo** | FBX / DAE | Adobe 계정 필요, 프로젝트 사용 허용 | 걷기·뛰기 애니메이션이 주 가치인데 **드라이버는 앉아 있어서 쓸 데가 적다** |
| **VRoid Studio** | VRM(glTF 확장) | 본인 제작물은 본인 소유 | 애니풍 등신대 인간이라 **현재 데포르메 스타일과 충돌**, 폴리곤도 무겁다 |

⚠️ 상용 게임에서 립한 모델(마리오 카트 등)은 넣지 마세요. 이 프로젝트가
전부 절차적 생성으로 되어 있는 이유입니다.

## 반대 방향: 현재 모델을 GLB 로 빼내기

로비 3D 프리뷰 우하단의 **⬇ GLB** 버튼을 누르면 현재 캐릭터+카트 조합이
GLB 로 저장됩니다. 블렌더 등에서 다듬은 뒤 여기에 도로 넣으면 됩니다.
