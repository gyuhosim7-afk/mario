# assets/characters/

여기에 GLB / glTF / FBX 를 넣고 `assets/manifest.json` 에 등록하면 해당 캐릭터를
통째로 대체합니다.

```json
{
  "characters": {
    "koko":  { "file": "characters/koko.glb", "height": 34, "yaw": 90 },
    "momo":  { "file": "characters/momo.glb", "height": 32, "yaw": 90 }
  }
}
```

| 키 | 뜻 |
|---|---|
| `file` | `assets/` 기준 상대 경로 |
| `height` | 목표 키 (world unit). 카트 전장이 46 이므로 30~36 정도가 알맞다 |
| `yaw` | 모델 정면을 +X 로 돌리기 위한 Y축 회전(도). glTF 관례상 보통 90 |

캐릭터 id 는 `js/data.js` 의 `CHARACTERS` 에 있는 8개입니다:
`bbiyak` `momo` `volt` `koko` `tango` `luna` `bumper` `magma`
일부만 등록해도 됩니다. 나머지는 절차적 모델을 그대로 씁니다.

## 무료로 받을 수 있는 곳 (전부 상업적 사용 가능)

| 사이트 | 라이선스 | 특징 |
|---|---|---|
| [Kenney](https://kenney.nl/assets?q=3d) | CC0 | 로우폴리 캐릭터 팩. 이 게임 톤에 가장 잘 맞음 |
| [Poly Pizza](https://poly.pizza) | CC0 / CC-BY | 구 Google Poly 아카이브. 검색으로 골라 받기 |
| [Quaternius](https://quaternius.com) | CC0 | 애니메이션까지 들어간 로우폴리 캐릭터 팩 |
| [Mixamo](https://mixamo.com) | Adobe 계정 무료 | 캐릭터 + 스켈레탈 애니메이션 (FBX/GLB) |
| [VRoid Studio](https://vroid.com/studio) | 무료 툴 | 애니풍 캐릭터를 직접 만들어 VRM/GLB 내보내기 |
| [Sketchfab](https://sketchfab.com/features/free-3d-models) | 모델마다 다름 | **CC0 / CC-BY 필터를 꼭 걸 것** |

> 상용 게임에서 립한 모델(마리오 등)은 저작권 문제로 넣지 마세요.
> 이 프로젝트는 그래서 전부 절차적으로 만들었습니다.

## 주의

**외부 모델은 절차적 리그를 대체합니다.** 팔 IK(핸들 잡기), 표정(눈꺼풀·눈썹),
귀·꼬리 관성 흔들림이 같이 사라집니다. 모델에 스켈레탈 애니메이션이 있으면
`AnimationMixer` 로 재생되지만, 없으면 가만히 앉아만 있습니다.
**앉은 자세(sitting/driving) 애니메이션이 포함된 모델**을 고르는 게 좋습니다.

`file://` 로 열면 브라우저가 외부 파일을 못 읽습니다. `npx http-server` 로 띄우세요.
