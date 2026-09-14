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
    /* ---- 경량급 ---- */
    {
      id: 'bbiyak', name: '삐약', cls: 'light', clsName: '경량급',
      stats: { speed: 2.0, accel: 5.0, weight: 1.5, handling: 4.75, offroad: 4.0 },
      colors: { body: '#f7d94a', accent: '#ffa726', trim: '#f26d3d', belly: '#fff3c4', detail: '#f2892e', eye: '#2a1d10' },
      desc: '경량 가속형. 피격 회복과 초반 가속이 가장 빠르다.',
      flavor: '고글을 이마에 걸친 노란 병아리 파일럿. 목에 두른 주황 스카프가 주행풍에 길게 날리고, 꽁지깃이 가속할 때마다 파르르 떨린다. 스타트 라인에서 가장 먼저 튀어나가는 쪽.'
    },
    {
      id: 'momo', name: '모모', cls: 'light', clsName: '경량급',
      stats: { speed: 1.75, accel: 5.25, weight: 1.25, handling: 5.0, offroad: 4.25 },
      colors: { body: '#f7ecf1', accent: '#f48fb1', trim: '#7ec8e3', belly: '#ffffff', detail: '#f4a8c0', eye: '#5a3550' },
      desc: '최경량. 코너 탈출 속도와 오프로드 복귀력이 뛰어나다.',
      flavor: '길게 늘어진 두 귀를 뒤로 눕히고 달리는 흰 토끼. 코너에서 귀가 원심력으로 바깥쪽으로 휘고, 둥근 꼬리가 시트 뒤로 삐져나와 있다.'
    },
    {
      id: 'volt', name: '볼트', cls: 'light', clsName: '경량급',
      stats: { speed: 2.75, accel: 4.5, weight: 2.5, handling: 4.25, offroad: 3.5 },
      colors: { body: '#c6d2e0', accent: '#35c8f0', trim: '#22364f', belly: '#8fa3ba', detail: '#7ef9ff', eye: '#7ef9ff' },
      desc: '경량급 중 최고속 지향. 안정적인 라인 유지가 강점.',
      flavor: '각진 금속 헤드에 가로로 긴 시안색 바이저를 단 소형 로봇. 머리 위 안테나 끝의 구슬이 속도에 비례해 밝게 점멸하고, 가슴 패널의 LED 게이지가 차오른다.'
    },
    /* ---- 중형급 ---- */
    {
      id: 'koko', name: '코코', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.5, accel: 3.5, weight: 3.5, handling: 3.5, offroad: 3.0 },
      colors: { body: '#5fc46a', accent: '#3fa14a', trim: '#e8a13c', belly: '#f2e6b8', detail: '#e8a13c', eye: '#20341f' },
      desc: '올라운더 중형급. 속도·가속·핸들링·무게가 모두 균형.',
      flavor: '둥근 주둥이와 커다란 눈을 가진 초록 아기 공룡. 등줄기를 따라 주황색 등지느러미가 세 갈래로 솟아 있고, 크림색 배가 시트 위로 볼록하다.'
    },
    {
      id: 'tango', name: '탱고', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.75, accel: 3.25, weight: 3.5, handling: 3.25, offroad: 3.25 },
      colors: { body: '#f08a3c', accent: '#d9662a', trim: '#3c4a66', belly: '#f8ead6', detail: '#ffffff', eye: '#3a2210' },
      desc: '중형급 속도형. 직선 구간에서 조금 더 뻗는다.',
      flavor: '가죽 파일럿 헬멧을 눌러쓴 주황 여우. 끝이 하얀 커다란 꼬리가 시트 뒤에서 균형추처럼 흔들리고, 귀 끝의 검은 털이 헬멧 밖으로 삐죽 나와 있다.'
    },
    {
      id: 'luna', name: '루나', cls: 'medium', clsName: '중형급',
      stats: { speed: 3.25, accel: 3.75, weight: 3.25, handling: 3.75, offroad: 3.25 },
      colors: { body: '#8b6fd6', accent: '#6b4fc4', trim: '#ffd54a', belly: '#efe6ff', detail: '#f4a8c0', eye: '#ffd54a' },
      desc: '중형급 핸들링형. 연속 코너 구간에서 라인이 깔끔하다.',
      flavor: '뾰족한 귀와 금빛 눈을 가진 보라 고양이. 목에 감은 노란 스카프가 나부끼고, 긴 꼬리가 코너 방향으로 먼저 기울며 무게 중심을 잡는다.'
    },
    /* ---- 중량급 ---- */
    {
      id: 'bumper', name: '범퍼', cls: 'heavy', clsName: '중량급',
      stats: { speed: 4.5, accel: 2.5, weight: 4.75, handling: 2.5, offroad: 2.75 },
      colors: { body: '#7d8ea3', accent: '#48607d', trim: '#e8e2d0', belly: '#9fb0c4', detail: '#e8e2d0', eye: '#20262e' },
      desc: '중량급. 충돌 시 밀어내는 힘이 강하고 최고속이 높다.',
      flavor: '콧등에 굵은 상아빛 뿔이 솟은 청회색 코뿔소. 어깨에 덧댄 철판 장갑이 충돌 자국으로 우그러져 있고, 핸들을 쥔 손이 그립을 삼킬 만큼 크다.'
    },
    {
      id: 'magma', name: '마그마', cls: 'heavy', clsName: '중량급',
      stats: { speed: 5.0, accel: 2.0, weight: 5.0, handling: 2.0, offroad: 2.5 },
      colors: { body: '#4a2f28', accent: '#ff5a1e', trim: '#2a1a16', belly: '#6b4438', detail: '#ff7a10', eye: '#ffca4a' },
      desc: '파워형 중량급. 최고 속도와 무게 최상, 가속·핸들링 최하.',
      flavor: '운전석을 가득 채우는 암석 골렘. 각진 현무암 표면의 갈라진 틈으로 용암이 흐르며 붉게 맥동하고, 정수리의 두 뿔은 열기에 그을려 끝이 검다. 브레이크를 밟을 때마다 관절 틈에서 불티가 새어 나온다.'
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
    bobomb:    { id: 'bobomb',    name: '폭탄',      icon: '💣', color: '#3a3a48', kind: 'shot',   desc: '착탄 시 광역 폭발 넉백' },
    bulletbill:{ id: 'bulletbill',name: '로켓',        icon: '🚀', color: '#2f2f38', kind: 'special',desc: '자동 주행 무적 돌진' },
    star:      { id: 'star',      name: '스타',        icon: '⭐', color: '#f7d13c', kind: 'special',desc: '7초간 무적 + 속도 상승' },
    spiny:     { id: 'spiny',     name: '스파이크 셸',   icon: '🌀', color: '#3f6fd0', kind: 'special',desc: '1위를 직격하는 유도 폭발' },
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
      name: '에메랄드 서킷',
      subtitle: 'Emerald Circuit',
      difficulty: 1,
      laps: 3,
      width: 168,
      theme: 'circuit',
      heading: 0,
      desc: '메인 스트레이트 끝의 고속 1코너, 최저속 헤어핀, 에스자와 시케인이 이어지는 정통 그랑프리 서킷. 잔디 오프로드라 실수해도 복귀할 수 있다.',
      sky: ['#63b7f0', '#bfe6ff'],
      fog: '#e2ecef',
      offroadName: '잔디',
      layout: [
        ['s', 4700], ['r', 480, 70],            // 메인 스트레이트 → 고속 1코너
        ['s', 1550], ['r', 230, 80],            // 2코너 중속
        ['s', 820],  ['r', 140, 170],           // 3코너 헤어핀 (최저속)
        ['s', 2500], ['l', 340, 60],            // 4코너 고속 좌
        ['s', 1850], ['r', 250, 85],
        ['s', 3150],                            // 백스트레이트
        ['l', 170, 55], ['r', 170, 55],         // 시케인
        ['s', 1400], ['l', 280, 55],
        ['s', 1100], ['r', 260, 60],            // 더블 에이펙스
        ['s', 920],  ['l', 260, 60],
        ['s', 1000], ['r', 340, 95],
        ['s', 860],  ['l', 260, 25]
      ],
      boostCount: 4,
      boxRows: 5,
      shoulder: 0,
      hazard: null
    },
    {
      id: 'rainbow',
      name: '프리즘 로드',
      subtitle: 'Prism Road',
      difficulty: 3,
      laps: 3,
      width: 150,
      theme: 'rainbow',
      heading: 0,
      desc: '두 개의 초장거리 직선 끝에 급브레이크 구간이 기다리는 우주 코스. 펜스가 없어 헤어핀에서 밀려나면 그대로 추락한다.',
      sky: ['#05030f', '#150b2e'],
      fog: '#120a24',
      offroadName: '허공',
      layout: [
        ['s', 2800], ['r', 230, 90],            // 대직선 → 급브레이크
        ['s', 1380], ['r', 240, 90],
        ['s', 2150],                            // 두 번째 대직선
        ['r', 170, 155],                        // 헤어핀
        ['s', 740],  ['l', 430, 85],
        ['s', 1080], ['l', 380, 75],
        ['s', 910],  ['r', 210, 95],
        ['s', 800],  ['r', 420, 90]
      ],
      boostCount: 5,
      boxRows: 5,
      shoulder: 40,
      hazard: null,
      voidOffroad: true
    },
    {
      id: 'bowser',
      name: '마그마 성채',
      subtitle: 'Magma Keep',
      difficulty: 3,
      laps: 3,
      width: 150,
      theme: 'bowser',
      heading: 0,
      desc: '직각 코너와 두 번의 스위치백이 이어지는 테크니컬 코스. 성문을 관통하는 긴 직선 구간에는 스톰퍼가 내려찍는다.',
      sky: ['#1a0a08', '#5a1e10'],
      fog: '#45190d',
      offroadName: '용암',
      layout: [
        ['s', 1700], ['r', 160, 95],            // 직각 1
        ['s', 1000], ['r', 145, 170],           // 스위치백 1
        ['s', 750],  ['l', 190, 110],
        ['s', 1280], ['r', 200, 100],
        ['s', 600],  ['l', 145, 165],           // 스위치백 2 (반대 방향)
        ['s', 940],  ['r', 210, 85],
        ['s', 1780],                            // 성문 대직선
        ['r', 170, 95],
        ['s', 690],  ['l', 240, 65], ['r', 240, 65],
        ['s', 1000], ['r', 230, 90]
      ],
      boostCount: 4,
      boxRows: 5,
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
