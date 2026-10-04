# p2p-topview-multiplayer

WebRTC 데이터 채널 위에서 동작하는 **탑뷰(top-view) 멀티플레이어 게임 프레임워크**입니다.
서버는 시그널링과 정적 파일 제공만 담당하고, 실제 게임 트래픽은 전부 P2P로 흐릅니다.

```
브라우저 A ──┐   (WebSocket: SDP/ICE 중계만)   ┌── 브라우저 B
             ├──────► 시그널링 서버 ◄──────────┤
             └───────── WebRTC DataChannel ────┘   ← 게임 트래픽은 여기로
```

## 핵심 설계

| 문제 | 이 프레임워크의 해법 |
| --- | --- |
| 누가 진실을 결정하는가 | **호스트 권위 모델**. 방의 한 피어가 호스트가 되어 월드를 시뮬레이션하고 스냅샷을 뿌립니다. |
| 내 조작이 굼뜨게 느껴짐 | **클라이언트 예측 + 서버 보정**. 입력을 즉시 로컬에 적용하고, 호스트가 확인해 준 입력만 버린 뒤 나머지를 재생(replay)합니다. |
| 남들이 끊겨 보임 | **엔티티 보간**. 스냅샷을 100ms 버퍼링해 두 스냅샷 사이를 보간하여 그립니다. |
| 호스트가 나가면 | **호스트 마이그레이션**. 서버가 다음 피어를 승격하고, 새 호스트는 마지막 스냅샷으로 월드를 이어받습니다. |
| 패킷 손실 | 스냅샷·입력은 **비신뢰/비순서 채널**(`state`), 참가·채팅 등 1회성 메시지는 **신뢰 채널**(`events`). |

## 실행

```bash
npm install
npm start            # http://localhost:8080
npm test             # 유닛 테스트 (node --test)
```

브라우저에서 `http://localhost:8080` → **Play the arena example**.
같은 room 이름으로 다른 탭이나 다른 기기에서 열면 바로 함께 플레이됩니다.

## 게임 모듈 만들기

프레임워크에 넘기는 "게임"은 훅(hook)을 가진 평범한 객체입니다.
`examples/arena/game.js`가 전체 계약을 사용하는 완성된 예제입니다.

```js
import { TopViewGame, TileMap } from '/src/framework.js';

const myGame = {
  tickRate: 30,

  createMap: () => TileMap.generate({ width: 40, height: 30, seed: 1 }),

  createPlayer(ctx, { id, owner, name }) {
    const spot = ctx.world.randomSpawn(ctx.random, 12);
    return { id, type: 'player', x: spot.x, y: spot.y, angle: 0, r: 12, hp: 100 };
  },

  // 결정론적이어야 합니다: 호스트에서 실행되고, 소유자 클라이언트가 보정 중
  // 그대로 재생합니다. 인자와 맵 외의 것에 의존하면 예측이 어긋납니다.
  applyInput(entity, cmd, dt, ctx) {
    const moved = ctx.map.moveCircle(entity.x, entity.y, entity.r, cmd.mx * 200 * dt, cmd.my * 200 * dt);
    entity.x = moved.x;
    entity.y = moved.y;
    entity.angle = cmd.aim;
  },

  // 호스트에서만 실행: 총알, 피해, 리스폰, 점수 등 권위가 필요한 로직
  step(ctx, dt, tick) {},

  draw(renderer, ctx) {
    for (const e of ctx.entities) renderer.drawActor(e, { color: '#4ea1ff' });
  },
};

new TopViewGame(myGame, { canvas, room: 'lobby', name: 'me' }).connect();
```

### 훅 요약

| 훅 | 실행 위치 | 역할 |
| --- | --- | --- |
| `createMap()` | 호스트 | `TileMap` 생성 (클라이언트에는 자동 전송) |
| `createState(ctx)` | 호스트 | 게임 고유 공유 상태 초기화 |
| `createPlayer(ctx, info)` | 호스트 | 플레이어 엔티티 생성 |
| `applyInput(e, cmd, dt, ctx)` | 호스트 + 소유 클라이언트 | **결정론적** 이동/조준 |
| `step(ctx, dt, tick)` | 호스트 | 권위 로직 (전투·스폰·점수) |
| `serialize(entity)` | 호스트 | 스냅샷에 담을 필드만 추리기 |
| `serializeState(ctx)` / `applyState(ctx, data)` | 호스트 / 클라이언트 | 엔티티가 아닌 공유 상태 복제 |
| `draw(renderer, ctx)` | 전원 | 프레임마다 그리기 |
| `hud(ctx)` | 전원 | 화면 좌상단 텍스트 줄 |

`ctx`에는 `world`, `map`, `state`, `random`, `isHost`, `localId`, `localEntityId`,
`players`, `entities`(이번 프레임에 그릴 엔티티), `camera`, `emit(name, data)`가 들어 있습니다.

### 예측이 깨지지 않게 하려면

`applyInput`은 호스트와 클라이언트 양쪽에서 같은 입력에 대해 같은 결과를 내야 합니다.
따라서 그 안에서 `Math.random()`, `Date.now()`, 엔티티 생성, 다른 플레이어 상태 변경을 하지 마세요.
그런 로직은 전부 `step`(호스트 전용)에 두고, `applyInput`은 의도만 기록하면 됩니다
(arena 예제에서 `entity.fire = cmd.action`으로 표시만 하고 총알 생성은 `step`에서 하는 이유입니다).

## 구조

```
server/
  index.js         시그널링(WebSocket) + 정적 파일 서버
  rooms.js         방/호스트 레지스트리
src/
  framework.js     TopViewGame — 전체를 엮는 런타임
  core/            loop(고정 timestep), input, math(결정론적 PRNG 포함), emitter
  net/             mesh(풀 메시), peer(RTCPeerConnection + 2채널), signaling-client, protocol
  game/            world/tilemap(원-타일 충돌), prediction, interpolation
  render/          renderer(캔버스 2D), camera
examples/arena/    데스매치 예제 게임
test/              유닛 테스트
```

## 네트워크 메시지

| 메시지 | 방향 | 채널 |
| --- | --- | --- |
| `hello` | 클라이언트 → 호스트 | events |
| `sync` (map·seed·roster) | 호스트 → 클라이언트 | events |
| `input` | 클라이언트 → 호스트 | state |
| `snap` (엔티티 + ack) | 호스트 → 전원 | state |
| `event` / `chat` | 임의 | events |

## 배포 시 참고

- 기본 ICE 설정은 공개 STUN 서버 하나만 씁니다. 대칭형 NAT 뒤의 사용자끼리 붙이려면
  `new TopViewGame(game, { iceServers: [...] })`로 TURN 서버를 넣어 주세요.
- 브라우저에서 WebRTC를 쓰려면 `localhost`가 아닌 곳에서는 HTTPS가 필요합니다.
- 풀 메시라서 피어 수가 늘면 연결이 O(n²)로 늘어납니다. 소규모 방(대략 2~8명)에 맞는 구조입니다.

## 라이선스

MIT

## Cyclical Value Backtest & Solana RWA Terminal

A separate, self-contained web app lives in [`cyclical-terminal/`](cyclical-terminal/README.md). It is a
normalized-earnings, point-in-time cyclical-stock screener and backtester (US / KOSPI / TSE) with Solana RWA token
mapping. See its README for setup and data-provenance notes.
