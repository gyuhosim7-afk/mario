# assets/env/

여기에 **`env.hdr`** 이라는 이름으로 HDRI 파일을 하나 넣으면, 게임이 절차적으로
굽는 환경맵 대신 그 HDRI 를 씁니다. 차체 도색 · 크롬 휠 · 눈동자에 비치는 반사가
실제 촬영된 하늘/실내의 정보를 그대로 받아서 훨씬 입체적으로 보입니다.

```
assets/env/env.hdr
```

이게 전부입니다. 설정 파일을 따로 만들 필요 없습니다.

## 파일 구하기

[Poly Haven](https://polyhaven.com/hdris) 의 HDRI 는 전부 **CC0** 라 출처 표기 없이
써도 됩니다. **1k 또는 2k 해상도**를 받으세요. 4k 이상은 굽는 데만 오래 걸리고
화면에서 차이가 거의 없습니다.

## 트랙마다 다르게 쓰고 싶다면

`assets/manifest.json` 을 만들어 트랙별로 지정할 수 있습니다.

```json
{
  "env": {
    "default": "env/studio.hdr",
    "circuit": "env/sunny.hdr",
    "bowser":  "env/volcano.hdr",
    "rainbow": "env/night.hdr"
  }
}
```

`default` 만 적으면 모든 트랙이 그걸 씁니다.

## 주의

* 브라우저 보안 정책상 **`file://` 로 열면 외부 파일을 못 읽습니다.**
  `npx http-server` 같은 로컬 서버로 띄워야 적용됩니다
* 파일이 없거나 로딩에 실패하면 **조용히 절차적 환경맵으로 돌아갑니다.**
  게임이 깨지지 않으니 안심하고 넣었다 뺐다 해도 됩니다
* `.hdr` (Radiance RGBE) 형식을 씁니다. `.exr` 은 지원하지 않습니다
