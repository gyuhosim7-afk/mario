/* =============================================================
 * data.js - 캐릭터 / 파츠 / 아이템 / 트랙 원본 데이터
 * 모든 스탯은 0 ~ 10 스케일. 최종 스탯 = 캐릭터 + 프레임 + 바퀴 + 글라이더
 * 스탯 키:
 *   speed    : 최고 속도   (Top Speed)
 *   accel    : 가속도       (Acceleration)
 *   weight   : 무게         (Weight)
 *   handling : 핸들링       (Handling)
 *   offroad  : 오프로드 마찰(Off-road Traction)
 * ============================================================= */
(function (global) {
  'use strict';

  const STAT_KEYS = ['speed', 'accel', 'weight', 'handling', 'offroad'];
  const STAT_LABEL = {
    speed: '속도',
    accel: '가속',
    weight: '무게',
    handling: '핸들링',
    offroad: '오프로드'
  };

  /* ---------------------------------------------------------
   * 1. 캐릭터 (체급별 데이터 구조)
   *    light  : 가속 / 핸들링 / 오프로드 특화, 최고속 낮음
   *    medium : 전 스탯 균형
   *    heavy  : 최고속 / 무게 특화, 가속 / 핸들링 낮음
   * --------------------------------------------------------- */
  const CHARACTERS = [
    {
      id: 'toad', name: '키노피오', cls: 'light', clsName: '경량급',
      stats: { speed: 2.0, accel: 5.0, weight: 1.5, handling: 4.75, offroad: 4.0 },
      colors: { skin: '#f7e3c8', cap: '#f4f4f4', spot: '#e8404a', vest: '#2f6fd0', trim: '#f5c542', accent: '#e8404a' },
      desc: '경량 가속형. 피격 회복과 초반 가속이 가장 빠르다.',
      flavor: '붉은 점무늬 양송이 캡은 젤리 같은 광택을 띤다. 작은 스티어링 휠을 두 손으로 바쁘게 움직이며, 가속할 때 몸을 앞으로 바짝 밀착시킨다.'
    },
    {
      id: 'babymario', name: '베이비 마리오', cls: 'light', clsName: '경량급',
      stats: { speed: 1.75, accel: 5.25, weight: 1.25, handling: 5.0, offroad: 4.25 },
      colors: { skin: '#f7d0a8', cap: '#e5322f', spot: '#ffffff', vest: '#e5322f', trim: '#3b6fd0', accent: '#e5322f' },
      desc: '최경량. 코너 탈출 속도와 오프로드 복귀력이 뛰어나다.',
      flavor: '작은 몸집이 시트에 파묻히지만 커브에서는 누구보다 날카롭게 파고든다.'
    },
    {
      id: 'peach', name: '피치', cls: 'light', clsName: '경량급',
      stats: { speed: 2.75, accel: 4.5, weight: 2.5, handling: 4.25, offroad: 3.5 },
      colors: { skin: '#f9dcc0', cap: '#f4d03f', spot: '#ffffff', vest: '#ef8fc4', trim: '#f4d03f', accent: '#ef8fc4' },
      desc: '경량급 중 최고속 지향. 안정적인 라인 유지가 강점.',
      flavor: '드레스 자락이 주행풍에 나부끼며, 왕관의 보석이 조명을 반사한다.'
    },
    {
      id: 'mario', name: '마리오', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.5, accel: 3.5, weight: 3.5, handling: 3.5, offroad: 3.0 },
      colors: { skin: '#f7d0a8', cap: '#e5322f', spot: '#ffffff', vest: '#e5322f', trim: '#2f5fbf', accent: '#e5322f' },
      desc: '올라운더 중형급. 속도·가속·핸들링·무게가 모두 균형.',
      flavor: '붉은 멜빵 상의와 데님 오버롤. 장갑의 흰 가죽에 손가락 마디 주름이 잡히고, 콧수염이 바람에 흔들린다. 점프 시 오른손을 들어 올리는 시그니처 포즈.'
    },
    {
      id: 'luigi', name: '루이지', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.75, accel: 3.25, weight: 3.5, handling: 3.25, offroad: 3.25 },
      colors: { skin: '#f7d0a8', cap: '#37a34a', spot: '#ffffff', vest: '#37a34a', trim: '#2f5fbf', accent: '#37a34a' },
      desc: '중형급 속도형. 직선 구간에서 마리오보다 조금 더 뻗는다.',
      flavor: '길쭉한 실루엣이 시트 위로 솟아 있고, 코너에서는 상체를 크게 기울인다.'
    },
    {
      id: 'yoshi', name: '요시', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.25, accel: 3.75, weight: 3.25, handling: 3.75, offroad: 3.25 },
      colors: { skin: '#4fbf4f', cap: '#4fbf4f', spot: '#ffffff', vest: '#e56f2f', trim: '#ffffff', accent: '#4fbf4f' },
      desc: '중형급 핸들링형. 연속 코너 구간에서 라인이 깔끔하다.',
      flavor: '넓적한 주둥이를 앞으로 내밀고 달리며, 안장 같은 붉은 등딱지가 흔들린다.'
    },
    {
      id: 'dk', name: '동키콩', cls: 'heavy', clsName: '중량급',
      stats: { speed: 4.5, accel: 2.5, weight: 4.75, handling: 2.5, offroad: 2.75 },
      colors: { skin: '#8a5a2b', cap: '#5a3a1b', spot: '#d9b48a', vest: '#c0392b', trim: '#f4d03f', accent: '#c0392b' },
      desc: '중량급. 충돌 시 밀어내는 힘이 강하고 최고속이 높다.',
      flavor: '두툼한 팔뚝이 핸들을 감싸고, 붉은 넥타이가 등 뒤로 펄럭인다.'
    },
    {
      id: 'bowser', name: '쿠파', cls: 'heavy', clsName: '중량급',
      stats: { speed: 5.0, accel: 2.0, weight: 5.0, handling: 2.0, offroad: 2.5 },
      colors: { skin: '#e6b23c', cap: '#3f8f3f', spot: '#f2e2c0', vest: '#3f8f3f', trim: '#e05a1e', accent: '#e05a1e' },
      desc: '파워형 중량급. 최고 속도와 무게 최상, 가속·핸들링 최하.',
      flavor: '운전석을 가득 채우는 거구. 황갈색 파충류 가죽의 거친 요철, 그을린 흰 뿔, 징 박힌 가죽 팔찌가 엔진 진동에 맞춰 울린다. 관상아 사이로 화염 입자가 피어오르고, 코너에서는 육중한 몸을 안쪽으로 기울여 타이어를 지면에 눌러 붙인다.'
    }
  ];

  /* ---------------------------------------------------------
   * 2. 카트 파츠 (프레임 / 바퀴 / 글라이더)
   * --------------------------------------------------------- */
  const FRAMES = [
    { id: 'standard', name: '스탠다드 카트', stats: { speed: 0, accel: 0, weight: 0, handling: 0, offroad: 0 }, body: '#e03a3a', desc: '모든 스탯 보정 없음. 캐릭터 성향을 그대로 살린다.' },
    { id: 'pipeframe', name: '파이프 프레임', stats: { speed: -0.5, accel: 1.0, weight: -0.5, handling: 0.75, offroad: 0.5 }, body: '#38b06a', desc: '초경량 파이프 골조. 가속과 핸들링에 몰빵.' },
    { id: 'bdasher', name: '비 대셔', stats: { speed: 0.75, accel: -0.25, weight: -0.25, handling: 0.5, offroad: -0.75 }, body: '#2f6fd0', desc: '저중심 스포츠 섀시. 속도와 핸들링 양립.' },
    { id: 'circuit', name: '서킷 스페셜', stats: { speed: 1.25, accel: -0.75, weight: 0.25, handling: -0.25, offroad: -1.0 }, body: '#f0f0f0', desc: '순수 최고속 특화 포뮬러 섀시.' },
    { id: 'badwagon', name: '배드 왜건', stats: { speed: 1.0, accel: -1.0, weight: 1.5, handling: -1.0, offroad: -0.5 }, body: '#3a3a3a', desc: '강철 머슬 바디. 무게로 상대를 밀어낸다.' },
    { id: 'offroader', name: '오프로더', stats: { speed: 0.25, accel: -0.25, weight: 0.75, handling: -0.25, offroad: 1.5 }, body: '#c06a2a', desc: '험지 주파용. 잔디·모래에서 속도 손실이 적다.' }
  ];

  const WHEELS = [
    { id: 'std', name: '표준 타이어', stats: { speed: 0, accel: 0, weight: 0, handling: 0, offroad: 0 }, tire: '#242424', rim: '#d8d8d8', desc: '균형 잡힌 기본 컴파운드.' },
    { id: 'roller', name: '롤러', stats: { speed: -0.75, accel: 1.25, weight: -0.5, handling: 0.75, offroad: -0.25 }, tire: '#2a2a2a', rim: '#f2c14e', desc: '초소형 휠. 정지 후 재가속이 매우 빠르다.' },
    { id: 'slick', name: '슬릭', stats: { speed: 1.0, accel: -0.75, weight: 0.25, handling: -0.25, offroad: -1.25 }, tire: '#1b1b1b', rim: '#c0392b', desc: '민무늬 컴파운드. 포장로 그립 최고, 오프로드 최악.' },
    { id: 'monster', name: '몬스터', stats: { speed: 0.25, accel: -0.5, weight: 1.0, handling: -0.5, offroad: 1.5 }, tire: '#2f2f2f', rim: '#8e44ad', desc: '대구경 블록 타이어. 오프로드 마찰력 최상.' },
    { id: 'sponge', name: '스펀지', stats: { speed: -0.25, accel: 0.75, weight: -0.25, handling: 1.0, offroad: 0.25 }, tire: '#4a4a4a', rim: '#f4f4f4', desc: '탄성 컴파운드. 코너 진입 안정성이 높다.' }
  ];

  const GLIDERS = [
    { id: 'super', name: '슈퍼 글라이더', stats: { speed: 0, accel: 0, weight: 0, handling: 0, offroad: 0 }, wing: '#f4f4f4', desc: '표준 캔버스 윙.' },
    { id: 'cloud', name: '구름 글라이더', stats: { speed: -0.25, accel: 0.5, weight: -0.25, handling: 0.25, offroad: 0 }, wing: '#dff1ff', desc: '가벼운 구름 소재. 활공 후 착지 회복이 빠르다.' },
    { id: 'wario', name: '와리오 윙', stats: { speed: 0.5, accel: -0.25, weight: 0.5, handling: -0.25, offroad: 0 }, wing: '#f2c14e', desc: '중량 금속 윙. 활공 속도를 유지한다.' },
    { id: 'paper', name: '페이퍼 글라이더', stats: { speed: 0.25, accel: 0.25, weight: -0.5, handling: 0.25, offroad: -0.25 }, wing: '#ffe9a8', desc: '초경량 접이식. 공중 조작성이 좋다.' }
  ];

  /* ---------------------------------------------------------
   * 3. 아이템 정의
   * --------------------------------------------------------- */
  const ITEMS = {
    banana:    { id: 'banana',    name: '바나나',      icon: '🍌', color: '#f2d13c', kind: 'trap',   desc: '뒤에 흘려 스핀아웃 트랩 설치' },
    greenshell:{ id: 'greenshell',name: '초록 껍질',   icon: '🐢', color: '#3fbf5f', kind: 'shot',   desc: '직진 발사. 벽에 3회 반사' },
    redshell:  { id: 'redshell',  name: '빨간 껍질',   icon: '🔴', color: '#e03a3a', kind: 'shot',   desc: '바로 앞 순위 추적 유도탄' },
    coin:      { id: 'coin',      name: '동전',        icon: '🪙', color: '#f4c542', kind: 'buff',   desc: '동전 2개 획득 + 순간 가속' },
    mushroom:  { id: 'mushroom',  name: '버섯',        icon: '🍄', color: '#e5484d', kind: 'boost',  desc: '단발 대시 부스터' },
    triplemush:{ id: 'triplemush',name: '트리플 버섯', icon: '🍄', color: '#e5484d', kind: 'boost',  count: 3, desc: '부스터 3회분' },
    bobomb:    { id: 'bobomb',    name: '폭탄병',      icon: '💣', color: '#3a3a48', kind: 'shot',   desc: '착탄 시 광역 폭발 넉백' },
    bulletbill:{ id: 'bulletbill',name: '킬러',        icon: '🚀', color: '#2f2f38', kind: 'special',desc: '자동 주행 무적 돌진' },
    star:      { id: 'star',      name: '스타',        icon: '⭐', color: '#f7d13c', kind: 'special',desc: '7초간 무적 + 속도 상승' },
    spiny:     { id: 'spiny',     name: '가시 껍질',   icon: '🌀', color: '#3f6fd0', kind: 'special',desc: '1위를 직격하는 유도 폭발' },
    lightning: { id: 'lightning', name: '번개',        icon: '⚡', color: '#f2e14c', kind: 'special',desc: '자신 외 전원 축소 + 아이템 파괴' }
  };

  /* ---------------------------------------------------------
   * 4. 순위 기반 아이템 드롭 가중치 테이블
   *    index 0 = 1위 ... index 7 = 8위
   * --------------------------------------------------------- */
  const ITEM_WEIGHTS = [
    /* 1위  - 방어/트랩 위주 */
    { banana: 42, greenshell: 33, coin: 25 },
    /* 2위  - 견제/단거리 추격 */
    { banana: 18, greenshell: 22, redshell: 32, mushroom: 20, coin: 8 },
    /* 3위  - 견제/단거리 추격 */
    { banana: 12, greenshell: 18, redshell: 34, mushroom: 28, coin: 8 },
    /* 4위  - 역전용 이동기/범위기 */
    { redshell: 20, mushroom: 22, triplemush: 24, bobomb: 18, star: 10, bulletbill: 6 },
    /* 5위 */
    { redshell: 14, mushroom: 16, triplemush: 26, bobomb: 20, star: 16, bulletbill: 8 },
    /* 6위 */
    { mushroom: 10, triplemush: 24, bobomb: 18, star: 22, bulletbill: 16, spiny: 10 },
    /* 7위  - 광역/특수 고확률 */
    { triplemush: 14, bobomb: 10, star: 22, bulletbill: 24, spiny: 16, lightning: 14 },
    /* 8위 */
    { triplemush: 10, star: 20, bulletbill: 26, spiny: 20, lightning: 24 }
  ];

  /* ---------------------------------------------------------
   * 5. 트랙 정의
   *    ctrl : 2048 x 2048 월드 좌표계 위의 중심선 제어점 (Catmull-Rom)
   * --------------------------------------------------------- */
  /* 레이아웃 DSL:  ['s', 길이] 직선 / ['r'|'l', 반경, 각도] 코너
   * 순회전이 360°가 되도록 자동 정규화되고, 직선 길이는 폐합 해석으로 보정된다.
   * 반경이 작을수록 감속이 필요하다 (v ≈ 반경 × 조향각속도).             */
  const TRACKS = [
    {
      id: 'circuit',
      name: '마리오 서킷',
      subtitle: 'Mario Circuit',
      difficulty: 1,
      laps: 3,
      width: 168,
      theme: 'circuit',
      heading: 0,
      desc: '메인 스트레이트 끝의 고속 1코너, 최저속 헤어핀, 에스자와 시케인이 이어지는 정통 그랑프리 서킷. 잔디 오프로드라 실수해도 복귀할 수 있다.',
      sky: ['#63b7f0', '#bfe6ff'],
      fog: '#cfe9ff',
      offroadName: '잔디',
      layout: [
        ['s', 3500], ['r', 480, 70],            // 메인 스트레이트 → 고속 1코너
        ['s', 1150], ['r', 230, 80],            // 2코너 중속
        ['s', 620],  ['r', 140, 170],           // 3코너 헤어핀 (최저속)
        ['s', 1900], ['l', 340, 60],            // 4코너 고속 좌
        ['s', 1400], ['r', 250, 85],
        ['s', 2400],                            // 백스트레이트
        ['l', 170, 55], ['r', 170, 55],         // 시케인
        ['s', 1150], ['l', 280, 55],
        ['s', 900],  ['r', 260, 60],            // 더블 에이펙스
        ['s', 750],  ['l', 260, 60],
        ['s', 820],  ['r', 340, 95],
        ['s', 700],  ['l', 260, 25]
      ],
      boostCount: 3,
      boxRows: 4,
      shoulder: 0,
      hazard: null
    },
    {
      id: 'rainbow',
      name: '무지개 로드',
      subtitle: 'Rainbow Road',
      difficulty: 3,
      laps: 3,
      width: 150,
      theme: 'rainbow',
      heading: 0,
      desc: '두 개의 초장거리 직선 끝에 급브레이크 구간이 기다리는 우주 코스. 펜스가 없어 헤어핀에서 밀려나면 그대로 추락한다.',
      sky: ['#05030f', '#150b2e'],
      fog: '#0a0618',
      offroadName: '허공',
      layout: [
        ['s', 2500], ['r', 230, 90],            // 대직선 → 급브레이크
        ['s', 1200], ['r', 240, 90],
        ['s', 1900],                            // 두 번째 대직선
        ['r', 170, 155],                        // 헤어핀
        ['s', 650],  ['l', 430, 85],
        ['s', 950],  ['l', 380, 75],
        ['s', 800],  ['r', 210, 95],
        ['s', 700],  ['r', 420, 90]
      ],
      boostCount: 4,
      boxRows: 4,
      shoulder: 40,
      hazard: null,
      voidOffroad: true
    },
    {
      id: 'bowser',
      name: '쿠파 성',
      subtitle: "Bowser's Castle",
      difficulty: 3,
      laps: 3,
      width: 150,
      theme: 'bowser',
      heading: 0,
      desc: '직각 코너와 두 번의 스위치백이 이어지는 테크니컬 코스. 성문을 관통하는 긴 직선 구간에는 쿵쿵이가 내려찍는다.',
      sky: ['#1a0a08', '#5a1e10'],
      fog: '#3a120c',
      offroadName: '용암',
      layout: [
        ['s', 1500], ['r', 160, 95],            // 직각 1
        ['s', 880],  ['r', 145, 170],           // 스위치백 1
        ['s', 660],  ['l', 190, 110],
        ['s', 1120], ['r', 200, 100],
        ['s', 520],  ['l', 145, 165],           // 스위치백 2 (반대 방향)
        ['s', 820],  ['r', 210, 85],
        ['s', 1560],                            // 성문 대직선
        ['r', 170, 95],
        ['s', 600],  ['l', 240, 65], ['r', 240, 65],
        ['s', 880],  ['r', 230, 90]
      ],
      boostCount: 3,
      boxRows: 4,
      shoulder: 40,
      hazard: 'thwomp',
      lavaOffroad: true
    }
  ];

  /* 표면 코드 */
  const SURFACE = { VOID: 0, ROAD: 1, OFFROAD: 2, KERB: 3, BOOST: 4, LAVA: 5, WALL: 6 };

  global.GameData = {
    STAT_KEYS, STAT_LABEL, CHARACTERS, FRAMES, WHEELS, GLIDERS,
    ITEMS, ITEM_WEIGHTS, TRACKS, SURFACE
  };
})(window);
